import { describe, it, expect } from "vitest";
import { mergeSpec, toActivityEvents } from "./merge";
import { emptySpec, type SpecUpdates } from "./types";

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
      { decisions: [{ text: "D1", step: "brief", source: "user" }] },
      seqIds(),
    );
    spec = mergeSpec(
      spec,
      { decisions: [{ text: "D2", step: "workflow", source: "coach" }] },
      seqIds("later"),
    );

    expect(spec.decisions).toHaveLength(2);
    expect(spec.decisions.map((d) => d.text)).toEqual(["D1", "D2"]);
  });

  it("array append: workflow steps and open questions accumulate", () => {
    let spec = emptySpec();
    spec = mergeSpec(
      spec,
      {
        workflow: { steps: [{ title: "S1", order: 1 }] },
        openQuestions: [{ text: "Q1", step: "brief", status: "open" }],
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
        decisions: [{ text: "D1", step: "rules", source: "coach" }],
        openQuestions: [{ text: "Q1", step: "rules", status: "open" }],
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
    const updates: SpecUpdates = { decisions: [{ text: "D", step: "brief", source: "user" }] };
    const result = mergeSpec(spec, updates, seqIds());
    expect(spec.decisions).toHaveLength(0);
    expect(result.decisions).toHaveLength(1);
  });

  it("recomputes completeness as fields are filled", () => {
    let spec = emptySpec();
    expect(spec.completeness).toBe(0);
    spec = mergeSpec(
      spec,
      { brief: { problem: "p", goal: "g", context: "c", risk: "r" } },
      seqIds(),
    );
    expect(spec.completeness).toBe(0.5); // 4 of 8 checks
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
