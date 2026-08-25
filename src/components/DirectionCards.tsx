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

function inferredWireframeSpec(artifact: MilestoneArtifact) {
  const text = `${artifact.title} ${artifact.supportingLine ?? ""}`;
  const portfolio = /portfolio|homepage|hero|project|case study|metric-led|narrative-led/i.test(text);
  const modal = /modal|dialog|offer|commitment|trial|upgrade/i.test(text);
  return {
    surface: modal ? "modal" as const : portfolio ? "page" as const : "panel" as const,
    eyebrow: portfolio ? "Selected work" : "Recommended next step",
    headline: artifact.title.replace(/^Variation\s+[A-Z]\s*[—-]\s*/i, ""),
    body: artifact.supportingLine,
    primaryAction: portfolio ? "View project" : "Continue",
    secondaryAction: modal ? "Not now" : undefined,
    blocks: artifact.ingredients?.slice(0, 3),
  };
}

/** Render a real low-fidelity comparison from structured Coach output. */
function WireframeVisual({ artifact }: { artifact: MilestoneArtifact }) {
  const spec = artifact.wireframeSpec ?? inferredWireframeSpec(artifact);
  const blocks = spec.blocks?.length ? spec.blocks.slice(0, 3) : ["Primary content", "Supporting proof"];

  if (spec.surface === "page") {
    return (
      <div
        className="wireframe-visual wireframe-visual-page"
        role="img"
        aria-label={`Wireframe for ${artifact.title}`}
      >
        <div className="wireframe-browserbar">
          <span>Portfolio</span><i /><i /><i />
        </div>
        <div className="wireframe-page">
          <section className="wireframe-page-hero">
            <div className="wireframe-page-hero-copy">
              {spec.eyebrow && <div className="wireframe-eyebrow">{spec.eyebrow}</div>}
              <div className="wireframe-headline">{spec.headline}</div>
              {spec.body && <div className="wireframe-copy">{spec.body}</div>}
              <div className="wireframe-actions">
                {spec.primaryAction && <span className="primary">{spec.primaryAction}</span>}
                {spec.secondaryAction && <span>{spec.secondaryAction}</span>}
              </div>
            </div>
            <div className="wireframe-hero-media" aria-hidden>
              <b /><i /><i /><i />
            </div>
          </section>

          <section className="wireframe-proof-row" aria-label="Proof summary">
            {blocks.map((block, index) => (
              <div key={block}>
                <strong>{index === 0 ? "24%" : index === 1 ? "15+" : "3×"}</strong>
                <span>{block}</span>
              </div>
            ))}
          </section>

          <section className="wireframe-work-section">
            <div className="wireframe-section-heading"><strong>Selected work</strong><i /></div>
            <div className="wireframe-project-grid">
              {blocks.slice(0, 2).map((block, index) => (
                <article key={`${block}-${index}`}>
                  <div className="wireframe-project-media" aria-hidden><b /><i /><i /></div>
                  <small>{index === 0 ? "FEATURED CASE STUDY" : "RECENT PROJECT"}</small>
                  <strong>{block}</strong>
                  <span>Role, decision, and measurable outcome</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`wireframe-visual wireframe-visual-${spec.surface}`}
      role="img"
      aria-label={`Wireframe for ${artifact.title}`}
    >
      <div className="wireframe-surface">
        {spec.surface === "modal" && <span className="wireframe-close" aria-hidden>×</span>}
        {spec.eyebrow && <div className="wireframe-eyebrow">{spec.eyebrow}</div>}
        <div className="wireframe-headline">{spec.headline}</div>
        {spec.body && <div className="wireframe-copy">{spec.body}</div>}
        <div className="wireframe-checklist">
          {blocks.map((block) => <div key={block}><i />{block}</div>)}
        </div>
        <div className="wireframe-offer-box">
          <strong>{spec.primaryAction ? `Ready to ${spec.primaryAction.toLowerCase()}?` : "Ready to continue?"}</strong>
          <span>Review the details before anything changes.</span>
          <div className="wireframe-actions">
            {spec.primaryAction && <span className="primary">{spec.primaryAction}</span>}
            {spec.secondaryAction && <span>{spec.secondaryAction}</span>}
          </div>
        </div>
      </div>
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
  const [loaded, setLoaded] = useState(false);
  const screenshotUrl = pagePreviewUrl(artifact.sourceUrl);

  useEffect(() => {
    setImageUrl(imageUrlOverride ?? initialPatternImage(artifact));
    setFailed(false);
    setLoaded(false);
  }, [artifact, imageUrlOverride]);

  if (artifact.kind === "wireframe") {
    return <WireframeVisual artifact={artifact} />;
  }

  if (!imageUrl || failed) {
    return (
      <div className="direction-card-thumb-unavailable" role="status">
        <span>{failed ? "Preview unavailable" : "Live example required"}</span>
        {failed && screenshotUrl && <small>Use refresh to try again</small>}
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="direction-card-thumb-loading" role="status">
          Capturing live example…
        </div>
      )}
      <img
        src={imageUrl}
        alt={`Reference example for ${artifact.title}`}
        // Pattern sets are intentionally small and the screenshots are essential
        // evidence, so start every capture immediately—even below the fold.
        loading="eager"
        className={loaded ? "loaded" : "loading"}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (screenshotUrl && imageUrl !== screenshotUrl) {
            setImageUrl(screenshotUrl);
            setLoaded(false);
            return;
          }
          setFailed(true);
        }}
      />
    </>
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
  const isWireframeSet = artifacts[0].kind === "wireframe";
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
          const canPreview =
            a.kind === "pattern_shortlist" || a.kind === "wireframe" || !!initialPatternImage(a);
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
      {(isShortlist || isWireframeSet) && onContinue && (
        <div className="direction-cards-actionbar">
          <span className="direction-cards-count">{chosen.length} selected</span>
          <button
            type="button"
            className="direction-cards-continue"
            disabled={chosen.length === 0}
            onClick={() => onContinue(chosen)}
          >
            {isShortlist ? "Generate wireframes" : "Develop selected direction"}
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
