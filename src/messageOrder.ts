import type { Message } from "./types";

const PATTERN_CARD_NOUN = /\b(?:patterns?|pattern cards?|shortlist|thumbnails?)\b/i;
const REDISPLAY_ACTION = /\b(?:show|display|redisplay|re-display|view|see|bring back|again|where (?:are|is))\b/i;

/** The rendering request is a UI command, not a coaching decision. */
export function requestsPatternCardRedisplay(text: string): boolean {
  return PATTERN_CARD_NOUN.test(text) && REDISPLAY_ACTION.test(text);
}

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
