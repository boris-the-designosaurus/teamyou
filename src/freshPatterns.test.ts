import { describe, expect, it } from "vitest";
import { emptySpec, type WorkItem } from "./types";
import { requestsFreshPatternSearch, resetForFreshPatternSearch } from "./freshPatterns";

function workItem(): WorkItem {
  const spec = emptySpec();
  spec.milestoneArtifacts = [
    {
      id: "pattern-1",
      kind: "pattern_shortlist",
      title: "Old pattern",
      status: "selected",
      createdAt: "2026-08-25T00:00:00.000Z",
      step: "find_patterns",
    },
    {
      id: "wireframe-1",
      kind: "wireframe",
      title: "Existing wireframe",
      status: "exploring",
      createdAt: "2026-08-25T00:00:00.000Z",
      step: "refine_treatments",
    },
  ];
  return {
    id: "project-1",
    title: "Portfolio redesign",
    type: "design_project",
    workMode: "design_exploration",
    status: "drafting",
    currentStep: "choose_direction",
    spec,
    messages: [
      {
        id: "message-1",
        role: "coach",
        content: "Old cards",
        milestoneArtifactIds: ["pattern-1", "wireframe-1"],
        createdAt: "2026-08-25T00:00:00.000Z",
      },
    ],
    activity: [],
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

describe("fresh pattern search", () => {
  it.each(["Generate fresh patterns", "find new pattern cards", "search for different examples"])(
    "recognizes %s",
    (text) => expect(requestsFreshPatternSearch(text)).toBe(true),
  );

  it("clears only pattern cards and their historical message links", () => {
    const reset = resetForFreshPatternSearch(workItem());
    expect(reset.currentStep).toBe("find_patterns");
    expect(reset.spec.milestoneArtifacts.map((artifact) => artifact.id)).toEqual(["wireframe-1"]);
    expect(reset.messages[0].milestoneArtifactIds).toEqual(["wireframe-1"]);
  });
});
