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
  SpecStep,
  WorkItemType,
} from "../src/types";

const DEFAULT_MODEL = "claude-sonnet-5";
const VALID_STEPS: SpecStep[] = ["brief", "workflow", "rules", "review"];

type ImageInput = { mediaType: string; data: string };

export type CoachRequestBody = {
  messages: {
    role: "user" | "coach" | "system";
    content: string;
    images?: ImageInput[];
  }[];
  workItemType?: WorkItemType;
  activeStep?: SpecStep;
  spec?: unknown;
};

const SUPPORTED_MEDIA = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export type RunCoachResult = {
  status: number;
  json: CoachTurnResponse | { error: string; message?: string; raw?: string };
};

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
  const activeStep: SpecStep = body.activeStep ?? "brief";

  const system = buildSystemPrompt({
    workItemType,
    activeStep,
    specSnapshot: body.spec ?? {},
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
      const validImages = images.filter((img) =>
        SUPPORTED_MEDIA.includes(img.mediaType),
      );

      if (validImages.length === 0) {
        return { role, content: m.content };
      }

      const blocks: Anthropic.ContentBlockParam[] = validImages.map((img) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType as
            | "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp",
          data: img.data,
        },
      }));
      if (m.content && m.content.trim().length > 0) {
        blocks.push({ type: "text", text: m.content });
      }
      return { role, content: blocks };
    });

  const client = new Anthropic({ apiKey });
  const model = process.env.COACH_MODEL ?? DEFAULT_MODEL;

  type ApiMessage = {
    role: "user" | "assistant";
    content: string | Anthropic.ContentBlockParam[];
  };

  async function generate(turns: ApiMessage[]): Promise<string> {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      thinking: { type: "disabled" }, // snappy, deterministic-shaped turns
      system,
      messages: turns,
    });
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
  if (parsed.ok) return { status: 200, json: parsed.value };

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
  if (parsed.ok) return { status: 200, json: parsed.value };

  // ── Still bad — fail loudly with the raw output so prompt failures are visible. ──
  return {
    status: 502,
    json: { error: "coach_invalid_json", message: parsed.message, raw: retryText },
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

  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    // Tolerant fallback: the model may have wrapped the JSON in prose. Pull the
    // first balanced {...} object out and try that before giving up.
    const extracted = extractBalancedObject(cleaned);
    if (extracted === null) {
      return { ok: false, message: "No JSON object found in the model output." };
    }
    try {
      obj = JSON.parse(extracted);
    } catch (err) {
      return { ok: false, message: `Not valid JSON: ${(err as Error).message}` };
    }
  }

  if (typeof obj !== "object" || obj === null) {
    return { ok: false, message: "Top-level value is not an object." };
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.reply !== "string") {
    return { ok: false, message: "Missing/invalid 'reply' (string)." };
  }
  if (typeof o.activeStep !== "string" || !VALID_STEPS.includes(o.activeStep as SpecStep)) {
    return { ok: false, message: "Missing/invalid 'activeStep'." };
  }
  if (typeof o.specUpdates !== "object" || o.specUpdates === null) {
    return { ok: false, message: "Missing/invalid 'specUpdates' (object)." };
  }
  if (typeof o.guidePanel !== "object" || o.guidePanel === null) {
    return { ok: false, message: "Missing/invalid 'guidePanel' (object)." };
  }
  if (!Array.isArray(o.activityEvents)) {
    return { ok: false, message: "Missing/invalid 'activityEvents' (array)." };
  }

  return { ok: true, value: obj as CoachTurnResponse };
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
