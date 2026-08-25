import { describe, expect, it } from "vitest";
import {
  VERIFIED_PORTFOLIO_PATTERN_SOURCES,
  verifiedPortfolioSourcePrompt,
} from "./portfolioPatternSources";

describe("verified portfolio pattern sources", () => {
  it("provides enough distinct designer-owned sources for a complete fallback set", () => {
    expect(VERIFIED_PORTFOLIO_PATTERN_SOURCES.length).toBeGreaterThanOrEqual(5);

    const urls = VERIFIED_PORTFOLIO_PATTERN_SOURCES.map((source) => source.sourceUrl);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((url) => url.startsWith("https://"))).toBe(true);
  });

  it("does not include known editorial, marketplace, or portfolio-builder sources", () => {
    const blocked = /(?:medium\.com|uxfol\.io|tailorcv\.com|productic\.net|productdesignportfolios\.com|\/blog\/|\/guide\/|\/templates?\/)/i;

    for (const source of VERIFIED_PORTFOLIO_PATTERN_SOURCES) {
      expect(source.sourceUrl).not.toMatch(blocked);
      expect(source.designer.trim()).not.toBe("");
      expect(source.usefulFor.trim()).not.toBe("");
    }
  });

  it("renders source URLs and selection guidance into the model prompt", () => {
    const prompt = verifiedPortfolioSourcePrompt();
    expect(prompt).toContain("Joey Shiner");
    expect(prompt).toContain("Pratibha Joshi");
    expect(prompt).toContain("https://www.glorialo.design/");
  });
});
