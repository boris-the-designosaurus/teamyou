import { describe, it, expect } from "vitest";
import { turnWasAsk, nextAskStreak, buildAskStreakNudge, ASK_STREAK_NUDGE_THRESHOLD } from "./coachGate";
import type { StepGate } from "./types";

const askGate: StepGate = { linkedDecision: "x", blocking: true, disposition: "ask" };
const riskGate: StepGate = { linkedDecision: "x", blocking: false, disposition: "risk" };

describe("turnWasAsk", () => {
  it("is false whenever the step advanced, regardless of disposition", () => {
    expect(turnWasAsk(false, askGate, "something")).toBe(false);
  });

  it("is true when the step stayed the same and disposition is 'ask'", () => {
    expect(turnWasAsk(true, askGate, undefined)).toBe(true);
  });

  it("is false when the step stayed the same but disposition is not 'ask'", () => {
    expect(turnWasAsk(true, riskGate, undefined)).toBe(false);
  });

  it("falls back to a non-empty guidePanel.need when stepGate is absent (older/incomplete turn)", () => {
    expect(turnWasAsk(true, undefined, "Whether the button is admin-only")).toBe(true);
    expect(turnWasAsk(true, undefined, "")).toBe(false);
    expect(turnWasAsk(true, undefined, "   ")).toBe(false);
  });
});

describe("nextAskStreak", () => {
  it("increments on a consecutive ask", () => {
    expect(nextAskStreak(0, true)).toBe(1);
    expect(nextAskStreak(1, true)).toBe(2);
    expect(nextAskStreak(2, true)).toBe(3);
  });

  it("resets to 0 the moment a turn isn't an ask", () => {
    expect(nextAskStreak(3, false)).toBe(0);
  });
});

describe("buildAskStreakNudge", () => {
  it("is undefined below the threshold", () => {
    expect(buildAskStreakNudge(0, "assess_evidence")).toBeUndefined();
    expect(buildAskStreakNudge(ASK_STREAK_NUDGE_THRESHOLD - 1, "assess_evidence")).toBeUndefined();
  });

  it("fires at and above the threshold, naming the step", () => {
    const nudge = buildAskStreakNudge(ASK_STREAK_NUDGE_THRESHOLD, "assess_evidence");
    expect(nudge).toContain("assess_evidence");
    expect(nudge).toContain("2");
    expect(buildAskStreakNudge(ASK_STREAK_NUDGE_THRESHOLD + 1, "assess_evidence")).toBeDefined();
  });

  it("full loop: two consecutive asks trigger the nudge on the third turn", () => {
    let streak = 0;
    streak = nextAskStreak(streak, turnWasAsk(true, askGate, undefined)); // 1
    expect(buildAskStreakNudge(streak, "find_root_cause")).toBeUndefined();
    streak = nextAskStreak(streak, turnWasAsk(true, askGate, undefined)); // 2
    expect(buildAskStreakNudge(streak, "find_root_cause")).toBeDefined();
    // Advancing (or a non-ask disposition) resets it.
    streak = nextAskStreak(streak, turnWasAsk(false, askGate, undefined));
    expect(streak).toBe(0);
  });
});
