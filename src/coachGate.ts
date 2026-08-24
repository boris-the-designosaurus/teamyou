// The same-step-ask streak gate — code-level enforcement of "default to no
// more than two follow-up questions per step" (COACH_BEHAVIOR_SPEC.md /
// decision-criticality gate). Pure functions so the counting logic is
// unit-testable independent of any live model call.
import type { FlowStep, StepGate } from "./types";

/**
 * Whether this turn counts toward the same-step-ask streak: the step did NOT
 * advance, and the turn's disposition was "ask" (or, if the model omitted
 * stepGate, a non-empty guidePanel.need is used as a fallback signal so the
 * gate still degrades gracefully on an older/incomplete turn).
 */
export function turnWasAsk(
  stayedOnStep: boolean,
  stepGate: StepGate | undefined,
  guidePanelNeed: string | undefined,
): boolean {
  if (!stayedOnStep) return false;
  if (stepGate) return stepGate.disposition === "ask";
  return !!guidePanelNeed?.trim();
}

/** The next streak count given whether this turn counted as an "ask" on the same step. */
export function nextAskStreak(currentStreak: number, wasAsk: boolean): number {
  return wasAsk ? currentStreak + 1 : 0;
}

/** Threshold at which the next outgoing turn carries a corrective nudge. */
export const ASK_STREAK_NUDGE_THRESHOLD = 2;

/**
 * The one-turn nudge injected into the system prompt once the streak hits the
 * threshold — never a client-side rewrite of the model's reply, just a
 * stronger instruction for the next turn. Returns undefined below threshold.
 */
export function buildAskStreakNudge(streak: number, currentStep: FlowStep): string | undefined {
  if (streak < ASK_STREAK_NUDGE_THRESHOLD) return undefined;
  return `You have asked ${streak} follow-up questions on this step ("${currentStep}") without advancing. Unless the very next answer is genuinely decision-blocking per the gate, capture what you have now (as an assumption, risk, or todo) and advance the step instead of asking again.`;
}
