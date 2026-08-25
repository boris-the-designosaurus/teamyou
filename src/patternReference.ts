import type { MilestoneArtifact } from "./types";

const PATTERN_THUMBNAIL_ENDPOINT = "/api/pattern-thumbnail";

export function isPublicHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Resolve a public reference page through TeamYou's server-owned screenshot proxy. */
export function pagePreviewUrl(
  sourceUrl: string | undefined,
  options: { force?: boolean } = {},
): string | undefined {
  if (!isPublicHttpUrl(sourceUrl)) return undefined;
  const params = new URLSearchParams({
    url: sourceUrl,
  });
  if (options.force) params.set("force", "true");
  return `${PATTERN_THUMBNAIL_ENDPOINT}?${params.toString()}`;
}

export function initialPatternImage(artifact: MilestoneArtifact): string | undefined {
  // Pattern evidence must reflect the cited designer-owned page. Older saved
  // artifacts can contain generated wireframes in thumbnailUrl; never let
  // those stale illustrations override a live source capture.
  if (artifact.kind === "pattern_shortlist" && isPublicHttpUrl(artifact.sourceUrl)) {
    return pagePreviewUrl(artifact.sourceUrl);
  }
  return artifact.thumbnailUrl ?? pagePreviewUrl(artifact.sourceUrl);
}

export function patternSourceLabel(artifact: MilestoneArtifact): string {
  if (artifact.sourceTitle?.trim()) return artifact.sourceTitle.trim();
  if (!isPublicHttpUrl(artifact.sourceUrl)) return "View source";
  return new URL(artifact.sourceUrl).hostname.replace(/^www\./, "");
}
