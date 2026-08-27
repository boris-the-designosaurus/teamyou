import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptySpec, WIREFRAME_REVIEW_CATEGORIES, type MilestoneArtifact } from "../types";
import { ReviewWorkspace } from "./ReviewWorkspace";

describe("ReviewWorkspace review depth", () => {
  it("shows structural direction checks for a wireframe", () => {
    const artifact: MilestoneArtifact = {
      id: "wireframe-1",
      kind: "wireframe",
      title: "Outcome-led direction",
      status: "exploring",
      wireframeSpec: {
        surface: "page",
        layout: "portfolio_home",
        headline: "Proof before the scroll",
        blocks: ["Outcome", "Contribution"],
      },
      createdAt: "2026-08-27T12:00:00.000Z",
      step: "choose_direction",
    };
    const spec = emptySpec();
    spec.milestoneArtifacts = [artifact];

    const html = renderToStaticMarkup(
      <ReviewWorkspace
        artifact={artifact}
        artifacts={[artifact]}
        spec={spec}
        reviewCategories={WIREFRAME_REVIEW_CATEGORIES}
        onClose={vi.fn()}
        onSelectArtifact={vi.fn()}
        onChooseArtifact={vi.fn()}
        onUpdateSpec={vi.fn()}
        onRunReview={vi.fn()}
        onApproveForBuild={vi.fn()}
        onAskAI={vi.fn()}
        reviewRunning={false}
        reviewHasRun={false}
      />,
    );

    expect(html).toContain("Direction checks");
    expect(html).toContain("Original problem");
    expect(html).toContain("Locked criteria");
    expect(html).toContain("Hierarchy &amp; core flow");
    expect(html).toContain("Scope &amp; key risks");
    expect(html).toContain("Check direction");
    expect(html).not.toContain("Design system");
    expect(html).not.toContain("Accessibility");
    expect(html).not.toContain("Responsive");
  });
});
