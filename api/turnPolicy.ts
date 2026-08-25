import { countQuestions } from "./replyStyle";
import {
  FLOW_STEPS,
  FLOW_STEP_LABEL,
  type CoachTurnResponse,
  type FlowStep,
  type WorkItemType,
} from "../src/types";

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
const STRATEGIC_EMPHASIS = /\*\*[^*\n]+\*\*/;
const SCREENSHOT_GROUNDING =
  /\b(screenshot|image|reference|comparison|current (?:page|screen|site|portfolio)|shown|visible|looking at|based on what (?:is|you've) shown)\b/i;
const DATA_ARTIFACT =
  /\b(?:ga4|google analytics|analytics dashboard|dashboard|chart|graph|spreadsheet|report)\b/i;
const DATA_ARTIFACT_OBSERVATION =
  /\b(?:shows?|confirms?|indicates?|records?|reports?|reveals?|lists?|contains?)\b/i;
const AGGREGATOR_REFERENCE_TITLE =
  /(?:\bhow to\b.*\b(?:portfolio|case stud(?:y|ies))\b|\b(?:best|top)\b.*\bexamples?\b|\bexamples? that\b|\broundup\b|\binspiration\b|\btemplate\s*\+\s*examples?\b)/i;

function groundsLatestScreenshot(reply: string): boolean {
  return (
    SCREENSHOT_GROUNDING.test(reply) ||
    (DATA_ARTIFACT.test(reply) && DATA_ARTIFACT_OBSERVATION.test(reply))
  );
}

function turnGroundsLatestScreenshot(turn: CoachTurnResponse): boolean {
  if (groundsLatestScreenshot(turn.reply)) return true;

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
    SCREENSHOT_GROUNDING.test(evidenceText) ||
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
      (step) => !stepHasRequiredCapture(step, turn, context),
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
    !turnGroundsLatestScreenshot(turn)
  ) {
    reasons.push(
      "the latest user turn included screenshots, but the reply does not ground an observation in what they show",
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
    groundsLatestScreenshot(turn.reply);
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
    if (!isAsk && stayedOnStep && !performedPatternExploration) {
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
    if (replyQuestions === 0) {
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
      !/\b(?:recommend(?:ed|ing|ation)?|strongest fit|best fit|i(?:'d|’d| would) (?:start|lead|go) with|my (?:pick|choice) is)\b/i.test(
        turn.reply,
      )
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
      reason.includes("original public sourceUrl") ||
      reason.includes("distinct original example pages") ||
      reason.includes("original example, not a listicle"),
    )
  ) {
    return (
      `Your pattern cards are not showing the actual examples. Use web search now, follow any article or roundup ` +
      `to the ORIGINAL designer, portfolio, product, or pattern-library page, then re-send the SAME substantive ` +
      `turn as JSON with a distinct public http(s) sourceUrl and the example's own sourceTitle on EVERY ` +
      `pattern_shortlist artifact. The visible interface on each sourceUrl must demonstrate that card's pattern. ` +
      `Do not reuse one source, return an article/listicle/tutorial/gallery index, invent URLs, or use search-result ` +
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
    `When the latest user turn includes screenshots, ground one concise observation either in the reply ` +
    `or in the visible structured evidence/evidenceBrief; do not repeat report stats in prose merely to prove ` +
    `inspection. Distinguish current-state evidence from inspiration/reference, and do not replace ` +
    `the user's supported barrier with an unrelated theory. When quantitative evidence is captured during Assess ` +
    `evidence and urgency, capture the numbers as a fact in specUpdates.evidence AND create or refresh a ` +
    `project-appropriate specUpdates.evidenceBrief immediately, even if another question keeps the step ` +
    `active; do not leave either the evidence record or report to optional model behavior. ` +
    `Do not remove captured specUpdates merely to satisfy this correction.`
  );
}
