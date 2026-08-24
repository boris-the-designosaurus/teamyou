// Pure helper backing the Guide's "Need" → chat locate affordance
// (COACH_BEHAVIOR_SPEC.md product boundary: the Guide owns state/recall, the
// chat owns the actual question — clicking a Need jumps to where that
// question is really asked instead of duplicating it in the Guide).
import type { Message } from "./types";

/**
 * The chat message a click on the active step's Need label should scroll to
 * and highlight — the most recent coach turn, since that turn is what
 * produced the active step's outstanding need/nextPrompt. Returns null when
 * there's no coach message yet (e.g. a brand-new, empty conversation).
 */
export function findLastCoachMessageId(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "coach") return messages[i].id;
  }
  return null;
}
