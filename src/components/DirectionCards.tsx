import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MilestoneArtifact } from "../types";
import { CheckmarkIcon } from "../icons";
import {
  initialPatternImage,
  isPublicHttpUrl,
  pagePreviewUrl,
  patternSourceLabel,
} from "../patternReference";

const CHOSEN_STATUSES = new Set(["selected", "ready_for_review", "approved_for_build"]);

function fallbackVariant(title: string): number {
  return Array.from(title).reduce((total, char) => total + char.charCodeAt(0), 0) % 5;
}

/**
 * A source-less pattern should still be visually comparable. This deliberately
 * looks like a tiny structural wireframe (not a fake screenshot of a real
 * product) and varies by title so a set never collapses into identical blanks.
 */
function PatternVisualFallback({ artifact }: { artifact: MilestoneArtifact }) {
  const variant = fallbackVariant(artifact.title);
  const labels = (artifact.ingredients ?? []).slice(0, 3);

  return (
    <div
      className={`pattern-visual-fallback pattern-visual-fallback-${variant}`}
      role="img"
      aria-label={`Structural preview for ${artifact.title}`}
    >
      <div className="pattern-visual-browserbar">
        <i />
        <i />
        <i />
      </div>
      <div className="pattern-visual-canvas">
        <div className="pattern-visual-eyebrow" />
        <div className="pattern-visual-headline" />
        <div className="pattern-visual-subhead" />
        <div className="pattern-visual-proof">
          <b>24%</b>
          <span />
        </div>
        <div className="pattern-visual-panel pattern-visual-panel-a" />
        <div className="pattern-visual-panel pattern-visual-panel-b" />
        <div className="pattern-visual-panel pattern-visual-panel-c" />
      </div>
      {labels.length > 0 && (
        <div className="pattern-visual-labels" aria-hidden>
          {labels.map((label) => <span key={label}>{label}</span>)}
        </div>
      )}
    </div>
  );
}

function PatternThumbnail({
  artifact,
  imageUrlOverride,
}: {
  artifact: MilestoneArtifact;
  imageUrlOverride?: string;
}) {
  const [imageUrl, setImageUrl] = useState(
    () => imageUrlOverride ?? initialPatternImage(artifact),
  );
  const [failed, setFailed] = useState(false);
  const screenshotUrl = pagePreviewUrl(artifact.sourceUrl);

  useEffect(() => {
    setImageUrl(imageUrlOverride ?? initialPatternImage(artifact));
    setFailed(false);
  }, [artifact, imageUrlOverride]);

  useEffect(() => {
    if (!imageUrl || failed) return;
    const timer = window.setTimeout(() => setFailed(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [imageUrl, failed]);

  if (!imageUrl || failed) {
    return artifact.kind === "pattern_shortlist"
      ? <PatternVisualFallback artifact={artifact} />
      : <div className="direction-card-thumb-placeholder" aria-hidden />;
  }

  return (
    <img
      src={imageUrl}
      alt={`Reference example for ${artifact.title}`}
      loading="lazy"
      onError={() => {
        if (screenshotUrl && imageUrl !== screenshotUrl) {
          setImageUrl(screenshotUrl);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

function PatternPreview(props: {
  artifact: MilestoneArtifact;
  imageUrlOverride?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  onClose: () => void;
}) {
  const { artifact, imageUrlOverride, refreshing, onRefresh, onClose } = props;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const dialog = (
    <div
      className="pattern-preview-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="pattern-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pattern-preview-title"
      >
        <header className="pattern-preview-header">
          <div>
            <h2 id="pattern-preview-title">{artifact.title}</h2>
            {artifact.supportingLine && <p>{artifact.supportingLine}</p>}
          </div>
          <div className="pattern-preview-header-actions">
            {onRefresh && (
              <button
                type="button"
                className="pattern-preview-refresh"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label={`Refresh thumbnail for ${artifact.title}`}
                title="Capture a fresh thumbnail"
              >
                ↻ <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
              </button>
            )}
            <button
              type="button"
              className="pattern-preview-close"
              onClick={onClose}
              aria-label="Close pattern preview"
              autoFocus
            >
              ×
            </button>
          </div>
        </header>

        <div className="pattern-preview-image">
          <PatternThumbnail artifact={artifact} imageUrlOverride={imageUrlOverride} />
        </div>

        {isPublicHttpUrl(artifact.sourceUrl) && (
          <footer className="pattern-preview-footer">
            <span>Reference: {patternSourceLabel(artifact)}</span>
            <a href={artifact.sourceUrl} target="_blank" rel="noreferrer">
              Open original example <span aria-hidden>↗</span>
            </a>
          </footer>
        )}
      </section>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

/**
 * The pattern/wireframe/treatment "Choose" grid shown inline in chat during
 * Explore directions and Design the solution — a genuine shortlist the user
 * picks from (not the old one-option-at-a-time micro-decision pattern).
 * Pattern shortlists are multi-select; every other kind is exclusive — see
 * chooseMilestoneArtifact in merge.ts.
 */
export function DirectionCards(props: {
  artifacts: MilestoneArtifact[];
  onChoose: (artifactId: string) => void;
  onContinue?: (selected: MilestoneArtifact[]) => void;
}) {
  const { artifacts, onChoose, onContinue } = props;
  const [previewArtifact, setPreviewArtifact] = useState<MilestoneArtifact | null>(null);
  const [refreshedImages, setRefreshedImages] = useState<Record<string, string>>({});
  const [refreshingIds, setRefreshingIds] = useState<Record<string, boolean>>({});
  const objectUrls = useRef<Record<string, string>>({});

  useEffect(
    () => () => {
      Object.values(objectUrls.current).forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  if (!artifacts.length) return null;

  const isShortlist = artifacts[0].kind === "pattern_shortlist";
  const chosen = artifacts.filter((a) => CHOSEN_STATUSES.has(a.status));
  const refreshThumbnail = async (artifact: MilestoneArtifact) => {
    const freshUrl = pagePreviewUrl(artifact.sourceUrl, { force: true });
    if (!freshUrl || refreshingIds[artifact.id]) return;
    setRefreshingIds((current) => ({ ...current, [artifact.id]: true }));

    try {
      // TeamYou's same-origin endpoint forwards force=true to the capture
      // service; no-store prevents the browser from returning its own copy.
      const response = await fetch(freshUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Thumbnail refresh failed (${response.status})`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const previous = objectUrls.current[artifact.id];
      objectUrls.current[artifact.id] = blobUrl;
      setRefreshedImages((current) => ({ ...current, [artifact.id]: blobUrl }));
      if (previous) URL.revokeObjectURL(previous);
    } catch {
      // If cross-origin fetch is unavailable, loading the forced URL directly
      // still requests a fresh Microlink cache copy.
      setRefreshedImages((current) => ({ ...current, [artifact.id]: freshUrl }));
    } finally {
      setRefreshingIds((current) => ({ ...current, [artifact.id]: false }));
    }
  };

  return (
    <div className="direction-cards-wrap">
      <div className="direction-cards">
        {artifacts.map((a) => {
          const isChosen = CHOSEN_STATUSES.has(a.status);
          const canPreview = a.kind === "pattern_shortlist" || !!initialPatternImage(a);
          const canRefresh = isPublicHttpUrl(a.sourceUrl);
          const refreshedImage = refreshedImages[a.id];
          const refreshing = refreshingIds[a.id] ?? false;
          return (
            <div key={a.id} className={`direction-card${isChosen ? " chosen" : ""}`}>
              <div className="direction-card-thumb-wrap">
                <button
                  type="button"
                  className="direction-card-thumb direction-card-thumb-button"
                  onClick={() => setPreviewArtifact(a)}
                  disabled={!canPreview}
                  aria-label={`View larger example for ${a.title}`}
                >
                  <PatternThumbnail artifact={a} imageUrlOverride={refreshedImage} />
                  {canPreview && <span className="direction-card-thumb-action">View larger</span>}
                </button>
                {canRefresh && (
                  <button
                    type="button"
                    className="direction-card-thumb-refresh"
                    onClick={() => void refreshThumbnail(a)}
                    disabled={refreshing}
                    aria-label={`Refresh thumbnail for ${a.title}`}
                    title="Capture a fresh thumbnail"
                  >
                    {refreshing ? "…" : "↻"}
                  </button>
                )}
              </div>
              <div className="direction-card-body">
                <div className="direction-card-title-row">
                  <span className="direction-card-title">{a.title}</span>
                  <button
                    type="button"
                    className={`direction-card-choose${isChosen ? " chosen" : ""}`}
                    onClick={() => onChoose(a.id)}
                    title={isChosen ? "Chosen — click to unselect" : "Choose"}
                    aria-pressed={isChosen}
                  >
                    <CheckmarkIcon />
                    {isChosen ? "Chosen" : "Choose"}
                  </button>
                </div>
                {a.supportingLine && <p className="direction-card-sub">{a.supportingLine}</p>}
                {isPublicHttpUrl(a.sourceUrl) && (
                  <a
                    className="direction-card-source"
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Reference: {patternSourceLabel(a)} <span aria-hidden>↗</span>
                  </a>
                )}
                {a.ingredients && a.ingredients.length > 0 && (
                  <div className="direction-card-ingredients" aria-label="Useful ingredients">
                    {a.ingredients.map((ingredient) => (
                      <span key={ingredient} className="direction-card-ingredient">
                        {ingredient}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isShortlist && onContinue && (
        <div className="direction-cards-actionbar">
          <span className="direction-cards-count">{chosen.length} selected</span>
          <button
            type="button"
            className="direction-cards-continue"
            disabled={chosen.length === 0}
            onClick={() => onContinue(chosen)}
          >
            Generate wireframes
          </button>
        </div>
      )}
      {previewArtifact && (
        <PatternPreview
          artifact={previewArtifact}
          imageUrlOverride={refreshedImages[previewArtifact.id]}
          refreshing={refreshingIds[previewArtifact.id] ?? false}
          onRefresh={
            isPublicHttpUrl(previewArtifact.sourceUrl)
              ? () => void refreshThumbnail(previewArtifact)
              : undefined
          }
          onClose={() => setPreviewArtifact(null)}
        />
      )}
    </div>
  );
}
