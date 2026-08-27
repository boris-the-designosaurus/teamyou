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
  const caseStudy = /case study|project detail|background|problem|solution|results/i.test(text);
  const modal = /modal|dialog|offer|commitment|trial|upgrade/i.test(text);
  return {
    surface: modal ? "modal" as const : portfolio ? "page" as const : "panel" as const,
    layout: caseStudy ? "case_study" as const : "portfolio_home" as const,
    eyebrow: portfolio ? "Selected work" : "Recommended next step",
    headline: artifact.title.replace(/^Variation\s+[A-Z]\s*[—-]\s*/i, ""),
    body: artifact.supportingLine,
    primaryAction: portfolio ? "View project" : "Continue",
    secondaryAction: modal ? "Not now" : undefined,
    blocks: artifact.ingredients?.slice(0, 3),
  };
}

function WireframeHeader() {
  return (
    <header className="wireframe-site-header" aria-hidden>
      <div className="wireframe-brand"><i />Jonathan Warrecker</div>
      <nav><span /><span /><span /></nav>
      <div className="wireframe-social"><i /><i /><i /></div>
    </header>
  );
}

function WireframeProjectCard({
  title,
  featured = false,
}: {
  title: string;
  featured?: boolean;
}) {
  return (
    <article className={`wireframe-home-project${featured ? " featured" : ""}`}>
      <div className="wireframe-home-project-copy">
        <strong>{title}</strong>
        <span className="wireframe-line long" /><span className="wireframe-line short" />
        <div className="wireframe-tags"><i /><i /><i /></div>
      </div>
      <div className="wireframe-home-project-media" aria-hidden>
        <b /><span />{featured && <em />}
      </div>
    </article>
  );
}

function PortfolioHomeWireframe({
  artifact,
  spec,
  blocks,
}: {
  artifact: MilestoneArtifact;
  spec: NonNullable<MilestoneArtifact["wireframeSpec"]> | ReturnType<typeof inferredWireframeSpec>;
  blocks: string[];
}) {
  const projects = [blocks[0] || "TeamYou", blocks[1] || "Self scheduling", blocks[2] || "Inbox"];
  return (
    <div className="wireframe-page-canvas wireframe-home-canvas">
      <WireframeHeader />
      <main>
        <section className="wireframe-home-intro">
          {spec.eyebrow && <small>{spec.eyebrow}</small>}
          <h2>{spec.headline || artifact.title}</h2>
          <div className="wireframe-intro-lines" aria-hidden><i /><i /></div>
          {spec.body && <p>{spec.body}</p>}
        </section>
        <section className="wireframe-home-work">
          <h3>Work</h3>
          <div className="wireframe-home-projects">
            {projects.map((project, index) => (
              <WireframeProjectCard key={`${project}-${index}`} title={project} featured={index === 0} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function CaseStudyWireframe({
  artifact,
  spec,
  blocks,
}: {
  artifact: MilestoneArtifact;
  spec: NonNullable<MilestoneArtifact["wireframeSpec"]> | ReturnType<typeof inferredWireframeSpec>;
  blocks: string[];
}) {
  const projectTitle = spec.eyebrow || artifact.title.replace(/^Variation\s+[A-Z]\s*[—-]\s*/i, "");
  return (
    <div className="wireframe-page-canvas wireframe-case-canvas">
      <WireframeHeader />
      <main>
        <section className="wireframe-case-intro">
          <h2>{projectTitle}</h2>
          <div className="wireframe-intro-lines" aria-hidden><i /><i /></div>
          <p>{spec.headline}</p>
        </section>
        <div className="wireframe-case-hero" aria-hidden><span /></div>
        <div className="wireframe-case-body">
          <aside><strong>Context</strong><span>Background</span><span>Problem</span><span>Solution</span><span>Results</span></aside>
          <div className="wireframe-case-story">
            <section><h3>Background</h3><i /><i /><i /><div className="wireframe-case-actions"><b /><b /><b /></div></section>
            <section><h3>Problem</h3><i /><i /><i /></section>
            <section><h3>Solution</h3><i /><i /><i /><div className="wireframe-case-feature"><b /><div><strong>{blocks[0] || "Key contribution"}</strong><i /><i /></div></div></section>
            <section><h3>Results</h3><i /><i /><i /><div className="wireframe-result-cards"><b /><b /><b /></div></section>
          </div>
        </div>
        <section className="wireframe-up-next"><h3>Up next</h3><WireframeProjectCard title={blocks[1] || "Self scheduling"} /></section>
        <section className="wireframe-contact"><h3>Contact</h3><div><i /><i /><i /><b /></div></section>
      </main>
    </div>
  );
}

/** Render a real low-fidelity comparison from structured Coach output. */
export function WireframeVisual({ artifact }: { artifact: MilestoneArtifact }) {
  const spec = artifact.wireframeSpec ?? inferredWireframeSpec(artifact);
  const blocks = spec.blocks?.length ? spec.blocks.slice(0, 3) : ["Primary content", "Supporting proof"];

  if (spec.surface === "page") {
    const layout = spec.layout ?? (/case study|project detail|background|problem|solution|results/i.test(
      `${artifact.title} ${artifact.supportingLine ?? ""} ${spec.eyebrow ?? ""}`,
    ) ? "case_study" : "portfolio_home");
    return (
      <div
        className={`wireframe-visual wireframe-visual-page wireframe-layout-${layout}`}
        role="img"
        aria-label={`Wireframe for ${artifact.title}`}
      >
        {layout === "case_study"
          ? <CaseStudyWireframe artifact={artifact} spec={spec} blocks={blocks} />
          : <PortfolioHomeWireframe artifact={artifact} spec={spec} blocks={blocks} />}
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

function HiFiActions({ primary, secondary }: { primary?: string; secondary?: string }) {
  return (
    <div className="hifi-actions">
      {primary && <span className="primary">{primary}</span>}
      {secondary && <span>{secondary}</span>}
    </div>
  );
}

function PortfolioHiFi({ artifact }: { artifact: MilestoneArtifact }) {
  const spec = artifact.wireframeSpec ?? inferredWireframeSpec(artifact);
  const blocks = spec.blocks?.length ? spec.blocks.slice(0, 3) : ["Selected work", "Product strategy", "Measured impact"];
  const caseStudy = spec.layout === "case_study";
  return (
    <div className={`hifi-portfolio-page${caseStudy ? " case-study" : ""}`}>
      <header className="hifi-portfolio-nav">
        <strong>JW<span>.</span></strong>
        <nav><span>Work</span><span>About</span><span>Notes</span></nav>
        <span className="hifi-availability">Available for work</span>
      </header>
      <main>
        <section className="hifi-portfolio-hero">
          <small>{spec.eyebrow || (caseStudy ? "CASE STUDY · 2026" : "SENIOR PRODUCT DESIGNER")}</small>
          <h2>{spec.headline || artifact.title}</h2>
          <p>{spec.body || artifact.supportingLine || "Complex product work, made clear and useful."}</p>
          <HiFiActions primary={spec.primaryAction || "View selected work"} secondary={spec.secondaryAction || "Download résumé"} />
        </section>
        {caseStudy ? (
          <>
            <section className="hifi-case-meta"><span><b>Role</b>Lead product designer</span><span><b>Team</b>Product, research, engineering</span><span><b>Impact</b>42% faster onboarding</span></section>
            <section className="hifi-case-feature"><div><small>THE CHALLENGE</small><h3>{blocks[0]}</h3><p>Turn a complex workflow into a clear sequence that helps people act with confidence.</p></div><i /></section>
            <section className="hifi-case-results"><small>THE RESULT</small><h3>Proof that the design changed the outcome.</h3><div><b>42%<span>faster completion</span></b><b>31%<span>fewer errors</span></b><b>2.4×<span>more adoption</span></b></div></section>
          </>
        ) : (
          <section className="hifi-portfolio-work">
            <div className="hifi-section-heading"><small>SELECTED WORK</small><span>2023—2026</span></div>
            {blocks.map((block, index) => (
              <article key={`${block}-${index}`} className={`hifi-project hifi-project-${index + 1}`}>
                <div className="hifi-project-media"><span>{index === 0 ? "42%" : index === 1 ? "03" : "2.4×"}</span><i /></div>
                <div><small>{index === 0 ? "PLATFORM · SAAS" : index === 1 ? "AI · AUTOMATION" : "MOBILE · GROWTH"}</small><h3>{block}</h3><p>{index === 0 ? "Reduced onboarding time through a clearer setup flow." : "Designed the product system from ambiguity to measurable impact."}</p><span className="hifi-text-link">Read case study →</span></div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function ProductHiFi({ artifact }: { artifact: MilestoneArtifact }) {
  const spec = artifact.wireframeSpec ?? inferredWireframeSpec(artifact);
  const blocks = spec.blocks?.length ? spec.blocks.slice(0, 3) : ["Preview first", "Stay in control", "Approve changes"];
  return (
    <div className="hifi-product-scene">
      <aside><strong>Eventmate</strong>{["Dashboard", "Leads", "Imports", "Contacts", "Tasks", "Reports"].map((item, index) => <span className={index === 2 ? "active" : ""} key={item}>{item}</span>)}</aside>
      <div className="hifi-product-app">
        <header><div><small>Imports</small><strong>Event leads — July 24</strong></div><button>New import</button></header>
        <section className="hifi-product-table"><div className="hifi-table-head"><span>Name</span><span>Status</span><span>Owner</span></div>{["Q2 conference", "Design summit", "Product week", "Founders dinner"].map((name, index) => <div key={name}><span>{name}</span><i className={index === 2 ? "warn" : ""}>{index === 2 ? "Review" : "Ready"}</i><span>Olivia Rye</span></div>)}</section>
      </div>
      <div className="hifi-product-scrim" />
      <section className="hifi-product-dialog">
        <button className="hifi-dialog-close" aria-label="Close">×</button>
        <div className="hifi-dialog-icon">✦</div>
        {spec.eyebrow && <small>{spec.eyebrow}</small>}
        <h2>{spec.headline || artifact.title}</h2>
        <p>{spec.body || artifact.supportingLine || "Review what will happen before anything changes."}</p>
        <div className="hifi-benefits">{blocks.map((block, index) => <article key={`${block}-${index}`}><i>{index === 0 ? "◫" : index === 1 ? "✓" : "⌁"}</i><strong>{block}</strong><span>{index === 0 ? "See the proposed result first." : index === 1 ? "Edit, skip, or approve every step." : "Your data stays safe."}</span></article>)}</div>
        <div className="hifi-product-offer"><div><small>TRY IT ON THIS IMPORT</small><strong>14-day trial · Cancel anytime</strong></div><HiFiActions primary={spec.primaryAction || "Preview first 10"} secondary={spec.secondaryAction || "Maybe later"} /></div>
      </section>
    </div>
  );
}

/** High-fidelity designs deliberately do not reuse the low-fidelity renderer.
 * Structure can carry forward, but the visual must read as a realistic design. */
export function HiFiVisual({ artifact }: { artifact: MilestoneArtifact }) {
  const context = `${artifact.title} ${artifact.supportingLine ?? ""} ${artifact.wireframeSpec?.layout ?? ""}`;
  const portfolio = /portfolio|homepage|case study|project grid|product designer/i.test(context);
  return (
    <div className={`hifi-visual ${portfolio ? "hifi-portfolio" : "hifi-product"}`}>
      {portfolio ? <PortfolioHiFi artifact={artifact} /> : <ProductHiFi artifact={artifact} />}
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
  if (artifact.kind === "hifi_design") {
    return <HiFiVisual artifact={artifact} />;
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
  onOpenWorkspace?: (artifactId: string) => void;
}) {
  const { artifacts, onChoose, onContinue } = props;
  const [previewArtifact, setPreviewArtifact] = useState<MilestoneArtifact | null>(null);
  const [refreshedImages, setRefreshedImages] = useState<Record<string, string>>({});
  const [refreshingIds, setRefreshingIds] = useState<Record<string, boolean>>({});
  const [focusedWireframeId, setFocusedWireframeId] = useState(
    () => artifacts.find((artifact) => CHOSEN_STATUSES.has(artifact.status))?.id ?? artifacts[0]?.id ?? "",
  );
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
  const isHiFiSet = artifacts[0].kind === "hifi_design";
  const isDesignSet = isWireframeSet || isHiFiSet;
  const chosen = artifacts.filter((a) => CHOSEN_STATUSES.has(a.status));
  const focusedWireframe = isDesignSet
    ? artifacts.find((artifact) => artifact.id === focusedWireframeId) ?? chosen[0] ?? artifacts[0]
    : undefined;
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

  if (isDesignSet && focusedWireframe) {
    const isFocusedChosen = CHOSEN_STATUSES.has(focusedWireframe.status);
    return (
      <div className="direction-cards-wrap wireframe-comparison-wrap">
        <div className="wireframe-comparison">
          <aside className="wireframe-comparison-rail" aria-label="Wireframe directions">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                className={`wireframe-comparison-thumb${artifact.id === focusedWireframe.id ? " active" : ""}`}
                onClick={() => setFocusedWireframeId(artifact.id)}
                title={artifact.title}
              >
                {artifact.kind === "hifi_design"
                  ? <HiFiVisual artifact={artifact} />
                  : <PatternThumbnail artifact={artifact} />}
              </button>
            ))}
          </aside>
          <article className={`wireframe-comparison-card${isFocusedChosen ? " chosen" : ""}${isHiFiSet ? " hifi" : ""}`}>
            <header className="wireframe-comparison-header">
              <h3>{focusedWireframe.title}</h3>
              <div>
                {props.onOpenWorkspace && (
                  <button
                    type="button"
                    className="wireframe-comparison-edit"
                    onClick={() => props.onOpenWorkspace?.(focusedWireframe.id)}
                    aria-label={`Edit and review ${focusedWireframe.title}`}
                    title="Open design workspace"
                  >
                    ✎
                  </button>
                )}
                <button
                  type="button"
                  className={`direction-card-choose${isFocusedChosen ? " chosen" : ""}`}
                  onClick={() => onChoose(focusedWireframe.id)}
                  aria-pressed={isFocusedChosen}
                >
                  <CheckmarkIcon /> {isFocusedChosen ? "Chosen" : "Choose"}
                </button>
              </div>
            </header>
            <button
              type="button"
              className="wireframe-comparison-visual"
              onClick={() => props.onOpenWorkspace?.(focusedWireframe.id)}
              aria-label={`Open large wireframe for ${focusedWireframe.title}`}
            >
              {focusedWireframe.kind === "hifi_design"
                ? <HiFiVisual artifact={focusedWireframe} />
                : <WireframeVisual artifact={focusedWireframe} />}
            </button>
            <div className="wireframe-comparison-details">
              {focusedWireframe.supportingLine && (
                <p><strong>Why this fits:</strong> {focusedWireframe.supportingLine}</p>
              )}
              {focusedWireframe.ingredients?.length ? (
                <div className="direction-card-ingredients" aria-label="Useful ingredients">
                  {focusedWireframe.ingredients.map((ingredient) => (
                    <span key={ingredient} className="direction-card-ingredient">{ingredient}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        </div>
        {onContinue && (
          <div className="direction-cards-actionbar">
            <span className="direction-cards-count">{chosen.length} selected</span>
            <button
              type="button"
              className="direction-cards-continue"
              disabled={chosen.length === 0}
              onClick={() => onContinue(chosen)}
            >
              {isHiFiSet ? "Review selected design" : "Develop selected direction"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="direction-cards-wrap">
      <div className="direction-cards">
        {artifacts.map((a) => {
          const isChosen = CHOSEN_STATUSES.has(a.status);
          const canPreview =
            a.kind === "pattern_shortlist" || a.kind === "wireframe" || a.kind === "hifi_design" || !!initialPatternImage(a);
          const canRefresh = isPublicHttpUrl(a.sourceUrl);
          const refreshedImage = refreshedImages[a.id];
          const refreshing = refreshingIds[a.id] ?? false;
          return (
            <div key={a.id} className={`direction-card${isChosen ? " chosen" : ""}`}>
              <div className="direction-card-thumb-wrap">
                <button
                  type="button"
                  className="direction-card-thumb direction-card-thumb-button"
                  onClick={() =>
                    (a.kind === "wireframe" || a.kind === "hifi_design") && props.onOpenWorkspace
                      ? props.onOpenWorkspace(a.id)
                      : setPreviewArtifact(a)
                  }
                  disabled={!canPreview}
                  aria-label={
                    (a.kind === "wireframe" || a.kind === "hifi_design") && props.onOpenWorkspace
                      ? `Open design workspace for ${a.title}`
                      : `View larger example for ${a.title}`
                  }
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
