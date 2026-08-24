import { countQuestions } from "./replyStyle";
import {
  FLOW_STEPS,
  FLOW_STEP_LABEL,
  type CoachTurnResponse,
  type FlowStep,
} from "../src/types";

export type TurnPolicyCheck = {
  ok: boolean;
  reasons: string[];
};

const QUESTION_LEAD = /^(what|whether|how|who|when|where|why|is|are|do|does|should|can|could|will|would)\b/i;
const EARLY_EVIDENCE_QUESTION =
  /\b(traffic(?:\s+(?:quality|source|sources))?|acquisition|distribution|analytics|page\s*views?|bounce\s*rate|engagement\s*rate|conversion\s*(?:rate|tracking)|impressions?|enough\s+(?:of\s+)?(?:the\s+)?right\s+\w+(?:\s+\w+){0,3}\s+(?:see|seeing|visit|visiting|reach|reaching))\b/i;

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
    reasons.push(
      `activeStep skipped ahead from "${previousStep}" to "${turn.activeStep}" instead of moving to the immediate next step`,
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
    if (!isAsk && stayedOnStep) {
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

  return { ok: reasons.length === 0, reasons };
}

export function turnPolicyCorrectionPrompt(check: TurnPolicyCheck): string {
  return (
    `Your last turn violated the TeamYou surface/flow contract: ${check.reasons.join("; ")}. ` +
    `Re-send the SAME substantive turn as valid JSON. The chat reply must contain the one actual ` +
    `question whenever guidePanel.need is non-empty; the Guide may store only the compact noun-phrase ` +
    `need and the matching nextPrompt for hover context. Keep activeStep on the current step or move ` +
    `only to its immediate next step unless the user explicitly revised an earlier decision; for that ` +
    `case include a valid flowRevision, preserve existing work, and reopen only the earliest affected ` +
    `step (or its immediate next step after completing the reopened work). Make guidePanel.title exactly ` +
    `match the returned activeStep. ` +
    `When stepGate is nonblocking (anything except disposition "ask"), do not ask for confirmation ` +
    `and do not stay on the same step: capture the judgment, advance to the immediate next step, and ` +
    `ask only the next step's genuinely blocking question. ` +
    `Do not remove captured specUpdates merely to satisfy this correction.`
  );
}
