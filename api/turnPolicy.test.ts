import { describe, expect, it } from "vitest";
import type { CoachTurnResponse } from "../src/types";
import { checkTurnPolicy, turnPolicyCorrectionPrompt } from "./turnPolicy";

function turn(overrides: Partial<CoachTurnResponse> = {}): CoachTurnResponse {
  return {
    reply: "The barrier is clear. Who is the primary visitor?",
    activeStep: "identify_users",
    specUpdates: {},
    guidePanel: {
      title: "Identify users and context",
      need: "Primary visitor",
      nextPrompt: "Who is the primary visitor?",
    },
    activityEvents: [],
    ...overrides,
  };
}

describe("checkTurnPolicy", () => {
  it("accepts an immediate step advance with the question in chat", () => {
    expect(checkTurnPolicy("define_problem", turn()).ok).toBe(true);
  });

  it("rejects a question that exists only in the Guide", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({ reply: "The barrier is clear. Moving to the visitor context." }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/not asked in the chat reply/);
  });

  it("rejects a Guide need written as a question", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        guidePanel: {
          title: "Identify users and context",
          need: "Who is the primary visitor?",
          nextPrompt: "Who is the primary visitor?",
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/compact noun phrase/);
  });

  it("rejects skipping or regressing through the stable flow", () => {
    expect(
      checkTurnPolicy("understand_request", turn({ activeStep: "assess_evidence" })).ok,
    ).toBe(false);
    expect(
      checkTurnPolicy("assess_evidence", turn({ activeStep: "define_problem" })).ok,
    ).toBe(false);
  });

  it("allows a user-authorized revision to reopen an earlier step while preserving work", () => {
    const result = checkTurnPolicy(
      "choose_direction",
      turn({
        reply:
          "Understood — I'll keep Joey Shiner as one anchor and add contrasting structures. Which additional structure belongs in the shortlist?",
        activeStep: "review_shortlist",
        flowRevision: {
          reopenedStep: "find_patterns",
          reason: "The user explicitly chose to broaden the reference set.",
          preservesExistingWork: true,
        },
        stepGate: {
          linkedDecision: "Additional reference structure",
          blocking: true,
          disposition: "ask",
        },
        specUpdates: {
          decisions: [
            {
              text: "Broaden the reference set while retaining Joey Shiner.",
              rationale: "The user requested more structural comparisons.",
              step: "find_patterns",
              source: "user",
              supersedes: "decision-reference-set",
            },
          ],
        },
        guidePanel: {
          title: "Review and shortlist",
          need: "Additional shortlist",
          nextPrompt: "Which additional structure belongs in the shortlist?",
        },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects turning pattern exploration into a forced single choice", () => {
    const result = checkTurnPolicy(
      "find_patterns",
      turn({
        reply:
          "Which structure should we develop further: Joey Shiner positioning-first or the case-study-led contrast?",
        activeStep: "find_patterns",
        stepGate: {
          linkedDecision: "Single structure to develop",
          blocking: true,
          disposition: "ask",
        },
        guidePanel: {
          title: "Find relevant patterns",
          need: "Chosen structure",
          nextPrompt:
            "Which structure should we develop further: Joey Shiner positioning-first or the case-study-led contrast?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/cannot force a single direction/);
  });

  it("accepts a recommended multi-pattern set that can be combined", () => {
    const result = checkTurnPolicy(
      "find_patterns",
      turn({
        reply:
          "I recommend **Personal studio** because it makes the contract offer clear fastest. Select one or more patterns to generate wireframes, combine useful ingredients, request more, or add your own example in chat.",
        activeStep: "find_patterns",
        stepGate: {
          linkedDecision: "Portfolio structures to compare",
          blocking: false,
          disposition: "proceed",
        },
        specUpdates: {
          milestoneArtifacts: [
            {
              kind: "pattern_shortlist",
              title: "Personal studio",
              status: "exploring",
              supportingLine: "Direct offer and personality-led entry.",
              ingredients: ["Direct offer", "Availability"],
              step: "find_patterns",
            },
            {
              kind: "pattern_shortlist",
              title: "Proof first",
              status: "exploring",
              supportingLine: "Leads with outcome evidence.",
              ingredients: ["Outcome teaser", "Project depth"],
              step: "find_patterns",
            },
          ],
        },
        guidePanel: {
          title: "Find relevant patterns",
          need: "",
        },
        quickReplies: [],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects duplicating a multi-pattern card set as quick replies", () => {
    const base = turn({
      reply:
        "I recommend Personal studio because the offer is clearest. Select one or more patterns and combine useful ingredients.",
      activeStep: "find_patterns",
      stepGate: {
        linkedDecision: "Portfolio structures to compare",
        blocking: false,
        disposition: "proceed",
      },
      specUpdates: {
        milestoneArtifacts: [
          { kind: "pattern_shortlist", title: "Personal studio", status: "exploring", step: "find_patterns" },
          { kind: "pattern_shortlist", title: "Proof first", status: "exploring", step: "find_patterns" },
        ],
      },
      guidePanel: { title: "Find relevant patterns", need: "" },
      quickReplies: ["Personal studio", "Proof first"],
    });

    const result = checkTurnPolicy("find_patterns", base);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/must not be duplicated as quick replies/);
  });

  it("rejects a backward move that does not preserve existing work", () => {
    const result = checkTurnPolicy(
      "choose_direction",
      turn({
        reply: "I'll replace the previous directions.",
        activeStep: "find_patterns",
        flowRevision: {
          reopenedStep: "find_patterns",
          reason: "The user asked for more references.",
          preservesExistingWork: false as never,
        },
        guidePanel: { title: "Find relevant patterns", need: "" },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/valid user-authorized flowRevision/);
  });

  it("rejects a Guide title that belongs to a different step", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({ guidePanel: { title: "Define the problem", need: "Primary visitor", nextPrompt: "Who is the primary visitor?" } }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/guidePanel.title/);
  });

  it("rejects nonblocking confirmation loops that stay on the same step", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        reply: "The barrier is clear. Does that framing feel complete?",
        activeStep: "define_problem",
        stepGate: {
          linkedDecision: "Whether the problem is complete",
          blocking: false,
          disposition: "proceed",
        },
        guidePanel: {
          title: "Define the problem",
          need: "Confirm problem completeness",
          nextPrompt: "Does that framing feel complete?",
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/nonblocking/);
    expect(result.reasons.join(" ")).toMatch(/did not advance/);
  });

  it("advances when the response captures a credible problem barrier", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        reply:
          "Captured. Is traffic quality also stopping enough hiring managers from seeing the page?",
        activeStep: "define_problem",
        specUpdates: {
          brief: {
            problem:
              "Qualified visitors must infer the builder offer, availability, and proof from finished work.",
          },
        },
        stepGate: {
          linkedDecision: "Whether traffic quality is also a barrier",
          blocking: true,
          disposition: "ask",
        },
        guidePanel: {
          title: "Define the problem",
          need: "Traffic quality",
          nextPrompt:
            "Is traffic quality also stopping enough hiring managers from seeing the page?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/problem barrier was captured/);
    expect(result.reasons.join(" ")).toMatch(/traffic\/evidence/);
  });

  it("advances Understand the request once goal and context are captured", () => {
    const result = checkTurnPolicy(
      "understand_request",
      turn({
        reply: "Is contract work the only goal?",
        activeStep: "understand_request",
        specUpdates: {
          brief: {
            goal: "Generate contract opportunities",
            productContext: "The portfolio does not explain the builder offer.",
            assumedSolution: "Use a simpler portfolio format.",
          },
        },
        guidePanel: {
          title: "Understand the request",
          need: "Primary business goal",
          nextPrompt: "Is contract work the only goal?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/goal and context were captured/);
  });

  it("allows acquisition questions once the flow reaches evidence", () => {
    const result = checkTurnPolicy(
      "identify_users",
      turn({
        reply: "Who currently reaches the page, and through which traffic source?",
        activeStep: "assess_evidence",
        guidePanel: {
          title: "Assess evidence and urgency",
          need: "Traffic evidence",
          nextPrompt: "Who currently reaches the page, and through which traffic source?",
        },
      }),
    );

    // Only the normal one-question/surface contract applies at this step; the
    // early-step semantic boundary no longer rejects traffic evidence.
    expect(result.reasons.join(" ")).not.toMatch(/traffic\/evidence/);
  });

  it("rejects asking for portfolio messaging before the target work is known", () => {
    const result = checkTurnPolicy(
      "understand_request",
      turn({
        reply:
          "Got it — I've captured the goal. What does your portfolio need to communicate about you for the right clients to reach out?",
        activeStep: "understand_request",
        stepGate: {
          linkedDecision: "Portfolio key message",
          blocking: true,
          disposition: "ask",
        },
        specUpdates: {
          brief: { goal: "Generate freelance or contract work through the portfolio" },
        },
        guidePanel: {
          title: "Understand the request",
          need: "Portfolio key message",
          nextPrompt:
            "What does your portfolio need to communicate about you for the right clients to reach out?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/ask what target work/);
  });

  it("accepts asking what work an ambiguous portfolio request must help win", () => {
    const result = checkTurnPolicy(
      "understand_request",
      turn({
        reply:
          "You don't need a polished offer yet. Which is closest to the work you want more of?",
        activeStep: "understand_request",
        stepGate: {
          linkedDecision: "Target work the portfolio must help win",
          blocking: true,
          disposition: "ask",
        },
        specUpdates: {
          brief: { goal: "Generate freelance or contract work through the portfolio" },
        },
        guidePanel: {
          title: "Understand the request",
          need: "Target work",
          nextPrompt: "Which is closest to the work you want more of?",
        },
        quickReplies: ["Ongoing design support", "Feature/workflow projects", "Not sure yet"],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects a hard-to-answer Target work question with no scaffolding", () => {
    const result = checkTurnPolicy(
      "understand_request",
      turn({
        reply:
          "What kind of freelance or contract work do you want the portfolio to help you win?",
        activeStep: "understand_request",
        stepGate: {
          linkedDecision: "Target work the portfolio must help win",
          blocking: true,
          disposition: "ask",
        },
        specUpdates: {
          brief: { goal: "Generate freelance or contract work through the portfolio" },
        },
        guidePanel: {
          title: "Understand the request",
          need: "Target work",
          nextPrompt:
            "What kind of freelance or contract work do you want the portfolio to help you win?",
        },
        quickReplies: [],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/two concrete starting points/);
  });

  it("rejects recommending a Target work option before evidence exists", () => {
    const result = checkTurnPolicy(
      "understand_request",
      turn({
        reply: "Which is closest to the work you want more of?",
        activeStep: "understand_request",
        stepGate: {
          linkedDecision: "Target work the portfolio must help win",
          blocking: true,
          disposition: "ask",
        },
        guidePanel: {
          title: "Understand the request",
          need: "Target work",
          nextPrompt: "Which is closest to the work you want more of?",
        },
        quickReplies: ["Ongoing design support", "Feature/workflow projects", "Not sure yet"],
        recommendedQuickReply: "Feature/workflow projects",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/cannot show a recommendation/);
  });

  it("requires an ask disposition to be blocking", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        stepGate: {
          linkedDecision: "Primary visitor",
          blocking: false,
          disposition: "ask",
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/blocking is false/);
  });

  it("builds a corrective prompt that preserves captured updates", () => {
    const check = checkTurnPolicy(
      "define_problem",
      turn({ reply: "Moving on.", activeStep: "identify_users" }),
    );
    const prompt = turnPolicyCorrectionPrompt(check);
    expect(prompt).toContain("chat reply must contain");
    expect(prompt).toContain("do not ask for confirmation");
    expect(prompt).toContain("user explicitly revised an earlier decision");
    expect(prompt).toContain("Do not remove captured specUpdates");
  });
});
