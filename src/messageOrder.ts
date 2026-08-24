import type { Message } from "./types";

/**
 * A transition marker introduces the context for the Coach reply that follows.
 * Keep this ordering in one pure function so UI refactors cannot silently put
 * "Step started" after the question that already began that step.
 */
export function appendCoachTurnMessages(
  existing: Message[],
  coachMessage: Message,
  transitionMarker: Message | null,
): Message[] {
  return transitionMarker
    ? [...existing, transitionMarker, coachMessage]
    : [...existing, coachMessage];
}
