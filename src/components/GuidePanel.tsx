import {
  cloneElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  FLOW_STEPS,
  FLOW_STEP_LABEL,
  LOOP_STAGES,
  LOOP_STAGE_LABEL,
  LOOP_STAGE_OF,
  stepsForStage,
  type Attachment,
  type FlowStep,
  type GuidePanel as GuidePanelHints,
  type LoopStage,
  type Spec,
} from "../types";
import { stepProgress, stepCapturedItems, stepSummaryLine, stageSummaryLine } from "../merge";
import { resolvePinnedAttachment, type ResolveTarget } from "../attachments";
import { MilestoneCard } from "./MilestoneCard";
import { BuildHandoffList } from "./BuildHandoffCard";
import { WorkingBuildCard } from "./WorkingBuildCard";
import { VerificationCard } from "./VerificationCard";
import type { BuildHandoff, EvidenceBrief } from "../types";
import {
  ProgressPriorityIcon,
  ProgressCompletedIcon,
  ProgressUncompletedIcon,
  ChevronDownIcon,
} from "../icons";

// Long, decelerating glide (easeOutExpo-ish) — content settles rather than snaps.
const OPEN_MS = 460;
const OPEN_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Animates its height on any content change — opening from 0, closing to 0, and
 * (the important one) growing smoothly when items are added while already open.
 * Settles back to height:auto after each transition so it stays responsive.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const prev = useRef<number>(open ? -1 : 0);
  const mounted = useRef(false);
  const [style, setStyle] = useState<CSSProperties>(
    open ? { height: "auto" } : { height: 0, overflow: "hidden" },
  );

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const next = open ? inner.scrollHeight : 0;

    if (!mounted.current) {
      mounted.current = true;
      prev.current = next;
      setStyle(open ? { height: "auto" } : { height: 0, overflow: "hidden" });
      return;
    }

    if (next === prev.current) return;

    const from = prev.current;
    prev.current = next;

    if (prefersReducedMotion()) {
      setStyle(open ? { height: "auto" } : { height: 0, overflow: "hidden" });
      return;
    }

    setStyle({ height: from, overflow: "hidden" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setStyle({
          height: next,
          overflow: "hidden",
          transition: `height ${OPEN_MS}ms ${OPEN_EASE}`,
        });
      });
    });
  }, [open, children]);

  return (
    <div
      className="step-collapse"
      style={style}
      onTransitionEnd={(e) => {
        if (e.propertyName === "height" && open) setStyle({ height: "auto" });
      }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

// The loop-stage-scoped primary artifact for a section (pinned, else latest).
function sectionPrimary(spec: Spec, section: LoopStage): Attachment | null {
  const items = (spec.attachments ?? [])
    .filter((a) => a.section === section && (a.scope ?? "spec") === "spec")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return items.find((a) => a.isPinned) ?? items[0] ?? null;
}

/**
 * Artifacts for one loop stage, sized by hierarchy:
 * - the stage's primary section artifact → large preview
 * - a todo's evidence (Specify and build) → compact chip, or large when that
 *   todo is the active/expanded target; the all_todos rollup follows the same rule.
 */
function StageArtifacts({
  spec,
  stage,
  activeTarget,
  isActiveStage,
}: {
  spec: Spec;
  stage: LoopStage;
  activeTarget: ResolveTarget;
  isActiveStage: boolean;
}) {
  const rows: { key: string; artifact: Attachment; large: boolean; context: string | null }[] = [];

  const primary = sectionPrimary(spec, stage);
  if (primary)
    rows.push({ key: `p-${primary.id}`, artifact: primary, large: isActiveStage, context: null });

  if (stage === "specify_build") {
    const rollup = resolvePinnedAttachment(spec, { kind: "all_todos" });
    if (rollup && rollup.scope === "all_todos") {
      rows.push({
        key: `r-${rollup.id}`,
        artifact: rollup,
        large: activeTarget.kind === "all_todos",
        context: "All todos",
      });
    }
    for (const t of spec.rules.todos) {
      const a = resolvePinnedAttachment(spec, { kind: "todo", id: t.id });
      const onTodo = !!a && (t.attachments ?? []).some((x) => x.id === a.id);
      if (a && onTodo) {
        rows.push({
          key: `t-${t.id}`,
          artifact: a,
          large: activeTarget.kind === "todo" && activeTarget.id === t.id,
          context: t.title,
        });
      }
    }
  }

  if (!rows.length) return null;
  return (
    <div className="step-artifacts">
      {rows.map((r) => (
        <ArtifactView key={r.key} artifact={r.artifact} large={r.large} context={r.context} />
      ))}
    </div>
  );
}

/** One artifact — large preview or compact chip. */
function ArtifactView({
  artifact,
  large,
  context,
}: {
  artifact: Attachment;
  large: boolean;
  context: string | null;
}) {
  if (large) {
    return (
      <div className="step-artifact large">
        <a
          className="guide-artifact-preview"
          href={artifact.url}
          target="_blank"
          rel="noreferrer"
          title={artifact.label}
        >
          <img src={artifact.url} alt={artifact.label} loading="lazy" />
        </a>
        <div className="guide-artifact-meta">
          <span className="guide-artifact-name">{artifact.label}</span>
          {artifact.isPinned && <span className="guide-artifact-pin" aria-hidden />}
          {context && (
            <span className="guide-artifact-context">Linked to: {context}</span>
          )}
        </div>
      </div>
    );
  }
  return (
    <a
      className="guide-artifact-chip"
      href={artifact.url}
      target="_blank"
      rel="noreferrer"
      title={context ? `${artifact.label} — ${context}` : artifact.label}
    >
      <img src={artifact.url} alt="" loading="lazy" />
      <span className="guide-artifact-name">{artifact.label}</span>
      {artifact.isPinned && <span className="guide-artifact-pin" aria-hidden />}
    </a>
  );
}

/**
 * Milestone artifacts captured at a given step. Only the selected/decision-
 * relevant artifact promotes into the Guide — an unselected shortlist option
 * stays "exploring" and is never shown here (ACCEPTANCE_TESTS.md §E: "Multiple
 * unselected variations are not automatically added to the Guide"). The full
 * shortlist is still visible as the "Choose" card grid in chat.
 */
function MilestoneChips({
  spec,
  step,
  onOpenReview,
}: {
  spec: Spec;
  step: FlowStep;
  onOpenReview?: (artifactId: string) => void;
}) {
  const items = spec.milestoneArtifacts.filter((a) => a.step === step && a.status !== "exploring");
  if (!items.length) return null;
  return (
    <div className="guide-milestones">
      {items.map((a) => (
        <MilestoneCard key={a.id} artifact={a} onOpenReview={onOpenReview} />
      ))}
    </div>
  );
}

/**
 * The full tagged record (Known/Assumed/Interpretation/Risk/Decision bullets)
 * for one step — hidden by default per the "collapsed by default" rule;
 * rendered only in place of the summary line once "View details" is
 * selected (SubstepRow never shows both at once). Nothing here is ever
 * lost, just default-collapsed.
 */
function StepDetails({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="guide-details">
      <CapturedList items={items} />
    </div>
  );
}

function CapturedList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="guide-list">
      {items.map((c, idx) => {
        const dash = c.indexOf(": ");
        return (
          <li key={idx}>
            {dash === -1 ? (
              c
            ) : (
              <>
                <span className="cap-label">{c.slice(0, dash)}:</span> {c.slice(dash + 2)}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Rough space a 2-line, 12px tooltip bubble needs above its anchor (padding +
// two line-heights + the gap) — below this, flip it under the anchor instead
// of letting it get clipped by the Guide rail's scroll container or hidden
// behind the sticky Guide/Activity tab bar.
const TOOLTIP_FLIP_THRESHOLD = 60;

/**
 * The Guide's only place a summary is visible by default: a floating bubble
 * shown on hover/focus of a collapsed item's title, never the browser's
 * native `title` tooltip. Renders nothing extra when `text` is null (e.g.
 * the item is expanded, or has nothing captured yet) — children pass through.
 *
 * Portaled to <body> and positioned from the anchor's live viewport rect
 * (not a CSS-only `position: absolute`) so it always escapes the Guide
 * rail's `overflow-y: auto` clipping and any stacking-order fights with the
 * sticky tab bar above it, and flips to below the anchor when there isn't
 * room above (e.g. the very first row in the list).
 */
function Tooltip({ text, children }: { text: string | null; children: ReactElement }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const [pos, setPos] = useState<{ top: number; left: number; placement: "above" | "below" } | null>(
    null,
  );

  const show = () => {
    const anchor = anchorRef.current;
    const rect = anchor?.getBoundingClientRect();
    if (!anchor || !rect) return;
    // The Guide rail scrolls under a sticky Guide/Activity tab bar — a raw
    // "rect.top >= threshold" check treats that whole sticky region as
    // available space, so a row right at the top of the list (with plenty
    // of `rect.top` but almost no ACTUAL clearance below the tab bar) picks
    // "above" and renders half-hidden behind it. Measure clearance from the
    // scroll container's real visible top edge instead of the viewport's.
    const scrollTop = anchor.closest(".rail-body")?.getBoundingClientRect().top ?? 0;
    const spaceAbove = rect.top - scrollTop;
    const placement = spaceAbove >= TOOLTIP_FLIP_THRESHOLD ? "above" : "below";
    setPos({
      top: placement === "above" ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      placement,
    });
  };
  const hide = () => setPos(null);

  if (!text) return children;

  // Associate the bubble with whatever interactive element the caller passed
  // in (a real <button>, so hover AND keyboard focus both land on the same
  // node) via aria-describedby — not just visual proximity.
  const describedChild = cloneElement(children, {
    "aria-describedby": pos ? tooltipId : undefined,
  } as { "aria-describedby"?: string });

  return (
    <span
      ref={anchorRef}
      className="guide-tooltip-anchor"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {describedChild}
      {pos &&
        createPortal(
          <span
            id={tooltipId}
            className={`guide-tooltip ${pos.placement}`}
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

/**
 * A collapsed item's title — the ONLY hover/focus target for its tooltip
 * (never the checkmark, chevron, or surrounding row). Plain, non-interactive
 * text when there's no toggle (active/todo items, or a stage/step with
 * nothing to expand); a real `<button>` when `onToggle` is given, so the
 * tooltip fires on both mouse hover and keyboard focus for free.
 */
function TitleWithTooltip({
  label,
  className,
  tooltip,
  onToggle,
  expanded,
}: {
  label: string;
  className: string;
  tooltip: string | null;
  onToggle?: () => void;
  expanded?: boolean;
}) {
  if (!onToggle) return <span className={className}>{label}</span>;
  return (
    <Tooltip text={tooltip}>
      <button
        type="button"
        className={`${className} guide-title-btn`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {label}
      </button>
    </Tooltip>
  );
}

function EvidenceBriefThumbnail({
  brief,
  onOpen,
}: {
  brief: EvidenceBrief;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="guide-evidence-thumb"
      title={brief.title}
      aria-label={`Open evidence report: ${brief.title}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <span className="guide-evidence-thumb-title" />
      <span className="guide-evidence-thumb-stats">
        {(brief.stats ?? []).slice(0, 3).map((stat) => (
          <span key={`${stat.label}-${stat.value}`} />
        ))}
      </span>
    </button>
  );
}

function EvidenceBriefCard({ brief }: { brief: EvidenceBrief }) {
  return (
    <article className="guide-evidence-card" aria-label={brief.title}>
      <div className="guide-evidence-card-head">
        <div className="guide-evidence-card-title">{brief.title}</div>
        {brief.strength && (
          <span className="guide-evidence-strength">{brief.strength} evidence</span>
        )}
      </div>
      {brief.source && <div className="guide-evidence-source">{brief.source}</div>}
      <p>{brief.summary}</p>
      {brief.stats && brief.stats.length > 0 && (
        <div className="guide-evidence-stats">
          {brief.stats.map((stat) => (
            <div key={`${stat.label}-${stat.value}`} className="guide-evidence-stat">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function stepIcon(state: "done" | "active" | "todo") {
  if (state === "done") return <ProgressCompletedIcon />;
  if (state === "active") return <ProgressPriorityIcon />;
  return <ProgressUncompletedIcon />;
}

/**
 * One FlowStep row inside an expanded loop-stage group.
 *
 * - Done: collapsed by default — title + checkmark only, nothing else.
 *   Its summary lives ONLY in a tooltip on the title (hover/focus), and only
 *   while collapsed. Clicking the title reopens it to its full structured
 *   details (the tagged evidence record + any milestone/build/verification
 *   content that step produced) — reopening never touches completion status,
 *   and collapses again on a second click. Nothing forces it back shut; it
 *   simply starts collapsed the moment it becomes done, which is the
 *   "auto-collapse when the next substep becomes active" behavior.
 * - Active: always open, no toggle of its own — shows only "Still needed"
 *   and the Next question (no summary line; that's tooltip/detail-only).
 * - Todo: title only.
 */
function SubstepRow(props: {
  step: FlowStep;
  state: "done" | "active" | "todo";
  spec: Spec;
  hints: GuidePanelHints | null;
  activeTarget: ResolveTarget;
  onOpenReview?: (artifactId: string) => void;
  onSaveHandoff?: (handoffId: string, patch: Partial<BuildHandoff>) => void;
  onSendHandoff?: (handoffId: string) => void;
  onAttachBuildUrl?: (url: string) => void;
  onMarkVerified?: () => void;
  onLocateCoachPrompt?: () => void;
}) {
  const { step, state, spec, hints, activeTarget } = props;
  const isActive = state === "active";
  const isDone = state === "done";
  const [expanded, setExpanded] = useState(false);
  const evidenceBrief = step === "assess_evidence" ? spec.evidenceBrief : undefined;

  const captured = isDone ? stepCapturedItems(spec, step) : [];
  const summary = isDone ? stepSummaryLine(spec, step) : null;
  const tooltip = isDone && !expanded ? summary : null;

  const need = isActive ? hints?.need?.trim() : undefined;
  const nextPrompt = isActive ? hints?.nextPrompt : undefined;

  const stepContent = (
    <>
      {evidenceBrief && <EvidenceBriefCard brief={evidenceBrief} />}
      <MilestoneChips spec={spec} step={step} onOpenReview={props.onOpenReview} />
      {step === "prepare_handoff" && spec.buildHandoffs.length > 0 && props.onSaveHandoff && props.onSendHandoff && (
        <BuildHandoffList
          handoffs={spec.buildHandoffs}
          onSave={props.onSaveHandoff}
          onSend={props.onSendHandoff}
        />
      )}
      {step === "build_in_tool" && spec.workingBuild && props.onAttachBuildUrl && props.onOpenReview && (
        <WorkingBuildCard
          workingBuild={spec.workingBuild}
          reviewArtifact={spec.milestoneArtifacts.find((a) => a.kind === "working_build")}
          onAttachUrl={props.onAttachBuildUrl}
          onOpenReview={props.onOpenReview}
        />
      )}
      {step === "verify_build" &&
        props.onMarkVerified &&
        props.onOpenReview &&
        (() => {
          const buildArtifact = spec.milestoneArtifacts.find((a) => a.kind === "working_build");
          return buildArtifact ? (
            <VerificationCard
              spec={spec}
              buildArtifact={buildArtifact}
              onMarkVerified={props.onMarkVerified}
              onOpenReview={props.onOpenReview}
            />
          ) : null;
        })()}
      <StageArtifacts
        spec={spec}
        stage={LOOP_STAGE_OF[step]}
        activeTarget={activeTarget}
        isActiveStage={isActive}
      />
    </>
  );

  return (
    <div className={`flow-substep ${state}`}>
      <div className="flow-substep-head">
        <span className="step-ic small">{stepIcon(state)}</span>
        <TitleWithTooltip
          label={FLOW_STEP_LABEL[step]}
          className="flow-substep-name"
          tooltip={tooltip}
          onToggle={isDone ? () => setExpanded((v) => !v) : undefined}
          expanded={isDone ? expanded : undefined}
        />
        {isDone && evidenceBrief && !expanded && (
          <EvidenceBriefThumbnail brief={evidenceBrief} onOpen={() => setExpanded(true)} />
        )}
        {isDone && (
          <span className={`flow-substep-caret${expanded ? " open" : ""}`}>
            <ChevronDownIcon />
          </span>
        )}
      </div>
      {isActive && (
        <div className="flow-substep-body">
          {/* The coach's actual question lives ONLY in chat now — this is a
              compact noun-phrase label, not a second copy of the prompt.
              The full question (nextPrompt) is available on hover/focus as
              context, and clicking jumps to where it's really asked. */}
          {need && (
            <Tooltip text={nextPrompt?.trim() || null}>
              <button type="button" className="guide-need" onClick={props.onLocateCoachPrompt}>
                <span className="cap-label">Need:</span> {need}
              </button>
            </Tooltip>
          )}
          {stepContent}
        </div>
      )}
      {isDone && (
        <Collapse open={expanded}>
          <div className="flow-substep-body">
            <StepDetails items={captured} />
            {stepContent}
          </div>
        </Collapse>
      )}
    </div>
  );
}

/**
 * The Guide rail — a two-level accordion. Four loop-stage groups (Frame the
 * problem / Explore directions / Design the solution / Specify and build),
 * each containing its ordered FlowSteps. A stage collapses to a single
 * checked row once every step in it is done; the active stage is always
 * expanded; a stage not yet reached shows only its header.
 */
export function GuideRail(props: {
  activeStep: FlowStep;
  hints: GuidePanelHints | null;
  spec: Spec;
  activeTarget?: ResolveTarget;
  onOpenReview?: (artifactId: string) => void;
  onSaveHandoff?: (handoffId: string, patch: Partial<BuildHandoff>) => void;
  onSendHandoff?: (handoffId: string) => void;
  onAttachBuildUrl?: (url: string) => void;
  onMarkVerified?: () => void;
  onLocateCoachPrompt?: () => void;
}) {
  const { activeStep, hints, spec } = props;
  const activeStage = LOOP_STAGE_OF[activeStep];
  const activeFlowIdx = FLOW_STEPS.indexOf(activeStep);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const target = props.activeTarget ?? { kind: "spec" };

  const hasOpenNeed = !!hints?.need && hints.need.trim().length > 0;
  const { done, total } = stepProgress(spec, activeStep);
  const shownDone = hasOpenNeed ? Math.min(done, total - 1) : done;
  const pct = Math.round((shownDone / total) * 100);

  return (
    <div className="step-cards">
      {LOOP_STAGES.map((stage) => {
        const steps = stepsForStage(stage);
        const lastIdx = FLOW_STEPS.indexOf(steps[steps.length - 1]);
        const state: "done" | "active" | "todo" =
          stage === activeStage ? "active" : lastIdx < activeFlowIdx ? "done" : "todo";
        const isExpanded = state === "done" && !!expanded[stage];
        const open = state === "active" || isExpanded;
        const stageTooltip = state === "done" && !isExpanded ? stageSummaryLine(spec, stage) : null;

        return (
          <div key={stage} className={`step-card ${state}`}>
            <div className="step-head">
              <span className="step-ic">{stepIcon(state)}</span>
              <TitleWithTooltip
                label={LOOP_STAGE_LABEL[stage]}
                className="step-name"
                tooltip={stageTooltip}
                onToggle={
                  state === "done" ? () => setExpanded((e) => ({ ...e, [stage]: !e[stage] })) : undefined
                }
                expanded={state === "done" ? isExpanded : undefined}
              />
              {state === "done" && (
                <span className={`step-caret${isExpanded ? " open" : ""}`}>
                  <ChevronDownIcon />
                </span>
              )}
            </div>

            <Collapse open={open}>
              <div className="step-open-content">
                {steps.map((step) => {
                  const stepState: "done" | "active" | "todo" =
                    step === activeStep
                      ? "active"
                      : FLOW_STEPS.indexOf(step) < activeFlowIdx
                        ? "done"
                        : "todo";
                  return (
                    <SubstepRow
                      key={step}
                      step={step}
                      state={stepState}
                      spec={spec}
                      hints={hints}
                      activeTarget={target}
                      onOpenReview={props.onOpenReview}
                      onSaveHandoff={props.onSaveHandoff}
                      onSendHandoff={props.onSendHandoff}
                      onAttachBuildUrl={props.onAttachBuildUrl}
                      onMarkVerified={props.onMarkVerified}
                      onLocateCoachPrompt={props.onLocateCoachPrompt}
                    />
                  );
                })}
                {state === "active" && (
                  <div className="progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="progress-label">
                      {FLOW_STEP_LABEL[activeStep]} {shownDone}/{total}
                    </span>
                  </div>
                )}
              </div>
            </Collapse>
          </div>
        );
      })}
    </div>
  );
}
