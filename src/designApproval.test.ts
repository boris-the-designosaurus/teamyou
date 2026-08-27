import { describe, expect, it } from "vitest";
import { emptySpec, type WorkItem } from "./types";
import { approveDesignForBuild } from "./designApproval";

describe("approveDesignForBuild", () => {
  it("approves the design and enters specification immediately", () => {
    const spec = emptySpec();
    spec.milestoneArtifacts = [{
      id: "hifi-1",
      kind: "hifi_design",
      title: "Trust-first",
      status: "ready_for_review",
      createdAt: "2026-08-27T12:00:00.000Z",
      step: "select_for_review",
    }];
    const workItem: WorkItem = {
      id: "project-1",
      title: "Improve adoption",
      type: "design_project",
      workMode: "design_exploration",
      status: "drafting",
      currentStep: "select_for_review",
      messages: [],
      spec,
      activity: [],
      createdAt: "2026-08-27T12:00:00.000Z",
      updatedAt: "2026-08-27T12:00:00.000Z",
    };

    const next = approveDesignForBuild(
      workItem,
      "hifi-1",
      "2026-08-27T13:00:00.000Z",
      "marker-1",
    );

    expect(next.currentStep).toBe("prepare_handoff");
    expect(next.spec.milestoneArtifacts[0].status).toBe("approved_for_build");
    expect(next.messages).toContainEqual(expect.objectContaining({
      id: "marker-1",
      role: "system",
      content: "Complete the specification started",
    }));
  });
});
