import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MilestoneArtifact } from "../types";
import { DirectionCards } from "./DirectionCards";

describe("DirectionCards pattern workspace", () => {
  it("shows reusable pattern ingredients and the multi-select action", () => {
    const artifacts: MilestoneArtifact[] = [
      {
        id: "pattern-1",
        kind: "pattern_shortlist",
        title: "Contextual offer",
        status: "selected",
        supportingLine: "Introduces value at the moment of need.",
        sourceUrl: "https://www.example.com/patterns/contextual-offer",
        sourceTitle: "Example pattern library",
        ingredients: ["Right-time trigger", "Task-specific value", "Upgrade CTA"],
        createdAt: "2026-08-23T12:00:00.000Z",
        step: "find_patterns",
      },
      {
        id: "pattern-2",
        kind: "pattern_shortlist",
        title: "Control before commitment",
        status: "exploring",
        ingredients: ["Manual review", "User control"],
        createdAt: "2026-08-23T12:00:00.000Z",
        step: "find_patterns",
      },
    ];

    const html = renderToStaticMarkup(
      <DirectionCards artifacts={artifacts} onChoose={vi.fn()} onContinue={vi.fn()} />,
    );

    expect(html).toContain("Right-time trigger");
    expect(html).toContain("Task-specific value");
    expect(html).toContain("1 selected");
    expect(html).toContain("Generate wireframes");
    expect(html).toContain("/api/pattern-thumbnail");
    expect(html).toContain("Reference: Example pattern library");
    expect(html).toContain('href="https://www.example.com/patterns/contextual-offer"');
    expect(html).toContain('aria-label="View larger example for Contextual offer"');
    expect(html).toContain("View larger");
    expect(html).toContain('aria-label="View larger example for Control before commitment"');
    expect(html).toContain("Live example required");
    expect(html).not.toContain("24%");
    expect(html).not.toContain("pattern-visual-fallback");
    expect(html).not.toContain('disabled="" aria-label="View larger example for Control before commitment"');
    expect(html).toContain('aria-label="Refresh thumbnail for Contextual offer"');
    expect(html).toContain('title="Capture a fresh thumbnail"');
  });

  it("draws wireframe artifacts instead of asking for a live example", () => {
    const artifacts: MilestoneArtifact[] = [{
      id: "wireframe-1",
      kind: "wireframe",
      title: "Metric-led portfolio",
      status: "exploring",
      supportingLine: "Lead with proof before biography.",
      ingredients: ["Outcome proof", "Personal voice", "Project cards"],
      wireframeSpec: {
        surface: "page",
        layout: "portfolio_home",
        eyebrow: "Selected work",
        headline: "24% more completed bookings",
        body: "Senior product designer for complex SaaS workflows.",
        primaryAction: "View project",
        blocks: ["Role + contribution", "Outcome proof", "Project teaser"],
      },
      createdAt: "2026-08-25T12:00:00.000Z",
      step: "choose_direction",
    }];

    const html = renderToStaticMarkup(
      <DirectionCards artifacts={artifacts} onChoose={vi.fn()} onContinue={vi.fn()} />,
    );

    expect(html).toContain('aria-label="Wireframe for Metric-led portfolio"');
    expect(html).toContain("24% more completed bookings");
    expect(html).toContain("Role + contribution");
    expect(html).toContain("Selected work");
    expect(html).toContain("Jonathan Warrecker");
    expect(html).toContain("Work");
    expect(html).toContain("wireframe-home-projects");
    expect(html).toContain("wireframe-layout-portfolio_home");
    expect(html).toContain("Develop selected direction");
    expect(html).not.toContain("Live example required");
  });

  it("draws a full case-study narrative when the page layout asks for one", () => {
    const artifact: MilestoneArtifact = {
      id: "wireframe-case-1",
      kind: "wireframe",
      title: "TeamYou case study",
      status: "exploring",
      supportingLine: "Connect the decisions to the result.",
      ingredients: ["Decision trail", "Measured outcome", "Next project"],
      wireframeSpec: {
        surface: "page",
        layout: "case_study",
        eyebrow: "TeamYou",
        headline: "A judgment system for product work",
        blocks: ["Key contribution", "Self scheduling", "Results"],
      },
      createdAt: "2026-08-25T12:00:00.000Z",
      step: "choose_direction",
    };

    const html = renderToStaticMarkup(
      <DirectionCards artifacts={[artifact]} onChoose={vi.fn()} onContinue={vi.fn()} />,
    );

    expect(html).toContain("wireframe-layout-case_study");
    expect(html).toContain("Background");
    expect(html).toContain("Problem");
    expect(html).toContain("Solution");
    expect(html).toContain("Results");
    expect(html).toContain("Up next");
    expect(html).toContain("Contact");
  });
});
