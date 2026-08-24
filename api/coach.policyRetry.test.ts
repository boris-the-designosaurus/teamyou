import { describe, expect, it, vi } from "vitest";
import { withPolicyRetry } from "./coach";
import type { CoachTurnResponse } from "../src/types";

const stillInvalid: CoachTurnResponse = {
  reply: "Should we confirm this scope before moving forward?",
  activeStep: "set_scope",
  responseMode: "concise",
  stepGate: {
    linkedDecision: "Portfolio redesign scope",
    blocking: true,
    disposition: "ask",
  },
  specUpdates: {
    brief: {
      scopeIncluded: "Homepage plus one TeamYou detail page.",
      scopeExcluded: "Other project pages and a full portfolio rewrite.",
    },
  },
  guidePanel: {
    title: "Set the scope",
    need: "Scope confirmation",
    nextPrompt: "Should we confirm this scope before moving forward?",
  },
  activityEvents: [],
};

const validFinalCorrection: CoachTurnResponse = {
  reply:
    "**The scope holds** — a new homepage plus one detail page directly tests the content-order hypothesis without a full rewrite. What must be true for this redesign to count as successful — specific responses, a screener call, or something else measurable?",
  activeStep: "define_outcome",
  workItemType: "design_project",
  workMode: "design_exploration",
  responseMode: "concise",
  stepGate: {
    linkedDecision: "Success definition for the redesigned homepage and detail page",
    blocking: true,
    disposition: "ask",
  },
  specUpdates: {
    brief: {
      scopeIncluded:
        "Redesigned homepage (positioning, availability, results, project teasers) plus one detailed project page (TeamYou) with story, demo, screen gallery, and a single use case.",
      scopeExcluded:
        "Other project detail pages and a full portfolio rewrite — excluded from this iteration.",
    },
    decisions: [
      {
        text: "Scope limited to homepage redesign plus one project detail page (TeamYou) for this iteration.",
        rationale:
          "Directly tests the content-order root-cause hypothesis without committing to a full rewrite; smallest unit that can validate or disprove the hypothesis.",
        step: "set_scope",
        source: "user",
      },
    ],
  },
  guidePanel: {
    title: "Define the outcome",
    captured: [],
    need: "Success definition",
    nextPrompt:
      "What must be true for this redesign to count as successful — specific responses, a screener call, or something else measurable?",
    priorSummary:
      "Scope: redesigned homepage + one project detail page (TeamYou); excluded: other project pages, full rewrite.",
  },
  activityEvents: [
    {
      type: "decision_captured",
      importance: "significant",
      label: "Scoped to homepage + one detail page",
    },
    {
      type: "step_changed",
      importance: "milestone",
      label: "Moved to Define the outcome",
    },
  ],
  quickReplies: [],
};

describe("withPolicyRetry", () => {
  it("accepts a valid second correction instead of returning a blank policy error", async () => {
    const generated = [
      JSON.stringify(stillInvalid),
      JSON.stringify(validFinalCorrection),
    ];

    const result = await withPolicyRetry(
      "set_scope",
      [],
      JSON.stringify(stillInvalid),
      stillInvalid,
      async () => generated.shift() ?? "",
    );

    expect(result.status).toBe(200);
    expect(result.json).toEqual(validFinalCorrection);
  });

  it("repairs a repeated target-work question after the portfolio goal is complete", async () => {
    const repeatedTargetQuestion: CoachTurnResponse = {
      reply:
        "**Target work first**: is this portfolio primarily for full-time B2B/SaaS roles, freelance work, or not sure which to lead with?",
      activeStep: "understand_request",
      workItemType: "design_project",
      workMode: "design_exploration",
      responseMode: "concise",
      stepGate: {
        linkedDecision: "The target work the portfolio must help win",
        blocking: true,
        disposition: "ask",
      },
      specUpdates: {
        brief: {
          goal:
            "Get hired for B2B/SaaS product design work, primarily full-time with openness to freelance.",
          productContext:
            "The portfolio currently does not tell a strong story or produce hiring interest.",
        },
      },
      guidePanel: {
        title: "Understand the request",
        need: "Target work priority",
        nextPrompt:
          "Is this portfolio primarily for full-time roles, freelance work, or not sure?",
      },
      activityEvents: [],
      quickReplies: [
        "Full-time B2B/SaaS roles",
        "Freelance/contract SaaS work",
        "Not sure yet",
      ],
    };
    const generate = vi.fn(async () => {
      throw new Error("The deterministic repair should avoid another model call.");
    });

    const result = await withPolicyRetry(
      "understand_request",
      [],
      JSON.stringify(repeatedTargetQuestion),
      repeatedTargetQuestion,
      generate,
      { workItemType: "design_project" },
    );

    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      activeStep: "define_problem",
      guidePanel: {
        title: "Define the problem",
        need: "Hiring barrier",
      },
      quickReplies: [],
    });
    expect("reply" in result.json ? result.json.reply : "").toContain(
      "target work is already clear enough",
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
