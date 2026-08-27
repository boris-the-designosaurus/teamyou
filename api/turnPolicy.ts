import { countQuestions } from "./replyStyle";
import {
  FLOW_STEPS,
  FLOW_STEP_LABEL,
  type CoachTurnResponse,
  type FlowStep,
  type WorkItemType,
} from "../src/types";
import { verifiedPortfolioSourcePrompt } from "./portfolioPatternSources";

export type TurnPolicyCheck = {
  ok: boolean;
  reasons: string[];
};

export type TurnPolicyContext = {
  latestAttachmentCount?: number;
  latestUserText?: string;
  workItemType?: WorkItemType;
  specSnapshot?: unknown;
  patternWebSearchEnabled?: boolean;
};

const QUESTION_LEAD = /^(what|whether|how|who|when|where|why|is|are|do|does|should|can|could|will|would)\b/i;
const EARLY_EVIDENCE_QUESTION =
  /\b(traffic(?:\s+(?:quality|source|sources))?|acquisition|distribution|analytics|page\s*views?|bounce\s*rate|engagement\s*rate|conversion\s*(?:rate|tracking)|impressions?|enough\s+(?:of\s+)?(?:the\s+)?right\s+\w+(?:\s+\w+){0,3}\s+(?:see|seeing|visit|visiting|reach|reaching))\b/i;
const PORTFOLIO_MESSAGE_QUESTION =
  /\bportfolio\b[^?]{0,100}\b(?:communicat\w*|messag\w*|say|position\w*|present\w*|lead\s+with)\b/i;
const SINGLE_PATTERN_GATE =
  /\bwhich\b[^?]{0,80}\b(?:should|do)\b[^?]{0,50}\b(?:develop(?:\s+further)?|choose|pursue|take\s+forward|move\s+forward)\b/i;
const FLEXIBLE_PATTERN_SELECTION =
  /\b(?:select|choose)\s+(?:one\s+or\s+more|any|multiple|several)\b/i;
const GROUNDED_PATTERN_RECOMMENDATION =
  /\b(?:recommend(?:ed|ing|ation)?|strongest fit|best fit|i(?:'d|’d| would) (?:anchor on|start (?:with|there)|lead with|go with)|my (?:recommendation|pick|choice) is)\b/i;
const STRATEGIC_EMPHASIS = /\*\*[^*\n]+\*\*/;
const ATTACHMENT_GROUNDING =
  /\b(screenshots?|images?|pdfs?|documents?|uploads?|uploaded|wireframes?|reference|comparison|current (?:page|screen|site|portfolio)|shown|visible|looking at|based on what (?:is|you've) shown)\b/i;
const DATA_ARTIFACT =
  /\b(?:ga4|google analytics|analytics dashboard|dashboard|chart|graph|spreadsheet|report)\b/i;
const DATA_ARTIFACT_OBSERVATION =
  /\b(?:shows?|confirms?|indicates?|records?|reports?|reveals?|lists?|contains?)\b/i;
const AGGREGATOR_REFERENCE_TITLE =
  /(?:\bhow to\b|\b(?:best|top|ultimate)\b.*\b(?:portfolio|case stud(?:y|ies)|examples?)\b|\bexamples? that\b|\broundup\b|\binspiration\b|\btemplates?\b|\b(?:portfolio|case stud(?:y|ies))\s+(?:guide|examples?)\b|\bguide to\b|\bportfolio builder\b)/i;
const EDITORIAL_REFERENCE_PATH =
  /\/(?:blog|blogs|article|articles|guide|guides|resource|resources|template|templates|inspiration|learn)(?:\/|$)/i;
const PORTFOLIO_CONTENT_VENDOR_HOST =
  /(?:^|\.)(?:uxfol\.io|tailorcv\.com|productic\.net|careerfoundry\.com|interaction-design\.org|designlab\.com|toptal\.com|medium\.com|substack\.com)$/i;
const PORTFOLIO_CONTEXT =
  /\b(?:portfolio|case stud(?:y|ies)|hiring manager|design lead|product design(?:er)? job)\b/i;
const FRESH_PATTERN_REQUEST =
  /\b(?:generate|find|search|retrieve|replace|regenerate|refresh)\b[\s\S]{0,40}\b(?:fresh|new|different|more)?\s*(?:patterns?|pattern cards?|shortlist|examples?)\b/i;
const GENERATE_WIREFRAMES_REQUEST = /^\s*Generate wireframes\b/i;
const PROPOSE_HIFI_REQUEST =
  /\b(?:ready to propose|propose|generate|create|show)\b[\s\S]{0,50}\b(?:hi[- ]?fi|high[- ]?fidelity|visual treatments?|mockups?)\b/i;
const VISUAL_TREATMENT_CHOICE =
  /\b(?:visual|layout|wireframe|treatment|variation|version|hero|project card|card content|content format|metric|outcome)\b/i;

function groundsLatestAttachment(reply: string): boolean {
  return (
    ATTACHMENT_GROUNDING.test(reply) ||
    (DATA_ARTIFACT.test(reply) && DATA_ARTIFACT_OBSERVATION.test(reply))
  );
}

function turnGroundsLatestAttachment(turn: CoachTurnResponse): boolean {
  if (groundsLatestAttachment(turn.reply)) return true;

  const evidenceText = (turn.specUpdates.evidence ?? [])
    .map((item) => item.text)
    .join(" ");
  const evidenceBrief = turn.specUpdates.evidenceBrief;
  const evidenceBriefText = evidenceBrief
    ? [
        evidenceBrief.source ?? "",
        evidenceBrief.summary,
        ...(evidenceBrief.stats ?? []).map(
          (stat) => `${stat.label} ${stat.value}`,
        ),
      ].join(" ")
    : "";
  const structuredEvidenceText = `${evidenceText} ${evidenceBriefText}`;

  return (
    ATTACHMENT_GROUNDING.test(evidenceText) ||
    (DATA_ARTIFACT.test(structuredEvidenceText) &&
      ((evidenceBrief?.stats?.length ?? 0) > 0 ||
        (turn.specUpdates.evidence ?? []).some((item) => item.kind === "fact")))
  );
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedReferenceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return null;
  }
}

function isPortfolioPatternContext(context: TurnPolicyContext): boolean {
  let snapshotText = "";
  try {
    snapshotText = JSON.stringify(context.specSnapshot ?? {});
  } catch {
    snapshotText = "";
  }
  return PORTFOLIO_CONTEXT.test(
    `${context.latestUserText ?? ""} ${snapshotText}`,
  );
}

function isEditorialPortfolioReference(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      PORTFOLIO_CONTENT_VENDOR_HOST.test(url.hostname) ||
      EDITORIAL_REFERENCE_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function snapshotBriefValue(
  snapshot: unknown,
  key: "user" | "moment" | "task",
): unknown {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const brief = (snapshot as { brief?: unknown }).brief;
  if (!brief || typeof brief !== "object") return undefined;
  return (brief as Record<string, unknown>)[key];
}

function snapshotHasEvidenceBrief(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const evidenceBrief = (snapshot as { evidenceBrief?: unknown }).evidenceBrief;
  return !!evidenceBrief && typeof evidenceBrief === "object";
}

function snapshotHasPatternShortlist(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const artifacts = (snapshot as { milestoneArtifacts?: unknown }).milestoneArtifacts;
  return (
    Array.isArray(artifacts) &&
    artifacts.some(
      (artifact) =>
        !!artifact &&
        typeof artifact === "object" &&
        (artifact as { kind?: unknown }).kind === "pattern_shortlist",
    )
  );
}

function snapshotHasSelectedPattern(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const artifacts = (snapshot as { milestoneArtifacts?: unknown }).milestoneArtifacts;
  return (
    Array.isArray(artifacts) &&
    artifacts.some(
      (artifact) =>
        !!artifact &&
        typeof artifact === "object" &&
        (artifact as { kind?: unknown }).kind === "pattern_shortlist" &&
        (artifact as { status?: unknown }).status === "selected",
    )
  );
}

function turnHasDrawableWireframes(turn: CoachTurnResponse): boolean {
  const wireframes = (turn.specUpdates.milestoneArtifacts ?? []).filter(
    (artifact) => artifact.kind === "wireframe",
  );
  return (
    wireframes.length >= 2 &&
    wireframes.length <= 3 &&
    wireframes.every(
      (artifact) =>
        !!artifact.wireframeSpec &&
        hasText(artifact.wireframeSpec.headline) &&
        !!artifact.wireframeSpec.blocks?.length,
    )
  );
}

function turnHasDrawableHiFi(turn: CoachTurnResponse): boolean {
  const designs = (turn.specUpdates.milestoneArtifacts ?? []).filter(
    (artifact) => artifact.kind === "hifi_design",
  );
  return (
    designs.length >= 2 &&
    designs.length <= 3 &&
    designs.every(
      (artifact) =>
        !!artifact.wireframeSpec &&
        hasText(artifact.wireframeSpec.headline) &&
        !!artifact.wireframeSpec.blocks?.length,
    )
  );
}

function capturedBriefValue(
  turn: CoachTurnResponse,
  context: TurnPolicyContext,
  key: "user" | "moment" | "task",
): unknown {
  return turn.specUpdates.brief?.[key] ?? snapshotBriefValue(context.specSnapshot, key);
}

function stepHasRequiredCapture(
  step: FlowStep,
  turn: CoachTurnResponse,
  context: TurnPolicyContext,
): boolean {
  const brief = turn.specUpdates.brief;
  const snapshot = context.specSnapshot;
  const value = (key: "goal" | "productContext" | "assumedSolution" | "problem" | "user" | "moment" | "task") =>
    brief?.[key] ??
    (snapshot && typeof snapshot === "object" &&
    (snapshot as { brief?: Record<string, unknown> }).brief
      ? (snapshot as { brief: Record<string, unknown> }).brief[key]
      : undefined);

  if (step === "understand_request") {
    return hasText(value("goal")) &&
      (hasText(value("productContext")) || hasText(value("assumedSolution")));
  }
  if (step === "define_problem") return hasText(value("problem"));
  if (step === "identify_users") {
    return hasText(value("user")) && hasText(value("moment")) && hasText(value("task"));
  }
  return false;
}

/**
 * A few steps have a single canonical capture that is itself the exit signal.
 * If the model writes that capture but stays to ask another question, it has
 * contradicted its own structured output. Keep this deterministic rather than
 * trusting the model to label the extra question "nonblocking" correctly.
 */
function capturedStepExit(previousStep: FlowStep, turn: CoachTurnResponse): string | null {
  const brief = turn.specUpdates.brief;
  if (!brief) return null;

  if (
    previousStep === "understand_request" &&
    hasText(brief.goal) &&
    (hasText(brief.productContext) || hasText(brief.assumedSolution))
  ) {
    return "the request goal and context were captured";
  }
  if (previousStep === "define_problem" && hasText(brief.problem)) {
    return "a credible problem barrier was captured";
  }
  if (
    previousStep === "identify_users" &&
    hasText(brief.user) &&
    hasText(brief.moment) &&
    hasText(brief.task)
  ) {
    return "the user, moment, and task were captured";
  }
  if (previousStep === "find_root_cause" && hasText(brief.rootCause)) {
    return "a root-cause hypothesis was captured";
  }
  if (
    previousStep === "set_scope" &&
    hasText(brief.scopeIncluded) &&
    hasText(brief.scopeExcluded)
  ) {
    return "included and excluded scope were captured";
  }
  return null;
}

/**
 * Product-level boundary between the two primary surfaces:
 * - chat owns the actual coaching question and decision
 * - Guide owns a compact, scannable record of what is captured/still needed
 *
 * It also protects the fixed flow from model-generated regressions or jumps.
 * These checks intentionally cover structural facts we can know in code; the
 * prompt remains responsible for semantic judgment.
 */
export function checkTurnPolicy(
  previousStep: FlowStep,
  turn: CoachTurnResponse,
  context: TurnPolicyContext = {},
): TurnPolicyCheck {
  const reasons: string[] = [];
  const from = FLOW_STEPS.indexOf(previousStep);
  const to = FLOW_STEPS.indexOf(turn.activeStep);
  const generateWireframesTransition =
    snapshotHasSelectedPattern(context.specSnapshot) &&
    turnHasDrawableWireframes(turn) &&
    turn.activeStep === "choose_direction";

  if (to < from) {
    const reopened = turn.flowRevision
      ? FLOW_STEPS.indexOf(turn.flowRevision.reopenedStep)
      : -1;
    const validRevision =
      !!turn.flowRevision &&
      reopened >= 0 &&
      reopened < from &&
      to >= reopened &&
      to <= reopened + 1 &&
      hasText(turn.flowRevision.reason) &&
      turn.flowRevision.preservesExistingWork === true;

    if (!validRevision) {
      reasons.push(
        `activeStep regressed from "${previousStep}" to "${turn.activeStep}" without a valid user-authorized flowRevision`,
      );
    }
  } else if (to > from + 1) {
    const crossedSteps = FLOW_STEPS.slice(from, to);
    const incompleteSteps = crossedSteps.filter(
      (step) =>
        !(
          generateWireframesTransition &&
          (step === "find_patterns" || step === "review_shortlist")
        ) && !stepHasRequiredCapture(step, turn, context),
    );
    if (incompleteSteps.length > 0) {
      reasons.push(
        `activeStep skipped ahead from "${previousStep}" to "${turn.activeStep}" without capturing required data for: ${incompleteSteps.join(", ")}`,
      );
    }
  }

  if (to > from && !STRATEGIC_EMPHASIS.test(turn.reply)) {
    reasons.push(
      "a forward step transition must emphasize one short judgment or transition phrase with double asterisks",
    );
  }

  if (
    (context.latestAttachmentCount ?? 0) > 0 &&
    !turnGroundsLatestAttachment(turn)
  ) {
    reasons.push(
      "the latest user turn included attachments, but the reply does not ground an observation in what they show",
    );
  }

  const expectedTitle = FLOW_STEP_LABEL[turn.activeStep];
  if (turn.guidePanel.title !== expectedTitle) {
    reasons.push(
      `guidePanel.title is "${turn.guidePanel.title}" but the active step is "${expectedTitle}"`,
    );
  }

  const need = turn.guidePanel.need?.trim() ?? "";
  const nextPrompt = turn.guidePanel.nextPrompt?.trim() ?? "";
  const replyQuestions = countQuestions(turn.reply);
  // Some steps naturally ask for an artifact with a direct imperative rather
  // than a question mark ("share the link or screenshots here"). That is a
  // real user prompt, provided the reply names both the requested action and
  // the concrete input. Past-tense narration such as "the file was shared"
  // intentionally does not match.
  const replyRequestsInput =
    replyQuestions > 0 ||
    /\b(?:please\s+)?(?:share|upload|attach|paste|send|provide|select|choose|pick|describe)\b[^.!?]{0,120}\b(?:here|which|what|link|url|screenshots?|files?|option|version|direction|details?|response|build)\b/i.test(
      turn.reply,
    );
  const stayedOnStep = turn.activeStep === previousStep;
  const questionText = `${turn.reply}\n${nextPrompt}`;

  const quantitativeEvidenceRecords = (turn.specUpdates.evidence ?? []).filter(
    (item) => item.kind === "fact" && /\d/.test(item.text),
  );
  const latestUserSuppliedNumbers =
    previousStep === "assess_evidence" && /\d/.test(context.latestUserText ?? "");
  const replyReadNumbersFromScreenshot =
    previousStep === "assess_evidence" &&
    (context.latestAttachmentCount ?? 0) > 0 &&
    /\d/.test(turn.reply) &&
    groundsLatestAttachment(turn.reply);
  const quantitativeEvidenceTurn =
    previousStep === "assess_evidence" &&
    (latestUserSuppliedNumbers ||
      replyReadNumbersFromScreenshot ||
      quantitativeEvidenceRecords.length > 0);

  if (
    quantitativeEvidenceTurn &&
    quantitativeEvidenceRecords.length === 0
  ) {
    reasons.push(
      "the latest Assess evidence turn supplied quantitative evidence, so the turn must capture it as a numeric fact in specUpdates.evidence",
    );
  }
  if (
    quantitativeEvidenceTurn &&
    !turn.specUpdates.evidenceBrief &&
    !(quantitativeEvidenceRecords.length > 0 &&
      !latestUserSuppliedNumbers &&
      !replyReadNumbersFromScreenshot &&
      snapshotHasEvidenceBrief(context.specSnapshot))
  ) {
    reasons.push(
      "the latest Assess evidence turn supplied quantitative evidence, so the turn must create or refresh a project-appropriate evidenceBrief immediately",
    );
  }

  const inferablePortfolioJudgment =
    previousStep === "identify_users" &&
    context.workItemType === "design_project" &&
    hasText(capturedBriefValue(turn, context, "user")) &&
    hasText(capturedBriefValue(turn, context, "moment"));
  if (inferablePortfolioJudgment) {
    if (!hasText(capturedBriefValue(turn, context, "task"))) {
      reasons.push(
        "the portfolio visitor and moment are known, so the Coach must synthesize the inferable hiring judgment into brief.task before advancing",
      );
    }
    if (stayedOnStep && replyQuestions > 0) {
      reasons.push(
        "the portfolio judgment is inferable from the locked frame; recommend and capture one judgment instead of asking the designer to choose among overlapping evaluation dimensions",
      );
    }
  }
  const newPatterns = (turn.specUpdates.milestoneArtifacts ?? []).filter(
    (artifact) => artifact.kind === "pattern_shortlist",
  );
  const newWireframes = (turn.specUpdates.milestoneArtifacts ?? []).filter(
    (artifact) => artifact.kind === "wireframe",
  );
  const newHiFiDesigns = (turn.specUpdates.milestoneArtifacts ?? []).filter(
    (artifact) => artifact.kind === "hifi_design",
  );
  if (
    GENERATE_WIREFRAMES_REQUEST.test(context.latestUserText ?? "") &&
    (newWireframes.length < 2 ||
      newWireframes.some(
        (artifact) =>
          !artifact.wireframeSpec ||
          !hasText(artifact.wireframeSpec.headline) ||
          !(artifact.wireframeSpec.blocks?.length),
      ))
  ) {
    reasons.push(
      "the Generate wireframes action must immediately return 2-3 drawable wireframe artifacts with complete wireframeSpec data",
    );
  }
  if (
    PROPOSE_HIFI_REQUEST.test(context.latestUserText ?? "") &&
    (turn.activeStep !== "refine_treatments" ||
      newHiFiDesigns.length < 2 ||
      newHiFiDesigns.length > 3 ||
      newHiFiDesigns.some(
        (artifact) =>
          !artifact.wireframeSpec ||
          !hasText(artifact.wireframeSpec.headline) ||
          !(artifact.wireframeSpec.blocks?.length),
      ))
  ) {
    reasons.push(
      "the hi-fi proposal action must immediately show 2-3 drawable hifi_design alternatives before advancing to version review",
    );
  }
  const treatmentChoiceText = [
    context.latestUserText ?? "",
    turn.reply,
    turn.guidePanel.need ?? "",
    ...(turn.quickReplies ?? []),
  ].join(" ");
  if (
    previousStep === "refine_treatments" &&
    turn.activeStep === "refine_treatments" &&
    (turn.quickReplies?.length ?? 0) >= 2 &&
    VISUAL_TREATMENT_CHOICE.test(treatmentChoiceText) &&
    !turnHasDrawableWireframes(turn)
  ) {
    reasons.push(
      "a visual treatment choice must show 2-3 drawable wireframe artifacts instead of describing invisible alternatives in chat",
    );
  }
  if (
    FRESH_PATTERN_REQUEST.test(context.latestUserText ?? "") &&
    newPatterns.length < 3
  ) {
    reasons.push(
      "a fresh pattern request must return 3-5 new pattern_shortlist artifacts so the user can compare real alternatives",
    );
  }
  if (context.patternWebSearchEnabled && newPatterns.length >= 2) {
    const references = newPatterns.map((artifact) => ({
      url: hasText(artifact.sourceUrl)
        ? normalizedReferenceUrl(artifact.sourceUrl)
        : null,
      title: hasText(artifact.sourceTitle) ? artifact.sourceTitle.trim() : "",
    }));
    if (references.some((reference) => !reference.url || !reference.title)) {
      reasons.push(
        "retrieved pattern cards must each include an original public sourceUrl and sourceTitle so their example thumbnails can display",
      );
    }
    const validUrls = references
      .map((reference) => reference.url)
      .filter((url): url is string => url !== null);
    if (new Set(validUrls).size !== validUrls.length) {
      reasons.push(
        "retrieved pattern cards must use distinct original example pages instead of repeating one source thumbnail",
      );
    }
    if (references.some((reference) => AGGREGATOR_REFERENCE_TITLE.test(reference.title))) {
      reasons.push(
        "retrieved pattern thumbnails must show the original example, not a listicle, roundup, article, or tutorial about examples",
      );
    }
    if (
      isPortfolioPatternContext(context) &&
      references.some(
        (reference) =>
          !!reference.url && isEditorialPortfolioReference(reference.url),
      )
    ) {
      reasons.push(
        "portfolio pattern thumbnails must use a designer-owned live portfolio homepage or case-study page, not a blog, guide, template, roundup, portfolio builder, or vendor-content URL",
      );
    }
  }
  if (
    previousStep === "set_criteria" &&
    turn.activeStep === "find_patterns" &&
    newPatterns.length < 2
  ) {
    reasons.push(
      "the turn announces a pattern set but does not capture it as pattern_shortlist milestoneArtifacts, so the pattern cards cannot display in chat",
    );
  }
  const patternWorkspaceAvailable =
    newPatterns.length > 0 || snapshotHasPatternShortlist(context.specSnapshot);
  const performedPatternExploration =
    (turn.activeStep === "find_patterns" || turn.activeStep === "review_shortlist") &&
    patternWorkspaceAvailable &&
    replyQuestions === 0;
  const performedVisualTreatmentExploration =
    turn.activeStep === "refine_treatments" &&
    (turnHasDrawableWireframes(turn) || turnHasDrawableHiFi(turn)) &&
    replyQuestions === 0;

  // Framing is a guided conversation, so an acknowledgement-only turn is a
  // dead end even when the Guide happens to show the step as complete. The
  // Coach must ask the current step's blocking question or, after advancing,
  // the first high-leverage question for the immediate next step.
  const framingTurn =
    FLOW_STEPS.indexOf(previousStep) <= FLOW_STEPS.indexOf("define_outcome") ||
    FLOW_STEPS.indexOf(turn.activeStep) <= FLOW_STEPS.indexOf("define_outcome");
  if (framingTurn && replyQuestions === 0) {
    reasons.push(
      "the framing turn leaves the user without a prompt to continue; ask one consequential question for the returned activeStep",
    );
  }

  const exitSignal = capturedStepExit(previousStep, turn);
  if (stayedOnStep && exitSignal) {
    reasons.push(`${exitSignal}, so the turn must advance to the immediate next step`);
  }

  // Evidence/acquisition may be important later, but it can never become the
  // next question while the request or problem barrier is still being framed.
  // This catches the exact loophole where the model calls a later-step traffic
  // question "blocking" and thereby passes the generic stepGate consistency checks.
  if (
    (turn.activeStep === "understand_request" || turn.activeStep === "define_problem") &&
    replyQuestions > 0 &&
    EARLY_EVIDENCE_QUESTION.test(questionText)
  ) {
    reasons.push(
      `the question investigates traffic/evidence during "${turn.activeStep}"; capture it as a later risk and ask only for this step's missing substance`,
    );
  }

  // A portfolio's message is a later content-direction decision. When the
  // business request only says "freelance or contract work," Understand the
  // request first needs the kind of work/offer the site is meant to win.
  if (
    turn.activeStep === "understand_request" &&
    replyQuestions > 0 &&
    PORTFOLIO_MESSAGE_QUESTION.test(questionText)
  ) {
    reasons.push(
      "the question jumps to portfolio messaging during Understand the request; ask what target work the site must help win first",
    );
  }

  if (turn.stepGate) {
    const isAsk = turn.stepGate.disposition === "ask";
    if (isAsk && !turn.stepGate.blocking) {
      reasons.push('stepGate disposition is "ask" but blocking is false');
    }
    if (!isAsk && turn.stepGate.blocking) {
      reasons.push(
        `stepGate disposition is "${turn.stepGate.disposition}" but blocking is true`,
      );
    }
    if (
      !isAsk &&
      stayedOnStep &&
      !performedPatternExploration &&
      !performedVisualTreatmentExploration
    ) {
      reasons.push(
        `the turn says the current step is nonblocking (${turn.stepGate.disposition}) but did not advance`,
      );
    }
    if (!isAsk && (need || nextPrompt || replyQuestions > 0)) {
      reasons.push(
        `the turn says the current step is nonblocking (${turn.stepGate.disposition}) but still asks for confirmation or more information`,
      );
    }
  }

  if (need) {
    const needWords = need.split(/\s+/).length;
    if (need.includes("?") || QUESTION_LEAD.test(need) || needWords > 6) {
      reasons.push("guidePanel.need must be a compact noun phrase, not the coaching question");
    }
    if (!nextPrompt) {
      reasons.push("guidePanel.need is present but guidePanel.nextPrompt is missing");
    }
    if (!replyRequestsInput) {
      reasons.push(
        "the Guide has an outstanding need, but the actual question was not asked in the chat reply",
      );
    }
  }

  if (nextPrompt && !need) {
    reasons.push("guidePanel.nextPrompt is present without a compact guidePanel.need label");
  }

  if (turn.activeStep === "understand_request" && /^target work$/i.test(need)) {
    const replies = turn.quickReplies ?? [];
    if (replies.length < 2 || replies.length > 3 || !replies.some((reply) => /not sure/i.test(reply))) {
      reasons.push(
        'a Target work question must provide two concrete starting points plus a "Not sure yet" option',
      );
    }
    if (turn.recommendedQuickReply) {
      reasons.push(
        "Target work cannot show a recommendation before the spec contains evidence that distinguishes the options",
      );
    }
  }

  if (turn.activeStep === "identify_users" && (turn.quickReplies ?? []).length > 0) {
    reasons.push(
      "Identify users and context must collect user + moment, then task, as free text; do not turn roles and moments into quick-reply alternatives",
    );
  }

  if (
    (turn.activeStep === "find_patterns" || turn.activeStep === "review_shortlist") &&
    SINGLE_PATTERN_GATE.test(turn.reply)
  ) {
    reasons.push(
      "pattern exploration cannot force a single direction; let the user select one or more, combine ingredients, request more, or add an example",
    );
  }

  if (newPatterns.length >= 2) {
    if (
      !GROUNDED_PATTERN_RECOMMENDATION.test(turn.reply)
    ) {
      reasons.push("a multi-pattern set must include one grounded recommendation");
    }
    if (!FLEXIBLE_PATTERN_SELECTION.test(turn.reply) || !/\bcombine\b/i.test(turn.reply)) {
      reasons.push(
        "a multi-pattern set must invite selecting one or more patterns and combining useful ingredients",
      );
    }
    if ((turn.quickReplies ?? []).length > 0) {
      reasons.push("pattern cards are the choices and must not be duplicated as quick replies");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function turnPolicyCorrectionPrompt(check: TurnPolicyCheck): string {
  if (
    check.reasons.some((reason) =>
      reason.includes("hi-fi proposal action must immediately show"),
    )
  ) {
    return (
      `The user asked to carry the selected wireframe into high-fidelity design, but you advanced with a blank or single text-only artifact. ` +
      `Re-send the SAME turn at refine_treatments with 2-3 visually distinct hifi_design milestoneArtifacts in specUpdates. ` +
      `Every artifact must include a complete wireframeSpec (surface, concrete headline/body/actions, and 2-4 blocks) so TeamYou can render the actual mockup without an external image URL. ` +
      `Preserve the selected wireframe's structure and locked content while varying visual hierarchy/treatment. Recommend one with a grounded reason, ` +
      `ask no question, keep quickReplies empty and guidePanel.need empty, and keep the workspace nonblocking so the visible designs are the choices. ` +
      `Do not advance to select_for_review until the user has seen and selected one of these designs.`
    );
  }
  if (
    check.reasons.some((reason) =>
      reason.includes("visual treatment choice must show"),
    )
  ) {
    return (
      `You asked the user to compare visual treatments that are not visible. Re-send the SAME turn with ` +
      `2-3 wireframe milestoneArtifacts at step refine_treatments, each with a complete wireframeSpec and a ` +
      `meaningfully different visible treatment of the chosen direction. Use the actual option labels and locked ` +
      `content in the rendered headlines, body, actions, and blocks. Recommend one with one grounded reason. ` +
      `Do not describe options that have no artifact, and do not duplicate the visual choice as quick replies; ` +
      `keep guidePanel.need empty and the workspace nonblocking because the visible cards are the choices.`
    );
  }
  if (
    check.reasons.some((reason) =>
      reason.includes("Generate wireframes action must immediately return"),
    )
  ) {
    return (
      `The user clicked Generate wireframes, but you returned discussion or text-only cards. Re-send the SAME turn ` +
      `with 2-3 structurally distinct wireframe milestoneArtifacts in specUpdates at step choose_direction. Every ` +
      `artifact must include wireframeSpec shaped like ` +
      `{"surface":"page","eyebrow":"Selected work","headline":"24% more bookings","body":"Short supporting copy","primaryAction":"View project","blocks":["Role + contribution","Outcome proof","Project teaser"]}. ` +
      `Use the selected patterns and locked project content; recommend one with one grounded reason; ask no question; ` +
      `keep quickReplies empty, guidePanel.need empty, and the step nonblocking so the cards themselves are the choice.`
    );
  }
  if (
    check.reasons.some((reason) =>
      reason.includes("fresh pattern request must return 3-5"),
    )
  ) {
    return (
      `The user explicitly requested a fresh comparative pattern set, but you returned fewer than three cards. ` +
      `Re-send the SAME turn with 3-5 distinct pattern_shortlist artifacts in ` +
      `specUpdates.milestoneArtifacts. For a portfolio redesign, every card must use a different individual ` +
      `designer's own live portfolio homepage or case-study sourceUrl, with sourceTitle, supportingLine, and ` +
      `2-4 reusable ingredients. Search may be used for discovery, but it is not a gate: if calls are exhausted, ` +
      `failed, or insufficient, fill the set from the verified catalog below. Do not refuse, ask permission, or ` +
      `return fewer than three cards. Recommend one with a grounded reason; invite selecting one or more and ` +
      `combining useful ingredients; keep quickReplies empty; set guidePanel.need to "" and omit nextPrompt; ` +
      `keep the pattern workspace nonblocking.\n\nVerified designer-owned portfolio sources:\n` +
      verifiedPortfolioSourcePrompt()
    );
  }
  if (
    check.reasons.some((reason) =>
      reason.includes("original public sourceUrl") ||
      reason.includes("distinct original example pages") ||
      reason.includes("original example, not a listicle") ||
      reason.includes("designer-owned live portfolio"),
    )
  ) {
    return (
      `Your pattern cards are not showing the actual examples. Use web search now, follow any article or roundup ` +
      `to the ORIGINAL designer, portfolio, product, or pattern-library page, then re-send the SAME substantive ` +
      `turn as JSON with a distinct public http(s) sourceUrl and the example's own sourceTitle on EVERY ` +
      `pattern_shortlist artifact. The visible interface on each sourceUrl must demonstrate that card's pattern. ` +
      `For portfolio redesign work, every source must be an individual designer's own live portfolio homepage or ` +
      `their own case-study page—the kind of layout shown by Joey Shiner—not a portfolio builder, vendor, blog, ` +
      `guide, template, roundup, or article about portfolios. Do not reuse one source, invent URLs, or use search-result ` +
      `pages. If an original cannot be reached, replace that candidate. Keep the existing supportingLine, ingredients, ` +
      `recommendation, selection invitation, and all other valid specUpdates.`
    );
  }
  if (
    check.reasons.some((reason) =>
      reason.includes("pattern cards cannot display in chat"),
    )
  ) {
    return (
      `Your last turn claimed that a pattern set was generated, but specUpdates was empty, so no cards can render. ` +
      `Re-send the SAME substantive turn as valid JSON. REQUIRED: specUpdates.milestoneArtifacts must contain ` +
      `3-5 distinct objects shaped exactly like ` +
      `{"kind":"pattern_shortlist","title":"Metric-first header","status":"exploring",` +
      `"supportingLine":"Leads with measurable impact for a fast hiring-manager scan.",` +
      `"ingredients":["Outcome metric","Role clarity","Project link"],"step":"find_patterns"}. ` +
      `Give every card a unique title, one criteria-grounded supportingLine, and 2-4 reusable ingredients. ` +
      `A sentence saying patterns exist, guidePanel.captured labels, or an artifact_generated activity event does NOT create cards. ` +
      `Do not return specUpdates: {}. Keep quickReplies empty, omit recommendedQuickReply, recommend one card in the reply, ` +
      `and invite selecting one or more or combining ingredients.`
    );
  }
  return (
    `Your last turn violated the TeamYou surface/flow contract: ${check.reasons.join("; ")}. ` +
    `Re-send the SAME substantive turn as valid JSON. The chat reply must contain the one actual ` +
    `question whenever guidePanel.need is non-empty; the Guide may store only the compact noun-phrase ` +
    `need and the matching nextPrompt for hover context. Keep activeStep on the current step or move ` +
    `only to its immediate next step unless every crossed step's required data is captured in specUpdates ` +
    `(for example, define_problem requires brief.problem and identify_users requires brief.user, brief.moment, ` +
    `and brief.task). Never skip a label while leaving its record empty. If the violation names ` +
    `define_problem, translate the latest user answer—including terse quick-reply wording—into one concise ` +
    `brief.problem before advancing; brief.user, brief.moment, and brief.task never replace that record. ` +
    `Preserve any valid later-step captures while adding the missing problem. If those captures are all present, ` +
    `a concise multi-step advance is allowed. Unless the user explicitly revised an earlier decision; for that ` +
    `case include a valid flowRevision, preserve existing work, and reopen only the earliest affected ` +
    `step (or its immediate next step after completing the reopened work). Make guidePanel.title exactly ` +
    `match the returned activeStep. ` +
    `When stepGate is nonblocking (anything except disposition "ask"), do not ask for confirmation ` +
    `and normally do not stay on the same step: capture the judgment, advance to the immediate next step, and ` +
    `ask only the next step's genuinely blocking question. Every framing turn must leave the user with that ` +
    `one prompt to continue; never return an acknowledgement-only framing turn. ` +
    `When advancing to the immediate next step, wrap exactly one short judgment or transition phrase ` +
    `in double asterisks so the chat retains clear visual hierarchy. ` +
    `Pattern exploration is the exception: after adding a useful set, it may stay on Find patterns or ` +
    `Review and shortlist without a question while the user selects cards. Recommend one grounded option, ` +
    `then invite selecting one or more, combining ingredients, requesting more, or adding an example; never ` +
    `force a single direction or duplicate the cards as quick replies. ` +
    `For an opportunity-seeking portfolio in Understand the request, ask what target work the site ` +
    `must help win before asking what the portfolio should communicate, say, or lead with. Scaffold ` +
    `Target work with two concrete choices plus "Not sure yet," and do not recommend one without evidence. ` +
    `In Identify users and context, capture user + moment together. Ask for a separate concrete task only ` +
    `when it is genuinely unknown. For a portfolio or other decision surface whose goal, problem, user, and ` +
    `moment already imply the visitor's judgment, synthesize one recommended judgment into brief.task and ` +
    `advance instead of asking the designer to choose among overlapping evaluation dimensions. Keep ` +
    `quickReplies empty so a role is never presented as an alternative to an arrival or workflow moment. ` +
    `When the latest user turn includes screenshots or documents, ground one concise observation either in the reply ` +
    `or in the visible structured evidence/evidenceBrief; do not repeat report stats in prose merely to prove ` +
    `inspection. Distinguish current-state evidence from inspiration/reference, and do not replace ` +
    `the user's supported barrier with an unrelated theory. When quantitative evidence is captured during Assess ` +
    `evidence and urgency, capture the numbers as a fact in specUpdates.evidence AND create or refresh a ` +
    `project-appropriate specUpdates.evidenceBrief immediately, even if another question keeps the step ` +
    `active; do not leave either the evidence record or report to optional model behavior. ` +
    `Do not remove captured specUpdates merely to satisfy this correction.`
  );
}
