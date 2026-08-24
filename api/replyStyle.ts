// Enforces the coach's reply-style contract as actual code, not just prompt
// text: "the chat decides; the Guide remembers." A normal (concise) coaching
// turn defaults to 40-80 words, never exceeds 120, asks at most one question,
// and never uses headings/lists/tables — those belong in the Guide or in a
// deliberately "detailed" turn (reports, briefs, critiques, handoffs, or an
// explicit user request for depth). Pure string analysis — no API calls —
// so it's cheaply unit-testable independent of any live model behavior.

export type ReplyStyleCheck = {
  ok: boolean;
  wordCount: number;
  questionCount: number;
  sentenceCount: number;
  hasHeadingListOrTable: boolean;
  hasBlamingProcessLanguage: boolean;
  reasons: string[];
};

export const CONCISE_MAX_WORDS = 120;
export const CONCISE_TARGET_MIN_WORDS = 40;
export const CONCISE_TARGET_MAX_WORDS = 80;
/** "Keep responses to 1-3 short sentences" — enforced alongside the word
 * ceiling, not instead of it, so a reply can't satisfy one and dodge the other. */
export const CONCISE_MAX_SENTENCES = 3;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Counts sentences by splitting on runs of ./!/? (or end of string) — a
 * proxy for "how many sentences", same tolerance-for-imprecision as the
 * word/question counters above (e.g. "Mr." over-counts slightly). */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(/[^.!?]+(?:[.!?]+|$)/g);
  return matches ? matches.filter((s) => s.trim().length > 0).length : 0;
}

/** Counts distinct "?" runs so "??" / "?!" count once each — a proxy for
 * "how many questions does this reply ask", not a literal character tally. */
export function countQuestions(text: string): number {
  const matches = text.match(/\?+/g);
  return matches ? matches.length : 0;
}

/** True if the reply uses markdown headings, 3+ list-style lines, or a table
 * — normal coaching turns talk in prose; that structure belongs in the Guide
 * or in a deliberately "detailed" turn. */
export function hasHeadingListOrTable(text: string): boolean {
  const lines = text.split("\n");
  if (lines.some((l) => /^#{1,6}\s/.test(l.trim()))) return true;
  const bulletLines = lines.filter((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
  if (bulletLines.length >= 3) return true;
  const tableLines = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l));
  if (tableLines.length >= 2) return true;
  return false;
}

/** Internal governance belongs in the decision record, not in the user's
 * face. These phrases either score/blame the user for repetition or expose
 * mechanical policy language instead of responding like a collaborator. */
export function hasBlamingProcessLanguage(text: string): boolean {
  return [
    /\byou(?:'ve| have) asked (?:twice|again|repeatedly)\b/i,
    /\bexplicit override\b/i,
    /\b(?:isn't|is not|wasn't|was not) justified without evidence\b/i,
    /\bthe frame locked\b/i,
  ].some((pattern) => pattern.test(text));
}

/**
 * Checks a reply against the concise-turn contract. "detailed" mode (reports,
 * briefs, critiques, handoffs, explicit user request) lifts every limit —
 * this function only gates normal coaching turns.
 */
export function checkReplyStyle(
  reply: string,
  responseMode: "concise" | "detailed" = "concise",
): ReplyStyleCheck {
  const wordCount = countWords(reply);
  const questionCount = countQuestions(reply);
  const sentenceCount = countSentences(reply);
  const headingListTable = hasHeadingListOrTable(reply);
  const blamingProcessLanguage = hasBlamingProcessLanguage(reply);

  if (responseMode === "detailed") {
    return {
      ok: true,
      wordCount,
      questionCount,
      sentenceCount,
      hasHeadingListOrTable: headingListTable,
      hasBlamingProcessLanguage: blamingProcessLanguage,
      reasons: [],
    };
  }

  const reasons: string[] = [];
  if (wordCount > CONCISE_MAX_WORDS) {
    reasons.push(`the reply is ${wordCount} words — over the ${CONCISE_MAX_WORDS}-word ceiling for a normal turn`);
  }
  if (sentenceCount > CONCISE_MAX_SENTENCES) {
    reasons.push(
      `the reply is ${sentenceCount} sentences — over the ${CONCISE_MAX_SENTENCES}-sentence ceiling for a normal turn`,
    );
  }
  if (questionCount > 1) {
    reasons.push(`the reply asks ${questionCount} questions — only one is allowed per normal turn`);
  }
  if (headingListTable) {
    reasons.push("the reply uses a heading, list, or table — not allowed in a normal coaching turn");
  }
  if (blamingProcessLanguage) {
    reasons.push(
      "the reply blames the user or exposes internal governance language instead of responding collaboratively",
    );
  }

  return {
    ok: reasons.length === 0,
    wordCount,
    questionCount,
    sentenceCount,
    hasHeadingListOrTable: headingListTable,
    hasBlamingProcessLanguage: blamingProcessLanguage,
    reasons,
  };
}

/** The corrective instruction sent back to the model for a regenerate retry —
 * never used to truncate or rewrite the reply client-side. */
export function styleCorrectionPrompt(check: ReplyStyleCheck): string {
  return (
    `Your last reply didn't meet the concise-turn contract: ${check.reasons.join("; ")}. ` +
    `Re-send the SAME turn (same activeStep, same specUpdates substance) but rewrite "reply" to ` +
    `1-3 short sentences (never over ${CONCISE_MAX_SENTENCES}), aiming for ` +
    `${CONCISE_TARGET_MIN_WORDS}-${CONCISE_TARGET_MAX_WORDS} words and never over ${CONCISE_MAX_WORDS}, ` +
    `ONE observation/challenge/recommendation, at most ONE question placed at the end, and no ` +
    `headings/lists/tables. If you just wrote something to the Guide this turn, use at most one brief ` +
    `acknowledgment (e.g. "Got it." / "Captured that.") — do not repeat or paraphrase it back, and do not ` +
    `narrate your reasoning. Never mention how many times the user asked, call their choice an "explicit ` +
    `override," or expose other internal governance language; briefly own a miss and act. If this genuinely ` +
    `is a report/brief/critique/handoff the user asked for, set ` +
    `"responseMode" to "detailed" instead of shortening it.`
  );
}
