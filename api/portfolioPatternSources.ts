export type VerifiedPortfolioPatternSource = {
  designer: string;
  sourceTitle: string;
  sourceUrl: string;
  usefulFor: string;
};

// Designer-owned, public portfolio pages that have been manually reviewed as
// suitable screenshot sources. This is a recovery catalog, not a fixed
// shortlist: the Coach should still search first and derive patterns from the
// project's locked criteria.
export const VERIFIED_PORTFOLIO_PATTERN_SOURCES: readonly VerifiedPortfolioPatternSource[] = [
  {
    designer: "Joey Shiner",
    sourceTitle: "Joey Shiner — Digital Product Designer",
    sourceUrl: "https://www.joeyshiner.com/",
    usefulFor: "large personal positioning, scannable project cards, and outcome-led project summaries",
  },
  {
    designer: "Cathy Yan",
    sourceTitle: "Cathy Yan — Design Portfolio",
    sourceUrl: "https://www.cathyyan.com/",
    usefulFor: "clear role positioning, highlighted work, and concise project framing",
  },
  {
    designer: "Moritz Oesterlau",
    sourceTitle: "Moritz Oesterlau — UX/UI Designer",
    sourceUrl: "https://www.moritzoesterlau.de/",
    usefulFor: "process-led case studies, visible role framing, and direct navigation",
  },
  {
    designer: "Elizabeth Lin",
    sourceTitle: "Elizabeth Lin — Product Designer & Educator",
    sourceUrl: "https://www.elizabethylin.com/",
    usefulFor: "distinctive personality, narrative project framing, and memorable visual identity",
  },
  {
    designer: "Gloria Lo",
    sourceTitle: "Gloria Lo — Product Designer",
    sourceUrl: "https://www.glorialo.design/",
    usefulFor: "compact personal introduction, recent-work hierarchy, and expressive visual storytelling",
  },
  {
    designer: "Pratibha Joshi",
    sourceTitle: "Pratibha Joshi — Product Designer",
    sourceUrl: "https://www.pratibhajoshi.com/",
    usefulFor: "credential-led positioning, project gallery hierarchy, and broad proof of craft",
  },
] as const;

export function verifiedPortfolioSourcePrompt(): string {
  return VERIFIED_PORTFOLIO_PATTERN_SOURCES.map(
    (source) =>
      `- ${source.sourceTitle}: ${source.sourceUrl} — useful for ${source.usefulFor}.`,
  ).join("\n");
}
