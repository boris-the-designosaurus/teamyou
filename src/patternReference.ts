import type { MilestoneArtifact } from "./types";

const MICROLINK_ENDPOINT = "https://api.microlink.io";

export function isPublicHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Resolve a public reference page into an embeddable viewport screenshot. */
export function pagePreviewUrl(sourceUrl: string | undefined): string | undefined {
  if (!isPublicHttpUrl(sourceUrl)) return undefined;
  const params = new URLSearchParams({
    url: sourceUrl,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
  });
  return `${MICROLINK_ENDPOINT}?${params.toString()}`;
}

export function initialPatternImage(artifact: MilestoneArtifact): string | undefined {
  return artifact.thumbnailUrl ?? pagePreviewUrl(artifact.sourceUrl);
}

export function patternSourceLabel(artifact: MilestoneArtifact): string {
  if (artifact.sourceTitle?.trim()) return artifact.sourceTitle.trim();
  if (!isPublicHttpUrl(artifact.sourceUrl)) return "View source";
  return new URL(artifact.sourceUrl).hostname.replace(/^www\./, "");
}
