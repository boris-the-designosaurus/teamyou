import { describe, it, expect } from "vitest";
import { FLOW_STEPS, LOOP_STAGE_OF, stepsForStage, type FlowStep } from "./types";

describe("FLOW_STEPS order (TEAMYOU_SOURCE_OF_TRUTH.md framing spine)", () => {
  it("Frame the problem follows the stable required order — Define the problem is step 2, not step 5", () => {
    expect(stepsForStage("frame")).toEqual([
      "understand_request",
      "define_problem",
      "identify_users",
      "assess_evidence",
      "find_root_cause",
      "set_scope",
      "define_outcome",
    ]);
  });

  it("Define the problem comes immediately after Understand the request", () => {
    const idxUnderstand = FLOW_STEPS.indexOf("understand_request");
    const idxDefine = FLOW_STEPS.indexOf("define_problem");
    expect(idxDefine).toBe(idxUnderstand + 1);
  });

  it("every step still belongs to exactly the loop stage it did before reordering (regression guard)", () => {
    const expected: Record<FlowStep, string> = {
      understand_request: "frame",
      define_problem: "frame",
      identify_users: "frame",
      assess_evidence: "frame",
      find_root_cause: "frame",
      set_scope: "frame",
      define_outcome: "frame",
      set_criteria: "explore",
      find_patterns: "explore",
      review_shortlist: "explore",
      choose_direction: "explore",
      refine_treatments: "design",
      select_for_review: "design",
      prepare_handoff: "specify_build",
      build_in_tool: "specify_build",
      verify_build: "specify_build",
    };
    for (const step of FLOW_STEPS) {
      expect(LOOP_STAGE_OF[step]).toBe(expected[step]);
    }
  });

  it("reordering never drops or duplicates a step — existing persisted currentStep values remain valid", () => {
    expect(new Set(FLOW_STEPS).size).toBe(FLOW_STEPS.length);
    expect(FLOW_STEPS).toHaveLength(16);
  });
});
