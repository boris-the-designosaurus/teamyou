// Serverless function: holds the LLM API key and proxies the call to Claude.
// - runCoach(body) is the transport-agnostic core (used by the Vite dev
//   middleware in vite.config.ts).
// - The default export is a Vercel-style handler for production deploys.
//
// Coach responses are real (not scripted). If the model's output does not parse
// as valid JSON we fail LOUDLY (HTTP 502 with the raw output) rather than
// swallow it — so prompt failures are visible in dev.

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./coachPrompt";
import type {
  CoachTurnResponse,
  FlowStep,
  WorkItemType,
  WorkMode,
} from "../src/types";
import { FLOW_STEPS, FLOW_STEP_LABEL } from "../src/types";
import { checkReplyStyle, styleCorrectionPrompt } from "./replyStyle";
import { checkTurnPolicy, turnPolicyCorrectionPrompt } from "./turnPolicy";

const DEFAULT_MODEL = "claude-sonnet-5";
const VALID_STEPS: FlowStep[] = FLOW_STEPS;
const PATTERN_SEARCH_STEPS = new Set<FlowStep>([
  "set_criteria",
  "find_patterns",
  "review_shortlist",
]);
// Display labels for the active step — used to synthesize a minimal guidePanel
// when the model omits one (so a missing container never fails the whole turn).
const STEP_TITLES: Record<FlowStep, string> = FLOW_STEP_LABEL;

// The client sends the full data URL; the media type is parsed FROM it so it
// always matches the bytes (an older { mediaType, data } shape is still accepted
// for backward compatibility).
type ImageInput = {
  id?: string;
  name?: string;
  dataUrl?: string;
  mediaType?: string;
  data?: string;
};

export type CoachRequestBody = {
  messages: {
    role: "user" | "coach" | "system";
    content: string;
    images?: ImageInput[];
  }[];
  workItemType?: WorkItemType;
  workMode?: WorkMode;
  activeStep?: FlowStep;
  spec?: unknown;
  // A one-turn, code-injected instruction (e.g. the same-step-ask streak
  // gate) — not part of the persisted transcript.
  nudge?: string;
};

const SUPPORTED_MEDIA = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// Parse an image input into a validated { mediaType, data } base64 source, or
// null if it isn't a supported base64 data URL (blob:, svg, path, etc.).
function toImageSource(
  img: ImageInput,
): { mediaType: string; data: string } | null {
  const url = img.dataUrl ?? "";
  const m = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (m) {
    const mediaType = m[1].toLowerCase();
    return SUPPORTED_MEDIA.includes(mediaType) ? { mediaType, data: m[2] } : null;
  }
  // Legacy shape: { mediaType, data }. Only if base64 (never a blob/path).
  if (
    img.mediaType &&
    img.data &&
    SUPPORTED_MEDIA.includes(img.mediaType) &&
    !img.data.startsWith("blob:") &&
    !img.data.startsWith("data:")
  ) {
    return { mediaType: img.mediaType, data: img.data };
  }
  return null;
}

export type RunCoachResult = {
  status: number;
  json: CoachTurnResponse | { error: string; message?: string; raw?: string };
};

export function shouldEnablePatternWebSearch(
  activeStep: FlowStep,
  setting = process.env.PATTERN_WEB_SEARCH,
): boolean {
  return setting !== "false" && PATTERN_SEARCH_STEPS.has(activeStep);
}

export async function runCoach(body: CoachRequestBody): Promise<RunCoachResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      json: {
        error: "missing_api_key",
        message:
          "ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example) and restart the dev server.",
      },
    };
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return { status: 400, json: { error: "empty_messages" } };
  }

  const workItemType: WorkItemType = body.workItemType ?? "feature_spec";
  const workMode: WorkMode = body.workMode ?? "fast_spec";
  const activeStep: FlowStep = body.activeStep ?? "understand_request";
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const latestAttachments = (latestUserMessage?.images ?? []).map((image, index) => ({
    id: image.id ?? `latest-${index + 1}`,
    name: image.name,
  }));

  const system = buildSystemPrompt({
    workItemType,
    workMode,
    activeStep,
    specSnapshot: body.spec ?? {},
    latestAttachments,
    nudge: body.nudge,
  });

  // Map our roles → Anthropic roles. coach → assistant; user turns may carry
  // screenshots (vision input) so their content becomes a block array.
  const apiMessages = messages
    .filter(
      (m) =>
        (m.content && m.content.trim().length > 0) ||
        (m.images && m.images.length > 0),
    )
    .map((m) => {
      const role = m.role === "coach" ? ("assistant" as const) : ("user" as const);

      // Only user turns carry images. A plain text turn stays a string.
      const images = role === "user" ? (m.images ?? []) : [];
      const sources = images
        .map(toImageSource)
        .filter((s): s is { mediaType: string; data: string } => s !== null);

      if (sources.length === 0) {
        return { role, content: m.content };
      }

      const blocks: Anthropic.ContentBlockParam[] = sources.map((s) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: s.mediaType as
            | "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp",
          data: s.data,
        },
      }));
      if (m.content && m.content.trim().length > 0) {
        blocks.push({ type: "text", text: m.content });
      }
      return { role, content: blocks };
    });

  const client = new Anthropic({ apiKey });
  const model = process.env.COACH_MODEL ?? DEFAULT_MODEL;
  const patternWebSearch = shouldEnablePatternWebSearch(activeStep);

  async function generate(turns: ApiMessage[]): Promise<string> {
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 4096,
      thinking: { type: "disabled" }, // snappy, deterministic-shaped turns
      system,
      messages: turns,
      ...(patternWebSearch
        ? {
            tools: [
              {
                type: "web_search_20250305" as const,
                name: "web_search" as const,
                max_uses: 3,
              },
            ],
          }
        : {}),
    };

    let response: Anthropic.Message;
    try {
      response = await client.messages.create(request);
    } catch (err) {
      // Some Anthropic workspaces/models may not have server web search enabled.
      // Keep coaching usable there, while leaving the missing visual obvious.
      if (!patternWebSearch || !(err instanceof Anthropic.APIError) || err.status !== 400) {
        throw err;
      }
      const { tools: _tools, ...withoutTools } = request;
      response = await client.messages.create(withoutTools);
    }
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  // ── First attempt ──
  let text: string;
  try {
    text = await generate(apiMessages);
  } catch (err) {
    return upstreamError(err);
  }

  let parsed = parseCoachTurn(text);
  if (parsed.ok)
    return withPolicyRetry(
      activeStep,
      apiMessages,
      text,
      parsed.value,
      generate,
      {
        latestAttachmentCount: latestAttachments.length,
        latestUserText: latestUserMessage?.content ?? "",
        workItemType,
        specSnapshot: body.spec,
        patternWebSearchEnabled: patternWebSearch,
      },
    );

  // ── One automatic retry: echo the bad output back and demand JSON only. This
  //    reliably recovers turns where the model answered in prose (e.g. a meta or
  //    off-topic question) despite the contract. ──
  let retryText: string;
  try {
    retryText = await generate([
      ...apiMessages,
      { role: "assistant", content: text },
      {
        role: "user",
        content:
          "That response was not valid JSON and could not be parsed. Re-send the SAME turn as exactly one JSON object matching the required contract — no prose, no markdown fences, nothing outside the JSON. If it was an off-topic or meta question, put your answer in the \"reply\" field.",
      },
    ]);
  } catch (err) {
    return upstreamError(err);
  }

  parsed = parseCoachTurn(retryText);
  if (parsed.ok)
    return withPolicyRetry(
      activeStep,
      apiMessages,
      retryText,
      parsed.value,
      generate,
      {
        latestAttachmentCount: latestAttachments.length,
        latestUserText: latestUserMessage?.content ?? "",
        workItemType,
        specSnapshot: body.spec,
        patternWebSearchEnabled: patternWebSearch,
      },
    );

  // ── Still bad — fail loudly with the raw output so prompt failures are visible. ──
  return {
    status: 502,
    json: { error: "coach_invalid_json", message: parsed.message, raw: retryText },
  };
}

export type ApiMessage = {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlockParam[];
};

function repairAdvancedTurnQuestionGate(
  previousStep: FlowStep,
  turn: CoachTurnResponse,
  policyReasons: string[],
): CoachTurnResponse | null {
  const advanced =
    FLOW_STEPS.indexOf(turn.activeStep) > FLOW_STEPS.indexOf(previousStep);
  const need = turn.guidePanel.need?.trim();
  const nextPrompt = turn.guidePanel.nextPrompt?.trim();

  if (
    !advanced ||
    !need ||
    !nextPrompt ||
    !turn.stepGate ||
    turn.stepGate.disposition === "ask" ||
    !policyReasons.some((reason) =>
      reason.includes("nonblocking") &&
      reason.includes("still asks for confirmation or more information"),
    )
  ) {
    return null;
  }

  return {
    ...turn,
    stepGate: {
      linkedDecision: need,
      blocking: true,
      disposition: "ask",
    },
  };
}

function repairCompletedPortfolioRequest(
  previousStep: FlowStep,
  turn: CoachTurnResponse,
  policyReasons: string[],
  policyContext: import("./turnPolicy").TurnPolicyContext,
): CoachTurnResponse | null {
  if (
    previousStep !== "understand_request" ||
    turn.activeStep !== "understand_request" ||
    policyContext.workItemType !== "design_project" ||
    !policyReasons.some((reason) =>
      reason.includes("request goal and context were captured"),
    )
  ) {
    return null;
  }

  const snapshotBrief =
    policyContext.specSnapshot &&
    typeof policyContext.specSnapshot === "object" &&
    "brief" in policyContext.specSnapshot &&
    policyContext.specSnapshot.brief &&
    typeof policyContext.specSnapshot.brief === "object"
      ? (policyContext.specSnapshot.brief as Record<string, unknown>)
      : {};
  const goal = turn.specUpdates.brief?.goal ?? snapshotBrief.goal;
  const productContext =
    turn.specUpdates.brief?.productContext ?? snapshotBrief.productContext;
  const portfolioContext = `${typeof goal === "string" ? goal : ""} ${
    typeof productContext === "string" ? productContext : ""
  }`;

  if (!/portfolio/i.test(portfolioContext)) return null;

  const nextPrompt =
    "What is actually preventing the portfolio from helping you win that work?";

  return {
    ...turn,
    reply:
      "**The target work is already clear enough to proceed.** " + nextPrompt,
    activeStep: "define_problem",
    stepGate: {
      linkedDecision: "The hiring barrier the portfolio must remove",
      blocking: true,
      disposition: "ask",
    },
    guidePanel: {
      title: STEP_TITLES.define_problem,
      captured: [],
      need: "Hiring barrier",
      nextPrompt,
      priorSummary:
        typeof goal === "string" ? `Target work: ${goal}` : undefined,
    },
    activityEvents: [
      ...turn.activityEvents.filter((event) => event.type !== "step_changed"),
      {
        type: "step_changed",
        importance: "milestone",
        label: "Moved to Define the problem",
      },
    ],
    quickReplies: [],
    recommendedQuickReply: undefined,
  };
}

/**
 * Generate wireframes is a button action, not an open-ended coaching turn.
 * If the model spends both retries discussing the selection, synthesize a
 * small drawable comparison from the selected pattern records instead of
 * surfacing a policy error. The renderer still owns the pixels; this merely
 * guarantees the structural data the action promises.
 */
function repairGenerateWireframes(
  turn: CoachTurnResponse,
  policyReasons: string[],
  policyContext: import("./turnPolicy").TurnPolicyContext,
): CoachTurnResponse | null {
  if (
    !policyReasons.some((reason) =>
      reason.includes("Generate wireframes action must immediately return"),
    )
  ) {
    return null;
  }

  const snapshot =
    policyContext.specSnapshot && typeof policyContext.specSnapshot === "object"
      ? (policyContext.specSnapshot as Record<string, unknown>)
      : {};
  const allArtifacts = Array.isArray(snapshot.milestoneArtifacts)
    ? snapshot.milestoneArtifacts.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && item.kind === "pattern_shortlist",
      )
    : [];
  const selected = allArtifacts.filter((item) => item.status === "selected");
  const patterns = (selected.length > 0 ? selected : allArtifacts.slice(-2)).slice(0, 2);
  const requestedTitle = (policyContext.latestUserText ?? "")
    .replace(/^\s*Generate wireframes for:\s*/i, "")
    .trim();
  if (patterns.length === 0) {
    patterns.push({
      title: requestedTitle || "Selected pattern",
      supportingLine: "Turns the selected structure into a concrete direction.",
      ingredients: [],
    });
  }

  const snapshotText = JSON.stringify(snapshot);
  const portfolio = /portfolio|case stud(?:y|ies)|hiring manager/i.test(snapshotText);
  const modal = /modal|dialog|offer|upgrade|trial/i.test(snapshotText);
  const variants = [
    {
      label: "Proof-first",
      headline: portfolio
        ? "Measurable impact, before the scroll"
        : "See the value before you commit",
      body: portfolio
        ? "Lead with the strongest outcome, then make the designer's role and decisions easy to scan."
        : "Show what will happen, why it helps, and what remains under the user's control.",
      primaryAction: portfolio ? "View project" : "Try it",
      secondaryAction: portfolio ? "View résumé" : "Not now",
      fallbackBlocks: portfolio
        ? ["Outcome proof", "Role + contribution", "Project preview"]
        : ["Task preview", "Expected result", "Review before applying"],
    },
    {
      label: "Narrative-first",
      headline: portfolio
        ? "The decisions behind the outcome"
        : "Keep control while the work gets done",
      body: portfolio
        ? "Open with a concise point of view, then connect process decisions to visible results."
        : "Explain the workflow in sequence and make the approval point unmistakable.",
      primaryAction: portfolio ? "Read case study" : "Preview changes",
      secondaryAction: portfolio ? "Contact me" : "Keep doing it manually",
      fallbackBlocks: portfolio
        ? ["Problem framing", "Decision trail", "Measured outcome"]
        : ["What the agent does", "What you review", "What happens next"],
    },
  ];
  const existingNonWireframes = (turn.specUpdates.milestoneArtifacts ?? []).filter(
    (artifact) => artifact.kind !== "wireframe",
  );
  const wireframes = variants.map((variant, index) => {
    const pattern = patterns[index % patterns.length];
    const patternTitle =
      typeof pattern.title === "string" && pattern.title.trim()
        ? pattern.title.trim()
        : requestedTitle || "Selected pattern";
    const patternIngredients = Array.isArray(pattern.ingredients)
      ? pattern.ingredients.filter((item): item is string => typeof item === "string")
      : [];
    const blocks = [...patternIngredients, ...variant.fallbackBlocks].slice(0, 3);
    return {
      kind: "wireframe" as const,
      title: `Variation ${String.fromCharCode(65 + index)} — ${variant.label}`,
      status: "exploring" as const,
      supportingLine:
        typeof pattern.supportingLine === "string"
          ? pattern.supportingLine
          : variant.body,
      ingredients: blocks,
      wireframeSpec: {
        surface: portfolio ? ("page" as const) : modal ? ("modal" as const) : ("panel" as const),
        eyebrow: patternTitle,
        headline: variant.headline,
        body: variant.body,
        primaryAction: variant.primaryAction,
        secondaryAction: variant.secondaryAction,
        blocks,
      },
      step: "choose_direction" as const,
    };
  });

  return {
    ...turn,
    reply:
      `**Two drawable wireframe directions are ready** — both carry the selected pattern into a concrete structure. ` +
      `I'd start with ${wireframes[0].title} because it makes the primary proof and action fastest to scan; select either card or combine their useful ingredients.`,
    activeStep: "review_shortlist",
    stepGate: {
      linkedDecision: "Which wireframe direction to develop",
      blocking: false,
      disposition: "proceed",
    },
    specUpdates: {
      ...turn.specUpdates,
      milestoneArtifacts: [...existingNonWireframes, ...wireframes],
    },
    guidePanel: {
      title: STEP_TITLES.review_shortlist,
      captured: wireframes.map((wireframe) => wireframe.title),
      need: "",
      priorSummary: `Generated from: ${patterns
        .map((pattern) =>
          String(pattern.title ?? (requestedTitle || "Selected pattern")),
        )
        .join(" + ")}`,
    },
    activityEvents: [
      ...turn.activityEvents,
      {
        type: "milestone_captured",
        importance: "significant",
        label: "Generated 2 drawable wireframe directions",
      },
    ],
    quickReplies: [],
    recommendedQuickReply: undefined,
  };
}

/**
 * The decision-criticality gate's brevity contract, enforced as code: a
 * structurally-valid turn that violates the concise-reply rules (too long,
 * more than one question, headings/lists/tables) gets ONE regenerate retry —
 * never a client-side truncation/rewrite, per spec. If the retry doesn't
 * parse, the original structurally-valid turn is kept rather than losing a
 * good turn over a style nit.
 */
export async function withPolicyRetry(
  previousStep: FlowStep,
  apiMessages: ApiMessage[],
  rawText: string,
  turn: CoachTurnResponse,
  generate: (turns: ApiMessage[]) => Promise<string>,
  policyContext: import("./turnPolicy").TurnPolicyContext = {},
): Promise<RunCoachResult> {
  let candidateText = rawText;
  let candidate = turn;

  // A retry is not automatically trustworthy. Re-check the regenerated turn
  // and allow one stronger correction if the model simply relabels the same
  // drift as "blocking" again. Never return a known policy violation as a
  // successful coach turn.
  for (let attempt = 0; attempt < 2; attempt++) {
    const styleCheck = checkReplyStyle(
      candidate.reply,
      candidate.responseMode ?? "concise",
      { activeStep: candidate.activeStep },
    );
    const policyCheck = checkTurnPolicy(previousStep, candidate, policyContext);
    if (styleCheck.ok && policyCheck.ok) {
      return { status: 200, json: candidate };
    }

    const repairedQuestionGate = repairAdvancedTurnQuestionGate(
      previousStep,
      candidate,
      policyCheck.reasons,
    );
    if (repairedQuestionGate && styleCheck.ok) {
      const repairedPolicy = checkTurnPolicy(
        previousStep,
        repairedQuestionGate,
        policyContext,
      );
      if (repairedPolicy.ok) {
        return { status: 200, json: repairedQuestionGate };
      }
    }

    const repaired = repairCompletedPortfolioRequest(
      previousStep,
      candidate,
      policyCheck.reasons,
      policyContext,
    );
    if (repaired) {
      const repairedStyle = checkReplyStyle(
        repaired.reply,
        repaired.responseMode ?? "concise",
        { activeStep: repaired.activeStep },
      );
      const repairedPolicy = checkTurnPolicy(
        previousStep,
        repaired,
        policyContext,
      );
      if (repairedStyle.ok && repairedPolicy.ok) {
        return { status: 200, json: repaired };
      }
    }

    const repairedWireframes = repairGenerateWireframes(
      candidate,
      policyCheck.reasons,
      policyContext,
    );
    if (repairedWireframes) {
      const repairedStyle = checkReplyStyle(
        repairedWireframes.reply,
        repairedWireframes.responseMode ?? "concise",
        { activeStep: repairedWireframes.activeStep },
      );
      const repairedPolicy = checkTurnPolicy(
        previousStep,
        repairedWireframes,
        policyContext,
      );
      if (repairedStyle.ok && repairedPolicy.ok) {
        return { status: 200, json: repairedWireframes };
      }
    }

    const correction = [
      styleCheck.ok ? "" : styleCorrectionPrompt(styleCheck),
      policyCheck.ok ? "" : turnPolicyCorrectionPrompt(policyCheck),
      attempt === 0
        ? ""
        : "This is the final correction attempt. Do not relabel the same later-step question as blocking. Advance when the captured fields complete the current step.",
    ]
      .filter(Boolean)
      .join("\n\n");

    let retryText: string;
    try {
      retryText = await generate([
        ...apiMessages,
        { role: "assistant", content: candidateText },
        { role: "user", content: correction },
      ]);
    } catch (err) {
      return upstreamError(err);
    }

    const retryParsed = parseCoachTurn(retryText);
    if (!retryParsed.ok) {
      return {
        status: 502,
        json: {
          error: "coach_invalid_json",
          message: retryParsed.message,
          raw: retryText,
        },
      };
    }
    candidateText = retryText;
    candidate = retryParsed.value;
  }

  const finalStyle = checkReplyStyle(
    candidate.reply,
    candidate.responseMode ?? "concise",
    { activeStep: candidate.activeStep },
  );
  const finalPolicy = checkTurnPolicy(previousStep, candidate, policyContext);
  // The second correction is assigned at the end of the last loop iteration,
  // so it has not yet passed through the early success return above. Accept it
  // here when it now satisfies both contracts; otherwise a valid final retry
  // becomes a blank-message 502 with its good JSON shown as "raw output."
  if (finalStyle.ok && finalPolicy.ok) {
    return { status: 200, json: candidate };
  }
  return {
    status: 502,
    json: {
      error: "coach_policy_violation",
      message: [...finalStyle.reasons, ...finalPolicy.reasons].join("; "),
      raw: candidateText,
    },
  };
}

function upstreamError(err: unknown): RunCoachResult {
  return {
    status: 502,
    json: {
      error: "coach_upstream_error",
      message: err instanceof Error ? err.message : String(err),
    },
  };
}

type ParseResult =
  | { ok: true; value: CoachTurnResponse }
  | { ok: false; message: string };

export function parseCoachTurn(text: string): ParseResult {
  // Strip accidental markdown fences if the model added them despite instructions.
  const cleaned = stripFences(text);

  // Try, in order: the cleaned text; the same with stray control characters
  // inside string literals escaped (models sometimes emit a raw newline in
  // "reply", which JSON.parse rejects as a "bad control character"); then the
  // first balanced {...} object (in case prose wraps the JSON), also with the
  // control-char repair. This recovers a well-shaped-but-slightly-malformed turn
  // instead of failing the whole message with a hard 502.
  const extracted = extractBalancedObject(cleaned);
  const candidates = [cleaned];
  if (extracted !== null && extracted !== cleaned) candidates.push(extracted);

  let obj: unknown;
  let parsed = false;
  let lastError = "";
  for (const candidate of candidates) {
    for (const variant of [candidate, escapeControlCharsInStrings(candidate)]) {
      try {
        obj = JSON.parse(variant);
        parsed = true;
        break;
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    if (parsed) break;
  }

  if (!parsed) {
    return {
      ok: false,
      message:
        extracted === null
          ? "No JSON object found in the model output."
          : `Not valid JSON: ${lastError}`,
    };
  }

  if (typeof obj !== "object" || obj === null) {
    return { ok: false, message: "Top-level value is not an object." };
  }
  const o = obj as Record<string, unknown>;

  // Hard requirements — the SUBSTANCE of a turn. Only these can fail a turn.
  if (typeof o.reply !== "string") {
    return { ok: false, message: "Missing/invalid 'reply' (string)." };
  }
  if (typeof o.activeStep !== "string" || !VALID_STEPS.includes(o.activeStep as FlowStep)) {
    return { ok: false, message: "Missing/invalid 'activeStep'." };
  }

  // Presentational / delta containers — DEFAULT them instead of failing the whole
  // turn. A model that omits guidePanel or activityEvents shouldn't cost the user
  // their reply and captured spec updates; the Guide falls back to spec-derived
  // content when hints are absent.
  const isPlainObject = (v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isPlainObject(o.specUpdates)) o.specUpdates = {};
  // Recover a useful brief when the model follows the semantic instruction but
  // accidentally places evidenceBrief beside specUpdates. The prompt requires
  // specUpdates.evidenceBrief; normalizing this small shape mistake preserves
  // the evidence report instead of silently dropping it after a valid turn.
  if (
    isPlainObject(o.evidenceBrief) &&
    !isPlainObject((o.specUpdates as Record<string, unknown>).evidenceBrief)
  ) {
    (o.specUpdates as Record<string, unknown>).evidenceBrief = o.evidenceBrief;
    delete o.evidenceBrief;
  }
  if (!isPlainObject(o.guidePanel)) {
    o.guidePanel = { title: STEP_TITLES[o.activeStep as FlowStep] };
  } else if (typeof (o.guidePanel as Record<string, unknown>).title !== "string") {
    (o.guidePanel as Record<string, unknown>).title =
      STEP_TITLES[o.activeStep as FlowStep];
  }
  if (!Array.isArray(o.activityEvents)) o.activityEvents = [];
  if (!Array.isArray(o.quickReplies)) o.quickReplies = [];
  // A recommendation is presentational guidance, not turn substance. Preserve
  // it only when it names one of the actual string quick replies; otherwise
  // drop it instead of failing an otherwise useful coach response.
  if (
    typeof o.recommendedQuickReply !== "string" ||
    !(o.quickReplies as unknown[]).some(
      (reply) => typeof reply === "string" && reply === o.recommendedQuickReply,
    )
  ) {
    delete o.recommendedQuickReply;
  }

  return { ok: true, value: o as unknown as CoachTurnResponse };
}

/**
 * Extract the first balanced top-level {...} object from a string, respecting
 * string literals and escapes so braces inside strings don't miscount. Returns
 * null if no complete object is found.
 */
export function extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Escape raw control characters that appear INSIDE JSON string literals. Models
 * occasionally emit a literal newline/tab inside a value (e.g. a multi-line
 * "reply"), which is invalid JSON — JSON.parse rejects it as a "bad control
 * character in string literal". This walks the text tracking string state and
 * escapes only in-string control chars, leaving structural whitespace between
 * tokens untouched.
 */
export function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out +=
          ch === "\n"
            ? "\\n"
            : ch === "\r"
              ? "\\r"
              : ch === "\t"
                ? "\\t"
                : ch === "\b"
                  ? "\\b"
                  : ch === "\f"
                    ? "\\f"
                    : "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      out += ch;
    } else {
      out += ch;
      if (ch === '"') inString = true;
    }
  }
  return out;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

// ── Vercel-style handler for production ──
export default async function handler(
  req: { method?: string; body?: unknown },
  res: {
    status: (code: number) => { json: (data: unknown) => void };
  },
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body =
    typeof req.body === "string" ? JSON.parse(req.body) : (req.body as CoachRequestBody);
  const result = await runCoach(body ?? { messages: [] });
  res.status(result.status).json(result.json);
}
