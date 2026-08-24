import { describe, expect, it } from "vitest";
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
    "The scope holds — a new homepage plus one detail page directly tests the content-order hypothesis without a full rewrite. What must be true for this redesign to count as successful — specific responses, a screener call, or something else measurable?",
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
});
