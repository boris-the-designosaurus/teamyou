import { describe, it, expect } from "vitest";
import {
  mergeSpec,
  toActivityEvents,
  setMilestoneArtifactStatus,
  updateBuildHandoff,
  updateWorkingBuild,
  countPassedCategories,
  reviewCategoryState,
  isVagueFinding,
  stepSummaryLine,
  stepCapturedItems,
  stageSummaryLine,
} from "./merge";
import { emptySpec, type ReviewFinding, type SpecUpdates } from "./types";

// Deterministic id factory so assertions are stable.
function seqIds(prefix = "id") {
  let n = 0;
  return () => `${prefix}_${n++}`;
}

describe("mergeSpec — Rule 3", () => {
  it("scalar overwrite: brief fields replace when present, untouched when absent", () => {
    let spec = emptySpec();

    spec = mergeSpec(spec, { brief: { problem: "P1", goal: "G1" } }, seqIds());
    expect(spec.brief.problem).toBe("P1");
    expect(spec.brief.goal).toBe("G1");

    // Second turn overwrites problem, leaves goal untouched (absent key).
    spec = mergeSpec(spec, { brief: { problem: "P2" } }, seqIds());
    expect(spec.brief.problem).toBe("P2");
    expect(spec.brief.goal).toBe("G1");
  });

  it("scalar overwrite: workflow.summary / rules.summary replace in place", () => {
    let spec = emptySpec();
    spec = mergeSpec(spec, { workflow: { summary: "W1" }, rules: { summary: "R1" } }, seqIds());
    expect(spec.workflow.summary).toBe("W1");
    expect(spec.rules.summary).toBe("R1");

    spec = mergeSpec(spec, { workflow: { summary: "W2" } }, seqIds());
    expect(spec.workflow.summary).toBe("W2");
    expect(spec.rules.summary).toBe("R1"); // untouched
  });

  it("array append: decisions accumulate across turns (do not replace)", () => {
    let spec = emptySpec();
    spec = mergeSpec(
      spec,
      { decisions: [{ text: "D1", step: "define_problem", source: "user" }] },
      seqIds(),
    );
    spec = mergeSpec(
      spec,
      { decisions: [{ text: "D2", step: "set_criteria", source: "coach" }] },
      seqIds("later"),
    );

    expect(spec.decisions).toHaveLength(2);
    expect(spec.decisions.map((d) => d.text)).toEqual(["D1", "D2"]);
    expect(spec.decisions.every((d) => d.status === "active")).toBe(true);
  });

  it("a decision with `supersedes` flips the earlier decision to superseded, retaining it", () => {
    let spec = emptySpec();
    spec = mergeSpec(
      spec,
      { decisions: [{ text: "Use a modal", step: "define_problem", source: "coach" }] },
      seqIds(),
    );
    const originalId = spec.decisions[0].id;

    spec = mergeSpec(
      spec,
      {
        decisions: [
          {
            text: "Use an inline panel instead",
            step: "define_problem",
            source: "coach",
            supersedes: originalId,
          },
        ],
      },
      seqIds("t2"),
    );

    expect(spec.decisions).toHaveLength(2);
    expect(spec.decisions.find((d) => d.id === originalId)?.status).toBe("superseded");
    expect(spec.decisions.find((d) => d.text === "Use an inline panel instead")?.status).toBe(
      "active",
    );
  });

  it("array append: workflow steps and open questions accumulate", () => {
    let spec = emptySpec();
    spec = mergeSpec(
      spec,
      {
        workflow: { steps: [{ title: "S1", order: 1 }] },
        openQuestions: [{ text: "Q1", step: "define_problem", status: "open" }],
      },
      seqIds(),
    );
    spec = mergeSpec(
      spec,
      { workflow: { steps: [{ title: "S2", order: 2 }] } },
      seqIds("t2"),
    );

    expect(spec.workflow.steps.map((s) => s.title)).toEqual(["S1", "S2"]);
    expect(spec.openQuestions).toHaveLength(1);
  });

  it("id assignment: every appended item gets a client-assigned stable id", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        workflow: { steps: [{ title: "S1", order: 1 }] },
        acceptanceCriteria: [{ text: "AC1", status: "draft" }],
        todos: [{ title: "T1", status: "todo" }],
        decisions: [{ text: "D1", step: "set_scope", source: "coach" }],
        openQuestions: [{ text: "Q1", step: "set_scope", status: "open" }],
      },
      seqIds(),
    );

    expect(spec.workflow.steps[0].id).toBe("id_0");
    expect(spec.rules.acceptanceCriteria[0].id).toBe("id_1");
    // todo is assigned after the criterion in merge order
    expect(spec.rules.todos[0].id).toBe("id_2");
    expect(spec.decisions[0].id).toBe("id_3");
    expect(spec.openQuestions[0].id).toBe("id_4");
  });

  it("linkedAcceptanceCriterionRef resolves by exact text to the real id", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        acceptanceCriteria: [
          { text: "User can log in", status: "draft" },
          { text: "Session persists", status: "locked" },
        ],
        todos: [
          { title: "Build login", status: "todo", linkedAcceptanceCriterionRef: "User can log in" },
        ],
      },
      seqIds(),
    );

    const loginCriterion = spec.rules.acceptanceCriteria.find(
      (c) => c.text === "User can log in",
    )!;
    expect(spec.rules.todos[0].linkedAcceptanceCriterionId).toBe(loginCriterion.id);
  });

  it("linkedAcceptanceCriterionRef resolves by 1-based order within the same turn", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        acceptanceCriteria: [
          { text: "AC-A", status: "draft" },
          { text: "AC-B", status: "draft" },
        ],
        todos: [{ title: "T", status: "todo", linkedAcceptanceCriterionRef: "2" }],
      },
      seqIds(),
    );
    const acB = spec.rules.acceptanceCriteria.find((c) => c.text === "AC-B")!;
    expect(spec.rules.todos[0].linkedAcceptanceCriterionId).toBe(acB.id);
  });

  it("unresolvable linkedAcceptanceCriterionRef leaves the link undefined", () => {
    const spec = mergeSpec(
      emptySpec(),
      { todos: [{ title: "T", status: "todo", linkedAcceptanceCriterionRef: "nope" }] },
      seqIds(),
    );
    expect(spec.rules.todos[0].linkedAcceptanceCriterionId).toBeUndefined();
  });

  it("is pure: does not mutate the input spec", () => {
    const spec = emptySpec();
    const updates: SpecUpdates = {
      decisions: [{ text: "D", step: "define_problem", source: "user" }],
    };
    const result = mergeSpec(spec, updates, seqIds());
    expect(spec.decisions).toHaveLength(0);
    expect(result.decisions).toHaveLength(1);
  });

  it("array append: evidence accumulates, distinguishing fact/assumption/interpretation/risk", () => {
    let spec = emptySpec();
    spec = mergeSpec(
      spec,
      {
        evidence: [
          { kind: "fact", text: "32.4K imports/month", step: "assess_evidence" },
          { kind: "assumption", text: "Reps are open to automation", step: "assess_evidence" },
        ],
      },
      seqIds(),
    );
    expect(spec.evidence).toHaveLength(2);
    expect(spec.evidence[0].kind).toBe("fact");
    expect(spec.evidence[1].kind).toBe("assumption");
    expect(spec.evidence[1].status).toBeUndefined();
  });

  it("evidenceStatusUpdates marks an existing assumption verified/disproved in place", () => {
    let spec = emptySpec();
    spec = mergeSpec(
      spec,
      { evidence: [{ kind: "assumption", text: "A1", step: "assess_evidence", status: "open" }] },
      seqIds(),
    );
    const evidenceId = spec.evidence[0].id;

    spec = mergeSpec(
      spec,
      { evidenceStatusUpdates: [{ id: evidenceId, status: "verified" }] },
      seqIds("t2"),
    );
    expect(spec.evidence).toHaveLength(1); // updated in place, not appended
    expect(spec.evidence[0].status).toBe("verified");
  });

  it("scalar overwrite: outcome fields merge key-by-key, never replacing the whole object", () => {
    let spec = emptySpec();
    spec = mergeSpec(spec, { outcome: { userOutcome: "U1" } }, seqIds());
    expect(spec.outcome.userOutcome).toBe("U1");

    spec = mergeSpec(spec, { outcome: { successMetric: "6% -> 15% upgrade rate" } }, seqIds("t2"));
    expect(spec.outcome.userOutcome).toBe("U1"); // untouched
    expect(spec.outcome.successMetric).toBe("6% -> 15% upgrade rate");
  });

  it("array append: milestoneArtifacts accumulate with client ids", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        milestoneArtifacts: [
          { kind: "pattern_shortlist", title: "Contextual offer", status: "selected", step: "find_patterns" },
        ],
      },
      seqIds(),
    );
    expect(spec.milestoneArtifacts).toHaveLength(1);
    expect(spec.milestoneArtifacts[0].id).toBe("id_0");
  });

  it("preserves reusable ingredients on pattern artifacts", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        milestoneArtifacts: [
          {
            kind: "pattern_shortlist",
            title: "Contextual offer",
            status: "exploring",
            supportingLine: "Introduces value at the moment of need.",
            ingredients: ["Right-time trigger", "Task-specific value"],
            step: "find_patterns",
          },
        ],
      },
      () => "pattern_1",
    );

    expect(spec.milestoneArtifacts[0].ingredients).toEqual([
      "Right-time trigger",
      "Task-specific value",
    ]);
  });

  it("preserves structured wireframe data for the visual renderer", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        milestoneArtifacts: [{
          kind: "wireframe",
          title: "Outcome-first page",
          status: "exploring",
          step: "choose_direction",
          wireframeSpec: {
            surface: "page",
            headline: "24% more completed bookings",
            blocks: ["Outcome", "Contribution", "Project"],
          },
        }],
      },
      () => "wireframe_1",
    );

    expect(spec.milestoneArtifacts[0].wireframeSpec).toEqual({
      surface: "page",
      headline: "24% more completed bookings",
      blocks: ["Outcome", "Contribution", "Project"],
    });
  });

  it("preserves safe pattern reference metadata and rejects unsafe URLs", () => {
    let spec = mergeSpec(
      emptySpec(),
      {
        milestoneArtifacts: [
          {
            kind: "pattern_shortlist",
            title: "Outcome-led action",
            status: "exploring",
            sourceUrl: "https://example.com/pattern",
            sourceTitle: "Example pattern",
            step: "find_patterns",
          },
          {
            kind: "pattern_shortlist",
            title: "Unsafe",
            status: "exploring",
            sourceUrl: "javascript:alert(1)",
            step: "find_patterns",
          },
        ],
      },
      seqIds(),
    );

    expect(spec.milestoneArtifacts[0].sourceUrl).toBe("https://example.com/pattern");
    expect(spec.milestoneArtifacts[0].sourceTitle).toBe("Example pattern");
    expect(spec.milestoneArtifacts[1].sourceUrl).toBeUndefined();
  });

  it("array append: buildHandoff appends a new handoff with nested instruction ids", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        buildHandoff: {
          title: "Import modal handoff",
          status: "ready",
          instructions: [{ label: "No permission", text: "Send upgrade request to admin" }],
          unresolvedDecisionCount: 0,
        },
      },
      seqIds(),
    );
    expect(spec.buildHandoffs).toHaveLength(1);
    expect(spec.buildHandoffs[0].instructions[0].label).toBe("No permission");
  });

  it("re-proposing a buildHandoff with the same title UPDATES it in place rather than duplicating", () => {
    let spec = mergeSpec(
      emptySpec(),
      {
        buildHandoff: {
          title: "Import modal handoff",
          status: "drafting",
          instructions: [{ label: "No permission", text: "TBD" }],
          unresolvedDecisionCount: 1,
        },
      },
      seqIds(),
    );
    spec = mergeSpec(
      spec,
      {
        buildHandoff: {
          title: "Import modal handoff",
          status: "ready",
          instructions: [{ label: "No permission", text: "Send upgrade request to admin" }],
          unresolvedDecisionCount: 0,
        },
      },
      seqIds("t2"),
    );
    expect(spec.buildHandoffs).toHaveLength(1); // updated, not appended
    expect(spec.buildHandoffs[0].status).toBe("ready");
    expect(spec.buildHandoffs[0].unresolvedDecisionCount).toBe(0);
  });

  it("re-proposing a buildHandoff with the same title as an already-SENT one is a no-op (never duplicates or reopens a sent record)", () => {
    let spec = mergeSpec(
      emptySpec(),
      {
        buildHandoff: {
          title: "Import modal handoff",
          status: "ready",
          instructions: [],
          unresolvedDecisionCount: 0,
        },
      },
      seqIds(),
    );
    spec = { ...spec, buildHandoffs: [{ ...spec.buildHandoffs[0], status: "sent" }] };
    spec = mergeSpec(
      spec,
      {
        buildHandoff: {
          title: "Import modal handoff",
          status: "drafting",
          instructions: [],
          unresolvedDecisionCount: 1,
        },
      },
      seqIds("t2"),
    );
    expect(spec.buildHandoffs).toHaveLength(1);
    expect(spec.buildHandoffs[0].status).toBe("sent"); // not reverted to "drafting"
  });

  it("scalar overwrite: workingBuild and verification merge onto sane defaults", () => {
    let spec = emptySpec();
    spec = mergeSpec(spec, { workingBuild: { buildUrl: "https://example.com/build" } }, seqIds());
    expect(spec.workingBuild?.status).toBe("not_reviewed"); // default filled in
    expect(spec.workingBuild?.buildUrl).toBe("https://example.com/build");

    spec = mergeSpec(
      spec,
      { verification: { buildId: "b1", reviewsPassed: 6, reviewsTotal: 6, criticalIssues: 0 } },
      seqIds("t2"),
    );
    expect(spec.verification?.status).toBe("not_reviewed"); // default filled in, not overwritten to undefined
    expect(spec.verification?.reviewsPassed).toBe(6);
  });

  it("array append: reviewFindings accumulate scoped by artifactId", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        reviewFindings: [
          {
            artifactId: "artifact-1",
            category: "acceptance_criteria",
            severity: "blocker",
            finding: "Trial CTA ignores upgrade permission",
            evidence: "Start 14-day trial is shown to all users",
            impact: "Users without permission hit a dead end",
            expectedCorrection: "Swap CTA for a permission request when unauthorized",
            relatedCriterion: "ac-2",
            status: "open",
          },
        ],
      },
      seqIds(),
    );
    expect(spec.reviewFindings).toHaveLength(1);
    expect(spec.reviewFindings[0].artifactId).toBe("artifact-1");
  });

  it("a vague finding (bare generic phrase, no cited criterion) is NOT accepted into reviewFindings", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        reviewFindings: [
          {
            artifactId: "artifact-1",
            category: "design_system",
            severity: "minor",
            finding: "Improve clarity",
            evidence: "n/a",
            impact: "n/a",
            expectedCorrection: "n/a",
            status: "open",
          },
        ],
      },
      seqIds(),
    );
    expect(spec.reviewFindings).toHaveLength(0);
  });

  it("a substantive finding without a cited criterion is still rejected (§G requires one)", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        reviewFindings: [
          {
            artifactId: "artifact-1",
            category: "design_system",
            severity: "minor",
            finding: "The button uses a nonstandard radius that doesn't match the design system.",
            evidence: "Button border-radius is 3px instead of the token value.",
            impact: "Visual inconsistency against the rest of the product.",
            expectedCorrection: "Use --radius-m instead of a hardcoded value.",
            // relatedCriterion intentionally omitted
            status: "open",
          },
        ],
      },
      seqIds(),
    );
    expect(spec.reviewFindings).toHaveLength(0);
  });

  it("a well-formed finding with real detail and a cited criterion is accepted", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        reviewFindings: [
          {
            artifactId: "artifact-1",
            category: "design_system",
            severity: "minor",
            finding: "The button uses a nonstandard radius that doesn't match the design system.",
            evidence: "Button border-radius is 3px instead of the token value.",
            impact: "Visual inconsistency against the rest of the product.",
            expectedCorrection: "Use --radius-m instead of a hardcoded value.",
            relatedCriterion: "design-system:radius-m",
            status: "open",
          },
        ],
      },
      seqIds(),
    );
    expect(spec.reviewFindings).toHaveLength(1);
  });

  it("recomputes completeness as fields are filled", () => {
    let spec = emptySpec();
    expect(spec.completeness).toBe(0);
    spec = mergeSpec(
      spec,
      { brief: { problem: "p", goal: "g", user: "u", moment: "m" } },
      seqIds(),
    );
    // problem, goal, (user && moment) = 3 of 10 checks
    expect(spec.completeness).toBe(0.3);
  });
});

describe("isVagueFinding", () => {
  const good = {
    finding: "The button uses a nonstandard radius that doesn't match the design system.",
    evidence: "Button border-radius is 3px instead of the token value.",
    impact: "Visual inconsistency against the rest of the product.",
    expectedCorrection: "Use --radius-m instead of a hardcoded value.",
    relatedCriterion: "design-system:radius-m",
  };

  it("accepts a well-formed finding", () => {
    expect(isVagueFinding(good)).toBe(false);
  });

  it("rejects short/empty supporting fields", () => {
    expect(isVagueFinding({ ...good, evidence: "" })).toBe(true);
    expect(isVagueFinding({ ...good, impact: "no" })).toBe(true);
  });

  it("rejects a missing relatedCriterion", () => {
    expect(isVagueFinding({ ...good, relatedCriterion: undefined })).toBe(true);
    expect(isVagueFinding({ ...good, relatedCriterion: "  " })).toBe(true);
  });

  it("rejects bare generic phrases as the finding text, case-insensitively", () => {
    expect(isVagueFinding({ ...good, finding: "Improve clarity" })).toBe(true);
    expect(isVagueFinding({ ...good, finding: "needs work" })).toBe(true);
  });

  it("does not reject a real finding that happens to contain a generic word as part of a full sentence", () => {
    expect(
      isVagueFinding({
        ...good,
        finding: "Copy needs work to match the locked tone — currently reads as an error, not a status.",
      }),
    ).toBe(false);
  });
});

describe("toActivityEvents", () => {
  it("assigns client id + timestamp and preserves order", () => {
    const events = toActivityEvents(
      [
        { type: "brief_updated", label: "Brief updated" },
        { type: "decision_captured", label: "Decision captured", description: "why" },
      ],
      "2026-07-08T00:00:00.000Z",
      seqIds("evt"),
    );
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe("evt_0");
    expect(events[0].createdAt).toBe("2026-07-08T00:00:00.000Z");
    expect(events[1].description).toBe("why");
  });
});

describe("user-driven state helpers (not part of the Coach turn contract)", () => {
  it("setMilestoneArtifactStatus updates only the targeted artifact, purely", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        milestoneArtifacts: [
          { kind: "pattern_shortlist", title: "A", status: "exploring", step: "find_patterns" },
          { kind: "pattern_shortlist", title: "B", status: "exploring", step: "find_patterns" },
        ],
      },
      seqIds(),
    );
    const targetId = spec.milestoneArtifacts[0].id;
    const next = setMilestoneArtifactStatus(spec, targetId, "selected");

    expect(next.milestoneArtifacts[0].status).toBe("selected");
    expect(next.milestoneArtifacts[1].status).toBe("exploring");
    expect(spec.milestoneArtifacts[0].status).toBe("exploring"); // original untouched
  });

  it("updateBuildHandoff patches an existing handoff without touching others", () => {
    const spec = mergeSpec(
      emptySpec(),
      {
        buildHandoff: {
          title: "H1",
          status: "drafting",
          instructions: [],
          unresolvedDecisionCount: 2,
        },
      },
      seqIds(),
    );
    const id = spec.buildHandoffs[0].id;
    const next = updateBuildHandoff(spec, id, { status: "ready" });
    expect(next.buildHandoffs[0].status).toBe("ready");
    expect(spec.buildHandoffs[0].status).toBe("drafting");
  });

  it("updateWorkingBuild merges onto defaults when no working build exists yet", () => {
    const spec = emptySpec();
    const next = updateWorkingBuild(spec, { buildUrl: "https://example.com" });
    expect(next.workingBuild?.buildUrl).toBe("https://example.com");
    expect(next.workingBuild?.status).toBe("not_reviewed");
    expect(spec.workingBuild).toBeUndefined(); // original untouched
  });
});

describe("review category state (deterministic, not model-trusted)", () => {
  const finding = (over: Partial<ReviewFinding>): ReviewFinding => ({
    id: "f1",
    artifactId: "a1",
    category: "acceptance_criteria",
    severity: "blocker",
    finding: "x",
    evidence: "x",
    impact: "x",
    expectedCorrection: "x",
    status: "open",
    ...over,
  });

  it("a category with no findings passes", () => {
    expect(reviewCategoryState([], "acceptance_criteria")).toBe("passed");
  });

  it("an open blocker or important finding fails its category", () => {
    expect(reviewCategoryState([finding({ severity: "blocker" })], "acceptance_criteria")).toBe(
      "failed",
    );
    expect(reviewCategoryState([finding({ severity: "important" })], "acceptance_criteria")).toBe(
      "failed",
    );
  });

  it("a minor finding, or a resolved/accepted one, does not fail the category", () => {
    expect(reviewCategoryState([finding({ severity: "minor" })], "acceptance_criteria")).toBe(
      "passed",
    );
    expect(
      reviewCategoryState([finding({ severity: "blocker", status: "resolved" })], "acceptance_criteria"),
    ).toBe("passed");
  });

  it("countPassedCategories tallies across the full category list", () => {
    const findings = [finding({ category: "acceptance_criteria", severity: "blocker" })];
    const categories = ["acceptance_criteria", "design_system", "accessibility"] as const;
    expect(countPassedCategories(findings, [...categories])).toBe(2); // one failing, two passing
  });
});

describe("stepSummaryLine (Guide default view — a five-second summary, not the full record)", () => {
  it("returns null when the step has nothing captured yet", () => {
    expect(stepSummaryLine(emptySpec(), "understand_request")).toBeNull();
  });

  it("uses the single authoritative brief field for steps that have one", () => {
    const spec = { ...emptySpec(), brief: { goal: "Win more freelance work" } };
    expect(stepSummaryLine(spec, "understand_request")).toBe("Win more freelance work");

    const withProblem = { ...emptySpec(), brief: { problem: "Visitors can't see builder fit" } };
    expect(stepSummaryLine(withProblem, "define_problem")).toBe("Visitors can't see builder fit");
  });

  it("combines user + moment for identify_users when both are present", () => {
    const spec = { ...emptySpec(), brief: { user: "Hiring managers", moment: "first visit to the portfolio" } };
    expect(stepSummaryLine(spec, "identify_users")).toBe("Hiring managers — first visit to the portfolio");
  });

  it("falls back to user or moment alone when only one is present", () => {
    expect(stepSummaryLine({ ...emptySpec(), brief: { user: "Hiring managers" } }, "identify_users")).toBe(
      "Hiring managers",
    );
    expect(stepSummaryLine({ ...emptySpec(), brief: { moment: "first visit" } }, "identify_users")).toBe(
      "first visit",
    );
  });

  it("never surfaces the Known/Assumed/Interpretation/Risk/Decision labels — falls back to stripped captured items", () => {
    const spec = {
      ...emptySpec(),
      evidence: [
        { id: "e1", kind: "fact" as const, text: "226 visitors, mostly direct traffic", step: "assess_evidence" as const },
        { id: "e2", kind: "risk" as const, text: "No onsite conversion tracking", step: "assess_evidence" as const },
      ],
    };
    const line = stepSummaryLine(spec, "assess_evidence");
    expect(line).not.toBeNull();
    expect(line).not.toMatch(/Known:|Assumed:|Interpretation:|Risk:|Decision:/);
    expect(line).toContain("226 visitors, mostly direct traffic");
  });

  it("never truncates — a tooltip that cuts off its own content defeats the point of hovering for more", () => {
    const longText = "x".repeat(200);
    const spec = {
      ...emptySpec(),
      evidence: [{ id: "e1", kind: "fact" as const, text: longText, step: "assess_evidence" as const }],
    };
    const line = stepSummaryLine(spec, "assess_evidence");
    expect(line).toBe(longText);
  });

  it("uses the outcome fields for define_outcome, preferring userOutcome first", () => {
    const spec = { ...emptySpec(), outcome: { userOutcome: "Understands pricing in one glance" } };
    expect(stepSummaryLine(spec, "define_outcome")).toBe("Understands pricing in one glance");
  });
});

describe("stepCapturedItems", () => {
  it("labels the identify-users task generically across work types", () => {
    const spec = {
      ...emptySpec(),
      brief: {
        user: "A founder or Head of Product",
        moment: "When evaluating contract help",
        task: "Judge fit and decide whether to reach out",
      },
    };

    expect(stepCapturedItems(spec, "identify_users")).toContain(
      "Task: Judge fit and decide whether to reach out",
    );
  });
});

describe("stageSummaryLine (loop-stage tooltip aggregate)", () => {
  it("returns null when no substep in the stage has anything captured", () => {
    expect(stageSummaryLine(emptySpec(), "frame")).toBeNull();
  });

  it("joins the captured substeps' summaries in flow order", () => {
    const spec = { ...emptySpec(), brief: { goal: "Win more freelance work", problem: "Can't see fit" } };
    const line = stageSummaryLine(spec, "frame");
    expect(line).toBe("Win more freelance work; Can't see fit");
  });
});
