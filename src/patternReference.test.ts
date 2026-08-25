import { describe, expect, it } from "vitest";
import {
  initialPatternImage,
  isPublicHttpUrl,
  pagePreviewUrl,
  patternSourceLabel,
} from "./patternReference";

describe("pattern reference previews", () => {
  it("builds a screenshot preview for a public source page", () => {
    const preview = pagePreviewUrl("https://example.com/product?view=pattern");
    expect(preview).toContain("/api/pattern-thumbnail?");
    expect(preview).toContain("url=https%3A%2F%2Fexample.com%2Fproduct%3Fview%3Dpattern");
  });

  it("can force a fresh screenshot instead of using the cached copy", () => {
    const preview = pagePreviewUrl("https://example.com/product", { force: true });
    expect(preview).toContain("force=true");
  });

  it("prefers a live source capture over a stale saved pattern thumbnail", () => {
    const image = initialPatternImage({
      id: "p1",
      kind: "pattern_shortlist",
      title: "Outcome-first",
      status: "exploring",
      sourceUrl: "https://designer.example/work",
      thumbnailUrl: "data:image/svg+xml;base64,old-wireframe",
      createdAt: "2026-08-25T00:00:00.000Z",
      step: "find_patterns",
    });

    expect(image).toContain("/api/pattern-thumbnail?");
    expect(image).toContain("designer.example");
    expect(image).not.toContain("old-wireframe");
  });

  it("rejects non-http links", () => {
    expect(isPublicHttpUrl("javascript:alert(1)")).toBe(false);
    expect(pagePreviewUrl("data:image/png;base64,abc")).toBeUndefined();
  });

  it("uses a source title when present and otherwise shows the hostname", () => {
    const base = {
      id: "p1",
      kind: "pattern_shortlist" as const,
      title: "Pattern",
      status: "exploring" as const,
      sourceUrl: "https://www.example.com/reference",
      createdAt: "2026-08-25T00:00:00.000Z",
      step: "find_patterns" as const,
    };
    expect(patternSourceLabel({ ...base, sourceTitle: "Example case study" })).toBe(
      "Example case study",
    );
    expect(patternSourceLabel(base)).toBe("example.com");
  });
});
