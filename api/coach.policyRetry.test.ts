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
  it("turns a text-only treatment choice into visible artifacts", async () => {
    const treatmentChoice: CoachTurnResponse = {
      reply:
        "Both variations hold the outcome-first sequencing while testing tone. **Variation A leads faster with a stated metric**, which best fits the comprehension barrier. Pick A, B, or ask for a different angle to keep refining.",
      activeStep: "refine_treatments",
      workItemType: "design_project",
      workMode: "design_exploration",
      responseMode: "concise",
      stepGate: {
        linkedDecision: "Which treatment to carry into the next refinement pass",
        blocking: false,
        disposition: "proceed",
      },
      specUpdates: {},
      guidePanel: {
        title: "Explore and refine treatments",
        captured: ["Variation A: metric-led open", "Variation B: narrative-led open"],
        need: "",
      },
      activityEvents: [],
      quickReplies: ["Variation A", "Variation B", "See another angle"],
    };
    const generate = vi.fn(async () => {
      throw new Error("The deterministic gate repair should avoid another model call.");
    });

    const result = await withPolicyRetry(
      "refine_treatments",
      [],
      JSON.stringify(treatmentChoice),
      treatmentChoice,
      generate,
    );

    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      activeStep: "refine_treatments",
      stepGate: { blocking: false, disposition: "proceed" },
      guidePanel: {
        need: "",
      },
      quickReplies: [],
    });
    const artifacts =
      "specUpdates" in result.json
        ? result.json.specUpdates.milestoneArtifacts ?? []
        : [];
    expect(artifacts).toHaveLength(3);
    expect(
      artifacts.every(
        (artifact) =>
          artifact.kind === "wireframe" &&
          !!artifact.wireframeSpec?.headline &&
          !!artifact.wireframeSpec.blocks?.length,
      ),
    ).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it("deterministically returns drawable wireframes when the model discusses the selection", async () => {
    const discussionOnly: CoachTurnResponse = {
      reply:
        "Both patterns are selected. Do you want to refine one or combine them?",
      activeStep: "review_shortlist",
      workItemType: "design_project",
      workMode: "design_exploration",
      responseMode: "concise",
      stepGate: {
        linkedDecision: "Which direction to refine",
        blocking: true,
        disposition: "ask",
      },
      specUpdates: {},
      guidePanel: {
        title: "Review and shortlist",
        need: "Direction to refine",
        nextPrompt: "Do you want to refine one or combine them?",
      },
      activityEvents: [],
      quickReplies: ["Refine A", "Refine B", "Combine both"],
    };
    const generate = vi.fn(async () => {
      throw new Error("The deterministic action repair should avoid another model call.");
    });

    const result = await withPolicyRetry(
      "find_patterns",
      [],
      JSON.stringify(discussionOnly),
      discussionOnly,
      generate,
      {
        latestUserText:
          "Generate wireframes for: Step-by-step process narrative + Large personal positioning",
        workItemType: "design_project",
        specSnapshot: {
          brief: { goal: "Redesign my product design portfolio" },
          milestoneArtifacts: [
            {
              kind: "pattern_shortlist",
              title: "Step-by-step process narrative",
              status: "selected",
              supportingLine: "Makes the reasoning visible at each stage.",
              ingredients: ["Decision trail", "Outcome callout"],
            },
            {
              kind: "pattern_shortlist",
              title: "Large personal positioning",
              status: "selected",
              ingredients: ["Personal voice", "Project cards"],
            },
          ],
        },
      },
    );

    expect(result.status).toBe(200);
    if (!("specUpdates" in result.json)) throw new Error("Expected coach turn");
    const wireframes = result.json.specUpdates.milestoneArtifacts?.filter(
      (artifact) => artifact.kind === "wireframe",
    );
    expect(wireframes).toHaveLength(2);
    expect(wireframes?.every((artifact) => artifact.wireframeSpec?.headline)).toBe(true);
    expect(wireframes?.every((artifact) => artifact.wireframeSpec?.blocks?.length)).toBe(true);
    expect(result.json).toMatchObject({
      activeStep: "review_shortlist",
      guidePanel: { need: "" },
      quickReplies: [],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps valid generated wireframes and removes a contradictory trailing question", async () => {
    const artifacts = ["Impact-led hero", "Personal intro", "Case study narrative"].map(
      (title, index) => ({
        kind: "wireframe" as const,
        title,
        status: "exploring" as const,
        step: "choose_direction" as const,
        wireframeSpec: {
          surface: "page" as const,
          layout: index === 2 ? ("case_study" as const) : ("portfolio_home" as const),
          headline: title,
          blocks: ["Outcome", "Contribution", "Project card"],
        },
      }),
    );
    const validCardsWrongGate: CoachTurnResponse = {
      reply:
        "Three wireframes are up. Want to develop the first one further, or combine elements from the other two?",
      activeStep: "choose_direction",
      workItemType: "design_project",
      workMode: "design_exploration",
      responseMode: "concise",
      stepGate: {
        linkedDecision: "Which wireframe direction to develop further",
        blocking: false,
        disposition: "proceed",
      },
      specUpdates: { milestoneArtifacts: artifacts },
      guidePanel: {
        title: "Choose a direction",
        captured: ["Three wireframes generated"],
        need: "Direction to develop",
        nextPrompt: "Want to develop the first one further?",
      },
      activityEvents: [],
      quickReplies: [],
    };
    const generate = vi.fn(async () => {
      throw new Error("Valid wireframes should be repaired without another model call.");
    });

    const result = await withPolicyRetry(
      "find_patterns",
      [],
      JSON.stringify(validCardsWrongGate),
      validCardsWrongGate,
      generate,
      {
        latestUserText: "Generate wireframes",
        specSnapshot: {
          milestoneArtifacts: [
            { kind: "pattern_shortlist", title: "Joey Shiner", status: "selected" },
          ],
        },
      },
    );

    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      activeStep: "choose_direction",
      stepGate: { blocking: false, disposition: "proceed" },
      guidePanel: { need: "" },
      specUpdates: { milestoneArtifacts: artifacts },
    });
    expect("reply" in result.json ? result.json.reply : "").not.toContain("?");
    expect(generate).not.toHaveBeenCalled();
  });

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
  it("accepts a decimal-heavy evidence transition after repairing its question gate", async () => {
    const evidenceTransition: CoachTurnResponse = {
      reply:
        "The GA4 data shows 226 active users and a 58.3% bounce rate — visitors are leaving fast. With ~40-50 applications producing one screener, **evidence supports urgency and I'm moving to root cause**. What does the homepage show a visitor first, right now?",
      activeStep: "find_root_cause",
      workItemType: "design_project",
      workMode: "design_exploration",
      responseMode: "concise",
      stepGate: {
        linkedDecision: "Whether current evidence justifies urgency",
        blocking: false,
        disposition: "proceed",
      },
      specUpdates: {
        evidence: [
          {
            kind: "fact",
            text: "GA4: 226 active users and a 58.3% bounce rate.",
            step: "assess_evidence",
          },
          {
            kind: "fact",
            text: "40-50 applications produced one screener interview.",
            step: "assess_evidence",
          },
        ],
        evidenceBrief: {
          title: "Portfolio performance snapshot",
          summary: "Traffic exists, but hiring response is weak.",
          stats: [
            { label: "Active users", value: "226" },
            { label: "Bounce rate", value: "58.3%" },
          ],
          strength: "moderate",
        },
      },
      guidePanel: {
        title: "Find the adoption barrier/root cause",
        need: "Homepage first impression",
        nextPrompt: "What does the homepage show a visitor first, right now?",
      },
      activityEvents: [
        {
          type: "evidence_captured",
          importance: "significant",
          label: "Captured GA4 and application evidence",
        },
        {
          type: "step_changed",
          importance: "milestone",
          label: "Assess evidence and urgency complete",
        },
      ],
      quickReplies: [],
    };
    const generate = vi.fn(async () => {
      throw new Error("The deterministic repair should avoid another model call.");
    });

    const result = await withPolicyRetry(
      "assess_evidence",
      [],
      JSON.stringify(evidenceTransition),
      evidenceTransition,
      generate,
      {
        latestAttachmentCount: 1,
        latestUserText: "GA4 shows 226 users and 58.3% bounce.",
        workItemType: "design_project",
      },
    );

    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      activeStep: "find_root_cause",
      stepGate: {
        linkedDecision: "Homepage first impression",
        blocking: true,
        disposition: "ask",
      },
    });
    expect(generate).not.toHaveBeenCalled();
  });

});
