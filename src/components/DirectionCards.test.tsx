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
  });
});
