import { describe, expect, it } from "vitest";
import type { CoachTurnResponse } from "../src/types";
import { checkTurnPolicy, turnPolicyCorrectionPrompt } from "./turnPolicy";

function turn(overrides: Partial<CoachTurnResponse> = {}): CoachTurnResponse {
  return {
    reply: "**The barrier is clear**. Who is the primary visitor?",
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
  it("rejects ignoring screenshots from the latest user turn", () => {
    const result = checkTurnPolicy("define_problem", turn(), {
      latestAttachmentCount: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/does not ground an observation/);
  });

  it("accepts a screenshot-grounded comparison that advances the problem", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        reply:
          "**The screenshots support a comprehension barrier**: the current portfolio shows the work, while the reference makes identity and project choices easier to scan. Who needs to understand this story, and when are they viewing it?",
        activeStep: "identify_users",
        specUpdates: {
          brief: {
            problem:
              "Visitors must assemble the designer's role, strengths, and impact from separate parts of the portfolio.",
            assumedSolution: "A simpler, more scannable structure inspired by the reference.",
          },
        },
        guidePanel: {
          title: "Identify users and context",
          need: "User and moment",
          nextPrompt:
            "Who needs to understand this story, and when are they viewing it?",
        },
        quickReplies: [],
      }),
      { latestAttachmentCount: 2 },
    );

    expect(result.ok).toBe(true);
  });

  it("accepts a concrete observation grounded in an attached analytics dashboard", () => {
    const result = checkTurnPolicy(
      "assess_evidence",
      turn({
        reply:
          "The GA4 dashboard confirms real traffic (226 users) but no funnel visibility past pageview — that gap is now a todo, and distribution quality is a parallel risk, not a blocker.\n\n**Moving to root cause.** What do visitors actually see first when they land on the portfolio — what's above the fold?",
        activeStep: "find_root_cause",
        specUpdates: {
          evidence: [
            {
              kind: "fact",
              text: "GA4 reports 226 active users and no conversion tracking.",
              step: "assess_evidence",
            },
          ],
          evidenceBrief: {
            title: "Portfolio performance snapshot",
            summary: "Traffic exists, but on-site funnel visibility is missing.",
            stats: [{ label: "Active users", value: "226" }],
            strength: "moderate",
          },
        },
        guidePanel: {
          title: "Find the adoption barrier/root cause",
          need: "Homepage first impression",
          nextPrompt:
            "What do visitors actually see first when they land on the portfolio — what's above the fold?",
        },
      }),
      { latestAttachmentCount: 1 },
    );

    expect(result.ok).toBe(true);
  });

  it("accepts screenshot grounding carried by the visible evidence report", () => {
    const result = checkTurnPolicy(
      "assess_evidence",
      turn({
        reply:
          "Traffic is direct/Pinterest-heavy with a low 1-in-45 screener rate — that's grounded evidence, not just volume. Is fixing this urgent right now, or a lower-pressure improvement?",
        activeStep: "assess_evidence",
        specUpdates: {
          evidence: [
            {
              kind: "fact",
              text: "226 site users, a 58.3% bounce rate, and 40-50 applications resulting in 1 screener interview.",
              step: "assess_evidence",
            },
            {
              kind: "risk",
              text: "Traffic is dominated by direct and Pinterest sources visible in the analytics screenshot, not clearly hiring-manager-qualified channels.",
              step: "assess_evidence",
            },
          ],
          evidenceBrief: {
            title: "Portfolio performance snapshot",
            source: "Google Analytics (Aug 2026) + user-reported outcomes",
            summary:
              "Traffic exists, but the application-to-screener conversion rate is very low and qualified distribution is uncertain.",
            stats: [
              { label: "Visitors", value: "226" },
              { label: "Applications", value: "~40-50" },
              { label: "Screener calls", value: "1" },
            ],
            strength: "moderate",
          },
        },
        guidePanel: {
          title: "Assess evidence and urgency",
          need: "Urgency level",
          nextPrompt:
            "Is fixing this urgent right now, or a lower-pressure improvement?",
        },
        quickReplies: [
          "Urgent — actively job hunting",
          "Important but not urgent",
        ],
      }),
      { latestAttachmentCount: 1 },
    );

    expect(result.ok).toBe(true);
  });

  it("does not treat a generic mention of data as screenshot grounding", () => {
    const result = checkTurnPolicy(
      "assess_evidence",
      turn({
        reply:
          "**Moving to root cause.** The data matters. What do visitors see first?",
        activeStep: "find_root_cause",
        guidePanel: {
          title: "Find the adoption barrier/root cause",
          need: "Homepage first impression",
          nextPrompt: "What do visitors see first?",
        },
      }),
      { latestAttachmentCount: 1 },
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/does not ground an observation/);
  });

  it("rejects the exact evidence turn when the model omits both the record and report", () => {
    const result = checkTurnPolicy(
      "assess_evidence",
      turn({
        reply:
          "The screenshot confirms real traffic (226 users), while 40–50 applications produced one screener interview. **Moving to root cause.** What does the homepage show first?",
        activeStep: "find_root_cause",
        specUpdates: {},
        guidePanel: {
          title: "Find the adoption barrier/root cause",
          need: "Homepage first impression",
          nextPrompt: "What does the homepage show first?",
        },
      }),
      {
        latestAttachmentCount: 1,
        latestUserText:
          "I applied to roughly 40–50 roles and received only one screener interview.",
        workItemType: "design_project",
      },
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(
      /capture it as a numeric fact in specUpdates\.evidence/,
    );
    expect(result.reasons.join(" ")).toMatch(
      /create or refresh a project-appropriate evidenceBrief/,
    );
  });

  it("requires an evidence brief as soon as quantitative evidence is captured", () => {
    const result = checkTurnPolicy(
      "assess_evidence",
      turn({
        reply:
          "The evidence is directionally useful. **Moving to root cause.** What do visitors see first?",
        activeStep: "find_root_cause",
        specUpdates: {
          evidence: [
            {
              kind: "fact",
              text: "226 users and one screener interview from 40-50 applications.",
              step: "assess_evidence",
            },
          ],
        },
        guidePanel: {
          title: "Find the adoption barrier/root cause",
          need: "Homepage first impression",
          nextPrompt: "What do visitors see first?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/must create or refresh a project-appropriate evidenceBrief/);
  });

  it("requires the evidence brief while the step stays active to ask about urgency", () => {
    const result = checkTurnPolicy(
      "assess_evidence",
      turn({
        reply: "Captured that. Is there urgency here, or is this exploratory?",
        activeStep: "assess_evidence",
        specUpdates: {
          evidence: [
            {
              kind: "fact",
              text: "226 users and one screener interview from 40-50 applications.",
              step: "assess_evidence",
            },
          ],
        },
        guidePanel: {
          title: "Assess evidence and urgency",
          need: "Urgency/timeline",
          nextPrompt: "Is there urgency here, or is this exploratory?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/must create or refresh a project-appropriate evidenceBrief/);
  });

  it("accepts an immediate evidence brief while asking the remaining urgency question", () => {
    const result = checkTurnPolicy(
      "assess_evidence",
      turn({
        reply: "Captured that. Is there urgency here, or is this exploratory?",
        activeStep: "assess_evidence",
        specUpdates: {
          evidence: [
            {
              kind: "fact",
              text: "226 users and one screener interview from 40-50 applications.",
              step: "assess_evidence",
            },
          ],
          evidenceBrief: {
            title: "Portfolio performance snapshot",
            summary: "Traffic exists, but hiring outcomes are weak and funnel visibility is missing.",
            stats: [
              { label: "Active users", value: "226" },
              { label: "Screener interviews", value: "1" },
            ],
            strength: "moderate",
          },
        },
        guidePanel: {
          title: "Assess evidence and urgency",
          need: "Urgency/timeline",
          nextPrompt: "Is there urgency here, or is this exploratory?",
        },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("accepts a project-appropriate evidence brief with the quantitative transition", () => {
    const result = checkTurnPolicy(
      "assess_evidence",
      turn({
        reply:
          "The evidence is directionally useful. **Moving to root cause.** What do visitors see first?",
        activeStep: "find_root_cause",
        specUpdates: {
          evidence: [
            {
              kind: "fact",
              text: "226 users and one screener interview from 40-50 applications.",
              step: "assess_evidence",
            },
          ],
          evidenceBrief: {
            title: "Portfolio performance snapshot",
            summary: "Traffic exists, but hiring outcomes are weak and funnel visibility is missing.",
            stats: [
              { label: "Active users", value: "226" },
              { label: "Screener interviews", value: "1" },
            ],
            strength: "moderate",
          },
        },
        guidePanel: {
          title: "Find the adoption barrier/root cause",
          need: "Homepage first impression",
          nextPrompt: "What do visitors see first?",
        },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("accepts an immediate step advance with the question in chat", () => {
    expect(checkTurnPolicy("define_problem", turn()).ok).toBe(true);
  });

  it("rejects a forward transition with no strategic emphasis", () => {
    const result = checkTurnPolicy(
      "identify_users",
      turn({
        reply:
          "That's enough to define users and context. What evidence do we have that this is the problem?",
        activeStep: "assess_evidence",
        guidePanel: {
          title: "Assess evidence and urgency",
          need: "Evidence type",
          nextPrompt: "What evidence do we have that this is the problem?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/must emphasize one short judgment/);
  });

  it("keeps Identify users and context as free-text user, moment, then task capture", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        reply:
          "**The barrier is clear**. Who encounters it, and at what point in their workflow?",
        activeStep: "identify_users",
        guidePanel: {
          title: "Identify users and context",
          need: "User and moment",
          nextPrompt: "Who encounters it, and at what point in their workflow?",
        },
        quickReplies: ["Sales reps", "After an import", "Not sure yet"],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/user \+ moment, then task, as free text/);
  });

  it("advances Identify users and context once user, moment, and task are captured", () => {
    const result = checkTurnPolicy(
      "identify_users",
      turn({
        reply: "Captured. Is there anything else to add?",
        activeStep: "identify_users",
        specUpdates: {
          brief: {
            user: "Sales reps",
            moment: "Immediately after importing a lead list",
            task: "Tagging and cleanup",
          },
        },
        guidePanel: {
          title: "Identify users and context",
          need: "Confirmation",
          nextPrompt: "Is there anything else to add?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/user, moment, and task were captured/);
  });

  it("rejects handing an inferable portfolio judgment back as overlapping choices", () => {
    const result = checkTurnPolicy(
      "identify_users",
      turn({
        reply:
          "Got it — that gives a clear primary visitor and moment. What are they trying to judge: your seniority/craft level, your thinking process, or fit for their product domain?",
        activeStep: "identify_users",
        guidePanel: {
          title: "Identify users and context",
          need: "Judgment task",
          nextPrompt:
            "What are they trying to judge: your seniority/craft level, your thinking process, or fit for their product domain?",
        },
      }),
      {
        workItemType: "design_project",
        specSnapshot: {
          brief: {
            user: "A hiring manager or design lead",
            moment: "After an application, referral, or LinkedIn visit",
          },
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/synthesize the inferable hiring judgment/);
    expect(result.reasons.join(" ")).toMatch(/overlapping evaluation dimensions/);
  });

  it("accepts synthesizing the portfolio judgment and advancing to evidence", () => {
    const result = checkTurnPolicy(
      "identify_users",
      turn({
        reply:
          "**The hiring decision is whether you can own complex SaaS work end-to-end and produce meaningful outcomes.** What evidence do you have that the current portfolio is preventing that judgment?",
        activeStep: "assess_evidence",
        specUpdates: {
          brief: {
            task:
              "Decide whether the designer can own complex SaaS work end-to-end and is worth interviewing.",
          },
        },
        stepGate: {
          linkedDecision: "Evidence that the portfolio blocks the hiring judgment",
          blocking: true,
          disposition: "ask",
        },
        guidePanel: {
          title: "Assess evidence and urgency",
          need: "Barrier evidence",
          nextPrompt:
            "What evidence do you have that the current portfolio is preventing that judgment?",
        },
      }),
      {
        workItemType: "design_project",
        specSnapshot: {
          brief: {
            user: "A hiring manager or design lead",
            moment: "After an application, referral, or LinkedIn visit",
          },
        },
      },
    );

    expect(result.ok).toBe(true);
  });

  it("rejects an acknowledgement-only framing turn with no prompt to continue", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        reply:
          "Got it — that's a real barrier, not just a missing feature. I'll lock it as visitors being unable to see your thought process or a reason to hire you for ongoing work.",
        activeStep: "define_problem",
        stepGate: {
          linkedDecision: "Portfolio trust barrier",
          blocking: true,
          disposition: "ask",
        },
        guidePanel: {
          title: "Define the problem",
          captured: ["Visitors cannot see the thought process or reason to hire for ongoing work"],
          need: "",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/without a prompt to continue/);
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

  it("rejects a portfolio jump that infers the audience but omits the problem record", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        reply:
          "**I can infer the visitor's judgment.** Do you have performance data?",
        activeStep: "assess_evidence",
        specUpdates: {
          brief: {
            user: "Hiring managers",
            moment: "Reviewing after an application",
            task: "Judge end-to-end ownership",
          },
        },
        guidePanel: {
          title: "Assess evidence and urgency",
          need: "Portfolio performance data",
          nextPrompt: "Do you have performance data?",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/without capturing required data for: define_problem/);
  });

  it("allows a concise multi-step advance when every crossed step is captured", () => {
    const result = checkTurnPolicy(
      "define_problem",
      turn({
        reply:
          "**The barrier and hiring judgment are clear.** Do you have performance data?",
        activeStep: "assess_evidence",
        specUpdates: {
          brief: {
            problem: "Visitors cannot quickly understand the designer's process, contribution, and impact.",
            user: "Hiring managers",
            moment: "Reviewing after an application",
            task: "Judge whether the designer can own ambiguous work end-to-end",
          },
        },
        guidePanel: {
          title: "Assess evidence and urgency",
          need: "Portfolio performance data",
          nextPrompt: "Do you have performance data?",
        },
      }),
    );

    expect(result.ok).toBe(true);
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

  it("rejects announcing pattern cards without capturing their artifacts", () => {
    const result = checkTurnPolicy(
      "set_criteria",
      turn({
        reply:
          "Criteria locked: **outcome-led hierarchy targets the credibility gap directly**. Here are five structurally distinct patterns that lead with proof. I'd start with Proof-first hero because it puts the strongest metric first. Select one or more, combine ingredients, ask for more, or bring your own example.",
        activeStep: "find_patterns",
        stepGate: {
          linkedDecision: "Which structural patterns to shortlist",
          blocking: false,
          disposition: "proceed",
        },
        specUpdates: {},
        guidePanel: {
          title: "Find relevant patterns",
          captured: [
            "Proof-first hero",
            "Outcome ticker + condensed bio",
            "Case-study-led homepage",
            "Split hero",
            "Personal studio",
          ],
          need: "",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/pattern cards cannot display in chat/);
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

  it("keeps an existing pattern-card workspace open on a nonblocking turn", () => {
    const candidate = turn({
      reply:
        "Here are five structures to compare. I'd start with **Metric-first header** because it puts impact before the scroll — select one or more, combine ingredients, or ask for different examples.",
      activeStep: "find_patterns",
      stepGate: {
        linkedDecision: "Which patterns to shortlist",
        blocking: false,
        disposition: "proceed",
      },
      specUpdates: {},
      guidePanel: { title: "Find relevant patterns", need: "" },
      quickReplies: [],
    });

    const withoutSavedCards = checkTurnPolicy("find_patterns", candidate);
    expect(withoutSavedCards.ok).toBe(false);
    expect(withoutSavedCards.reasons.join(" ")).toMatch(/nonblocking.*did not advance/);

    const withSavedCards = checkTurnPolicy("find_patterns", candidate, {
      specSnapshot: {
        milestoneArtifacts: [
          {
            id: "pattern-1",
            kind: "pattern_shortlist",
            title: "Metric-first header",
            status: "exploring",
          },
        ],
      },
    });
    expect(withSavedCards.ok).toBe(true);
  });

  it("requires source pages when retrieved pattern thumbnails are enabled", () => {
    const candidate = turn({
      reply:
        "I recommend **Personal studio** because it makes the offer clearest. Select one or more patterns and combine useful ingredients.",
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
            sourceUrl: "https://example.com/studio",
            sourceTitle: "Studio reference",
            step: "find_patterns",
          },
          {
            kind: "pattern_shortlist",
            title: "Proof first",
            status: "exploring",
            step: "find_patterns",
          },
        ],
      },
      guidePanel: { title: "Find relevant patterns", need: "" },
      quickReplies: [],
    });

    const result = checkTurnPolicy("find_patterns", candidate, {
      patternWebSearchEnabled: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/sourceUrl.*example thumbnails can display/);

    const correction = turnPolicyCorrectionPrompt(result);
    expect(correction).toContain("Use web search now");
    expect(correction).toContain("sourceUrl and the example's own sourceTitle on EVERY");
  });

  it("rejects duplicate article thumbnails instead of actual examples", () => {
    const candidate = turn({
      reply:
        "I recommend **Outcome first** because it puts proof above the fold. Select one or more patterns and combine useful ingredients.",
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
            title: "Outcome first",
            status: "exploring",
            sourceUrl: "https://example.com/blog/portfolio-roundup",
            sourceTitle: "16 Best UX Portfolio Examples That Stand Out",
            step: "find_patterns",
          },
          {
            kind: "pattern_shortlist",
            title: "Narrative arc",
            status: "exploring",
            sourceUrl: "https://example.com/blog/portfolio-roundup#second",
            sourceTitle: "16 Best UX Portfolio Examples That Stand Out",
            step: "find_patterns",
          },
        ],
      },
      guidePanel: { title: "Find relevant patterns", need: "" },
      quickReplies: [],
    });

    const result = checkTurnPolicy("find_patterns", candidate, {
      patternWebSearchEnabled: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/distinct original example pages/);
    expect(result.reasons.join(" ")).toMatch(/original example, not a listicle/);
    const correction = turnPolicyCorrectionPrompt(result);
    expect(correction).toContain("follow any article or roundup to the ORIGINAL");
    expect(correction).toContain("Do not reuse one source");
  });

  it("rejects portfolio vendor and blog URLs even when their source titles look harmless", () => {
    const candidate = turn({
      reply:
        "I recommend **Outcome first** because it puts proof above the fold. Select one or more patterns and combine useful ingredients.",
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
            title: "Outcome first",
            status: "exploring",
            sourceUrl: "https://tailorcv.com/blog/portfolio-case-study",
            sourceTitle: "Outcome-led project example",
            step: "find_patterns",
          },
          {
            kind: "pattern_shortlist",
            title: "Narrative arc",
            status: "exploring",
            sourceUrl: "https://productic.net/resources/portfolio-layout",
            sourceTitle: "Narrative project example",
            step: "find_patterns",
          },
        ],
      },
      guidePanel: { title: "Find relevant patterns", need: "" },
      quickReplies: [],
    });

    const result = checkTurnPolicy("find_patterns", candidate, {
      patternWebSearchEnabled: true,
      specSnapshot: {
        brief: {
          goal: "Redesign my product design portfolio to win interviews",
          user: "Hiring managers",
        },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/designer-owned live portfolio/);
    expect(turnPolicyCorrectionPrompt(result)).toContain(
      "individual designer's own live portfolio homepage",
    );
  });

  it("accepts distinct designer-owned portfolio and case-study pages", () => {
    const candidate = turn({
      reply:
        "I recommend **Personal studio** because it makes the designer and work immediately scannable. Select one or more patterns and combine useful ingredients.",
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
            sourceUrl: "https://joeyshiner.com/",
            sourceTitle: "Joey Shiner",
            step: "find_patterns",
          },
          {
            kind: "pattern_shortlist",
            title: "Case-study narrative",
            status: "exploring",
            sourceUrl: "https://simonpan.com/work/uber",
            sourceTitle: "Simon Pan — Uber",
            step: "find_patterns",
          },
        ],
      },
      guidePanel: { title: "Find relevant patterns", need: "" },
      quickReplies: [],
    });

    const result = checkTurnPolicy("find_patterns", candidate, {
      patternWebSearchEnabled: true,
      specSnapshot: {
        brief: { goal: "Redesign my product design portfolio" },
      },
    });
    expect(result.ok).toBe(true);
  });

  it("accepts I'd start with as a grounded pattern recommendation", () => {
    const result = checkTurnPolicy(
      "set_criteria",
      turn({
        reply:
          "**Set the criteria is complete**, so I'm moving to pattern-finding. I'd start with the Outcome-first hero — it puts the strongest proof in the very first glance, directly fixing the sequencing problem. Select one or more of these, combine ingredients across them, or ask for something different.",
        activeStep: "find_patterns",
        stepGate: {
          linkedDecision: "Which structural patterns best express the locked criteria",
          blocking: false,
          disposition: "proceed",
        },
        specUpdates: {
          milestoneArtifacts: [
            {
              kind: "pattern_shortlist",
              title: "Outcome-first hero",
              status: "exploring",
              supportingLine: "Opens with the strongest measurable result.",
              ingredients: ["Metric-led headline", "One case teaser"],
              step: "find_patterns",
            },
            {
              kind: "pattern_shortlist",
              title: "Process-narrative structure",
              status: "exploring",
              supportingLine: "Shows thinking before the polished result.",
              ingredients: ["Problem framing", "Decision trail"],
              step: "find_patterns",
            },
          ],
        },
        guidePanel: { title: "Find relevant patterns", need: "" },
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

  it("builds a focused correction when announced pattern cards are missing", () => {
    const prompt = turnPolicyCorrectionPrompt({
      ok: false,
      reasons: [
        "the turn announces a pattern set but does not capture it as pattern_shortlist milestoneArtifacts, so the pattern cards cannot display in chat",
      ],
    });

    expect(prompt).toContain("specUpdates.milestoneArtifacts must contain 3-5");
    expect(prompt).toContain('"kind":"pattern_shortlist"');
    expect(prompt).toContain("Do not return specUpdates: {}");
    expect(prompt).toContain("guidePanel.captured labels");
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
    expect(prompt).toContain("translate the latest user answer—including terse quick-reply wording");
    expect(prompt).toContain("brief.task never replace that record");
    expect(prompt).toContain("Preserve any valid later-step captures while adding the missing problem");
  });
});
