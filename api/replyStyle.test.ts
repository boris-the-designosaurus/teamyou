import { describe, it, expect } from "vitest";
import {
  checkReplyStyle,
  countQuestions,
  countSentences,
  countWords,
  hasHeadingListOrTable,
  hasBlamingProcessLanguage,
  CONCISE_MAX_SENTENCES,
  CONCISE_MAX_WORDS,
} from "./replyStyle";

function wordsOf(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

describe("countWords / countQuestions / hasHeadingListOrTable", () => {
  it("counts words on whitespace, empty string is zero", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one two three")).toBe(3);
  });

  it("counts distinct question runs, not literal '?' characters", () => {
    expect(countQuestions("No question here.")).toBe(0);
    expect(countQuestions("Is this right?")).toBe(1);
    expect(countQuestions("Really?! Are you sure?")).toBe(2); // "?!" counts once
  });

  it("detects a markdown heading", () => {
    expect(hasHeadingListOrTable("## Findings\nSome text")).toBe(true);
    expect(hasHeadingListOrTable("Plain text, no heading")).toBe(false);
  });

  it("allows a short bullet list but detects lists longer than four items", () => {
    expect(hasHeadingListOrTable("- one\n- two\n- three")).toBe(false);
    expect(hasHeadingListOrTable("1. one\n2. two\n3. three")).toBe(false);
    expect(hasHeadingListOrTable("- one\n- two\n- three\n- four\n- five")).toBe(true);
    expect(hasHeadingListOrTable("A well-known fact - noted here.")).toBe(false);
  });

  it("detects a markdown table (2+ pipe-delimited lines)", () => {
    expect(hasHeadingListOrTable("| a | b |\n| c | d |")).toBe(true);
  });

  it("counts sentences by terminator runs, empty string is zero", () => {
    expect(countSentences("")).toBe(0);
    expect(countSentences("   ")).toBe(0);
    expect(countSentences("One sentence.")).toBe(1);
    expect(countSentences("Captured both steps in the Guide. Should the funnel also be in scope?")).toBe(2);
    expect(countSentences("One. Two! Three?")).toBe(3);
    expect(countSentences("The bounce rate is 58.3%. We should proceed. What appears first?")).toBe(3);
  });

  it("detects scolding or internal process language", () => {
    expect(
      hasBlamingProcessLanguage(
        "You've asked twice to broaden — that's an explicit override.",
      ),
    ).toBe(true);
    expect(
      hasBlamingProcessLanguage(
        "You're right — I was too narrow. I'll add three contrasting structures now.",
      ),
    ).toBe(false);
  });
});

describe("checkReplyStyle — concise mode (normal coaching turns)", () => {
  it("accepts a normal, on-target reply", () => {
    const reply =
      "Qualified traffic is uncertain, so I'll record distribution as a parallel risk and add conversion tracking to the requirements. That doesn't block the redesign — we have enough to proceed. What do visitors currently see first on the page?";
    const check = checkReplyStyle(reply, "concise");
    expect(check.ok).toBe(true);
    expect(check.questionCount).toBe(1);
  });

  it("rejects a reply over the 120-word ceiling", () => {
    const check = checkReplyStyle(wordsOf(150), "concise");
    expect(check.ok).toBe(false);
    expect(check.wordCount).toBeGreaterThan(CONCISE_MAX_WORDS);
    expect(check.reasons.join(" ")).toMatch(/word/);
  });

  it("rejects a reply asking more than one question", () => {
    const check = checkReplyStyle("Is this the goal? And is that the user? And when does it happen?", "concise");
    expect(check.ok).toBe(false);
    expect(check.questionCount).toBeGreaterThan(1);
  });

  it("rejects a reply that uses a heading, list, or table", () => {
    const check = checkReplyStyle("## Summary\n- one\n- two\n- three", "concise");
    expect(check.ok).toBe(false);
    expect(check.hasHeadingListOrTable).toBe(true);
  });

  it("accepts a short bullet list when it keeps a choice scannable", () => {
    const check = checkReplyStyle(
      "These are the useful distinctions:\n- Ongoing support\n- Focused feature work\n- Not sure yet\n\nWhich is closest?",
      "concise",
    );
    expect(check.ok).toBe(true);
  });

  it("a short reply under 40 words is still accepted (default is a target, not a floor)", () => {
    const check = checkReplyStyle("Got it — locking that in. Ready for the next step?", "concise");
    expect(check.ok).toBe(true);
  });

  it("rejects a reply over the 3-sentence ceiling even when word count is fine", () => {
    const reply =
      "First point here. Second point here. Third point here. Fourth point pushes it over the line.";
    const check = checkReplyStyle(reply, "concise");
    expect(check.ok).toBe(false);
    expect(check.sentenceCount).toBeGreaterThan(CONCISE_MAX_SENTENCES);
    expect(check.reasons.join(" ")).toMatch(/sentence/);
  });

  it("accepts a reply at exactly 3 short sentences", () => {
    const reply = "Captured both steps in the Guide. That's enough to proceed. Should the funnel be in scope?";
    const check = checkReplyStyle(reply, "concise");
    expect(check.ok).toBe(true);
    expect(check.sentenceCount).toBe(3);
  });

  it("rejects the scolding process language from the reference-broadening regression", () => {
    const check = checkReplyStyle(
      "You've asked twice to broaden — that's an explicit override, so I'll add contrasting references while keeping Joey Shiner as an anchor. What kind of contrast do you want?",
      "concise",
    );
    expect(check.ok).toBe(false);
    expect(check.hasBlamingProcessLanguage).toBe(true);
    expect(check.reasons.join(" ")).toMatch(/responding collaboratively/);
  });
});

describe("checkReplyStyle — detailed mode (reports, briefs, critiques, handoffs)", () => {
  it("lifts every limit when responseMode is detailed", () => {
    const longReply = `${wordsOf(300)}\n\n## Section\n- a\n- b\n- c\n\nIs this ok? Really? Sure?`;
    const check = checkReplyStyle(longReply, "detailed");
    expect(check.ok).toBe(true);
  });
});
