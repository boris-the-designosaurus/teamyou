import { Fragment, useMemo, useState, type ComponentType } from "react";
import { FLOW_STEP_LABEL, LOOP_STAGE_OF, type FlowStep } from "../types";
import type { StoredDoc } from "../store";
import { TYPE_LABELS } from "./Modal";
import { buildTodayCalendar, type CalIconType } from "../todayCalendar";
import {
  ProgressPriority28Icon,
  ProgressSecondary28Icon,
  ProgressCompletedIcon,
  NavWorkFeedIcon,
  NavProjectsIcon,
  NavInsightsIcon,
  AddIcon,
  CalBadgeIcon,
  CalTaskIcon,
  CalStreakIcon,
  AltPathIcon,
  LockIcon,
} from "../icons";

// Icon = WHAT KIND of meaningful thing happened (never the color).
const CAL_ICON: Record<Exclude<CalIconType, "activity">, ComponentType> = {
  milestone: CalBadgeIcon, // accomplishment / award
  review: CalTaskIcon, // clipboard-check
  workflow: AltPathIcon, // branching / flow
  decision: LockIcon, // decision locked
};

const STEP_LABEL = FLOW_STEP_LABEL;

/** A doc is "review ready" once it's reached a reviewable point in the flow —
 * a design awaiting review, or a build awaiting verification. */
function isReviewReady(step: FlowStep): boolean {
  return step === "select_for_review" || step === "verify_build";
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)} d ago`;
}

/**
 * The single work item TeamYou recommends picking up next — the primary "Up
 * next" row. Not "the only in-progress item": many can be in progress, but the
 * coach points at one.
 */
function pickRecommendedNext(specs: StoredDoc[]): StoredDoc | null {
  const actionable = specs.filter((d) => d.item.status !== "complete");
  if (actionable.length === 0) return null;
  const byRecent = (a: StoredDoc, b: StoredDoc) =>
    a.item.updatedAt < b.item.updatedAt ? 1 : -1;
  // 1. user-pinned current work — not modeled yet.
  // 2. a review-ready item (most recently worked).
  const reviewReady = actionable
    .filter((d) => isReviewReady(d.item.currentStep))
    .sort(byRecent);
  if (reviewReady[0]) return reviewReady[0];
  // 3. the most recently worked item. (4/5: drift risk, oldest — future.)
  return [...actionable].sort(byRecent)[0];
}

/** A short "what's captured / what's next" line for a spec. */
function coachLine(d: StoredDoc): string {
  const g = d.guide;
  if (g?.need && g.need.trim()) return `Coach is waiting on: ${g.need}`;
  if (g?.nextPrompt) return `Coach is waiting on: ${g.nextPrompt}`;
  if (d.item.messages.length === 0) return "Start the conversation to build the spec.";
  return "Pick up where you left off.";
}

function metaLine(d: StoredDoc): string {
  const parts = [TYPE_LABELS[d.item.type], STEP_LABEL[d.item.currentStep]];
  const ac = d.item.spec.rules.acceptanceCriteria.length;
  if (LOOP_STAGE_OF[d.item.currentStep] === "specify_build" && ac > 0)
    parts.push(`Acceptance criteria ${ac}`);
  parts.push(timeAgo(d.item.updatedAt));
  return parts.join(" · ");
}

// TeamYou sunburst mark (Figma 9592:3641) — burst outline + inner ring.
function SunIcon() {
  return (
    <svg viewBox="0 0 59 58" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M30.1412 2.67901L32.2965 8.16509C34.2961 13.2092 39.8273 15.8872 44.9949 14.3012L50.63 12.5592C51.2013 12.3772 51.6687 13.0012 51.3831 13.4952L48.4487 18.6172C45.748 23.3233 47.1243 29.3034 51.5908 32.3714L56.4469 35.6995C56.9403 36.0375 56.7585 36.7915 56.1872 36.8695L50.3444 37.7535C44.9949 38.5855 41.1517 43.3696 41.5412 48.8037L41.9826 54.7058C42.0346 55.3038 41.3334 55.6418 40.892 55.2258L36.5553 51.2217C32.5822 47.5297 26.4277 47.5297 22.4546 51.2217L18.1179 55.2258C17.6765 55.6158 16.9753 55.2778 17.0273 54.7058L17.4687 48.8037C17.8583 43.3956 14.0409 38.5855 8.66555 37.7535L2.82273 36.8695C2.25143 36.7915 2.06965 36.0115 2.56304 35.6995L7.41908 32.3714C11.8856 29.3034 13.2619 23.3233 10.5612 18.6172L7.62683 13.4952C7.34118 12.9752 7.8086 12.3772 8.3799 12.5592L14.015 14.3012C19.2086 15.8872 24.7398 13.2352 26.7134 8.16509L28.8687 2.67901C29.0765 2.13301 29.8555 2.13301 30.0892 2.67901H30.1412Z"
        fill="#FFF6E6"
        stroke="#FDB022"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      <path
        d="M29.8077 40.2135C35.5444 40.2135 40.1949 35.5572 40.1949 29.8133C40.1949 24.0695 35.5444 19.4132 29.8077 19.4132C24.071 19.4132 19.4204 24.0695 19.4204 29.8133C19.4204 35.5572 24.071 40.2135 29.8077 40.2135Z"
        stroke="#FDB022"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV: { label: string; Icon: ComponentType }[] = [
  { label: "Today", Icon: SunIcon },
  { label: "Work feed", Icon: NavWorkFeedIcon },
  { label: "Projects", Icon: NavProjectsIcon },
  { label: "Insights", Icon: NavInsightsIcon },
];

type UpNextTab = "all" | "in_progress" | "review";

export function Today(props: {
  specs: StoredDoc[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [tab, setTab] = useState<UpNextTab>("all");
  const [queueTab, setQueueTab] = useState<"completed" | "upcoming">("completed");
  const [dashTab, setDashTab] = useState<"all" | "activity">("all");

  const sorted = [...props.specs].sort((a, b) =>
    a.item.updatedAt < b.item.updatedAt ? 1 : -1,
  );
  // Status-aware buckets. "Completed" means the work is done; review-ready and
  // in-progress are still actionable and can each have many items.
  const completedDocs = sorted.filter((d) => d.item.status === "complete");
  const reviewReady = sorted.filter(
    (d) => isReviewReady(d.item.currentStep) && d.item.status !== "complete",
  );
  const inProgress = sorted.filter(
    (d) => !isReviewReady(d.item.currentStep) && d.item.status !== "complete",
  );

  // The ONE item TeamYou recommends picking up next (not "the only in-progress
  // one"). Rendered as the primary row; everything else is a normal list item.
  const recommendedNext = pickRecommendedNext(sorted);

  const upNext =
    tab === "in_progress" ? inProgress : tab === "review" ? reviewReady : sorted;
  // Float the recommendation to the top of whatever filter it belongs to.
  const upNextOrdered =
    recommendedNext && upNext.some((d) => d.item.id === recommendedNext.item.id)
      ? [
          recommendedNext,
          ...upNext.filter((d) => d.item.id !== recommendedNext.item.id),
        ]
      : upNext;

  // Real numbers where we have them.
  const total = sorted.length;
  const completed = completedDocs.length;

  // Calendar derived from real activity — the most meaningful thing per day.
  const calendar = useMemo(
    () => buildTodayCalendar(props.specs, new Date()),
    [props.specs],
  );

  // Representative dashboard data — replace once we track weekly history.
  const weeks = [
    { specs: 40, review: 62 },
    { specs: 72, review: 55 },
    { specs: 58, review: 80 },
    { specs: 66, review: 48 },
    { specs: 78, review: 70 },
    { specs: 34, review: 60 },
  ];

  return (
    <div className="today">
      <div className="today-inner">
      <nav className="today-nav">
        {NAV.map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            className={`today-nav-item${label === "Today" ? " active" : ""}`}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      <header className="today-hero">
        <SunIcon />
        <h1>Today</h1>
      </header>

      <div className="today-cols">
        {/* ── Left: Up next + Work queue ── */}
        <div className="today-main">
          <section className="today-block">
            <h2>Up next</h2>
            <div className="today-tabs-row">
              <div className="today-tabs">
                {(
                  [
                    ["all", "All todos", sorted.length],
                    ["in_progress", "In progress", inProgress.length],
                    ["review", "Review ready", reviewReady.length],
                  ] as const
                ).map(([k, label, n]) => (
                  <button
                    key={k}
                    type="button"
                    className={`today-tab${tab === k ? " active" : ""}`}
                    onClick={() => setTab(k)}
                  >
                    {label} <span className="today-tab-count">({n})</span>
                  </button>
                ))}
              </div>
              <select
                className="today-tabs-select"
                aria-label="Filter up next"
                value={tab}
                onChange={(e) => setTab(e.target.value as UpNextTab)}
              >
                <option value="all">All todos ({sorted.length})</option>
                <option value="in_progress">
                  In progress ({inProgress.length})
                </option>
                <option value="review">
                  Review ready ({reviewReady.length})
                </option>
              </select>
              <button type="button" className="today-newtodo" onClick={props.onNew}>
                <AddIcon />
                New spec
              </button>
            </div>

            {upNextOrdered.length === 0 ? (
              <div className="today-empty">
                Nothing here yet — start a spec and the Coach will queue up what's next.
              </div>
            ) : (
              <ul className="today-list">
                {upNextOrdered.map((d) => {
                  const isPrimary = d.item.id === recommendedNext?.item.id;
                  return (
                    <li key={d.item.id}>
                      <button
                        type="button"
                        className={`today-item${isPrimary ? " primary" : ""}`}
                        onClick={() => props.onOpen(d.item.id)}
                      >
                        <span className="today-item-badge">
                          {isPrimary ? (
                            <ProgressPriority28Icon />
                          ) : (
                            <ProgressSecondary28Icon />
                          )}
                        </span>
                        <span className="today-item-body">
                          <span className="today-item-title">{d.item.title}</span>
                          <span className="today-item-coach">{coachLine(d)}</span>
                          <span className="today-item-meta">{metaLine(d)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="today-block">
            <h2>Work queue</h2>
            <div className="today-tabs-row">
              <div className="today-tabs">
                <button
                  type="button"
                  className={`today-tab${queueTab === "completed" ? " active" : ""}`}
                  onClick={() => setQueueTab("completed")}
                >
                  Completed <span className="today-tab-count">({completed})</span>
                </button>
                <button
                  type="button"
                  className={`today-tab${queueTab === "upcoming" ? " active" : ""}`}
                  onClick={() => setQueueTab("upcoming")}
                >
                  Upcoming <span className="today-tab-count">(0)</span>
                </button>
              </div>
              <select
                className="today-tabs-select"
                aria-label="Filter work queue"
                value={queueTab}
                onChange={(e) =>
                  setQueueTab(e.target.value as "completed" | "upcoming")
                }
              >
                <option value="completed">Completed ({completed})</option>
                <option value="upcoming">Upcoming (0)</option>
              </select>
            </div>

            {queueTab === "completed" && completedDocs.length > 0 ? (
              <ul className="today-list">
                {completedDocs.map((d) => (
                  <li key={d.item.id}>
                    <button
                      type="button"
                      className="today-item"
                      onClick={() => props.onOpen(d.item.id)}
                    >
                      <span className="today-item-badge">
                        <ProgressCompletedIcon />
                      </span>
                      <span className="today-item-body">
                        <span className="today-item-title">{d.item.title}</span>
                        <span className="today-item-coach">
                          Reached review — ready to lock and hand off.
                        </span>
                        <span className="today-item-meta">{metaLine(d)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="today-empty">
                {queueTab === "completed"
                  ? "Nothing shipped yet — completed specs land here."
                  : "No upcoming work scheduled."}
              </div>
            )}
          </section>
        </div>

        {/* ── Right: dashboard ── */}
        <aside className="today-dash">
          <div className="today-tabs-row today-dash-tabs">
            <div className="today-tabs">
              <button
                type="button"
                className={`today-tab${dashTab === "all" ? " active" : ""}`}
                onClick={() => setDashTab("all")}
              >
                Stats
              </button>
              <button
                type="button"
                className={`today-tab${dashTab === "activity" ? " active" : ""}`}
                onClick={() => setDashTab("activity")}
              >
                Activity
              </button>
            </div>
            <select
              className="today-tabs-select"
              aria-label="Dashboard view"
              value={dashTab}
              onChange={(e) => setDashTab(e.target.value as "all" | "activity")}
            >
              <option value="all">Stats</option>
              <option value="activity">Activity</option>
            </select>
          </div>

          <div className="today-dash-panel">
          <div className="today-stats">
            <div className="today-stat">
              <div className="today-stat-num">
                {completed} <span>of {total || 0}</span>
              </div>
              <div className="today-stat-label">Specs completed</div>
            </div>
            <div className="today-stat">
              <div className="today-stat-num">
                88<span className="today-stat-unit">%</span>
              </div>
              <div className="today-stat-label">Review pass rate</div>
            </div>
          </div>

          <div className="today-card">
            <h3>Readiness trend</h3>
            <div className="today-chart">
              <div className="today-chart-plot">
                <div className="today-chart-goal">
                  <span>Goal</span>
                </div>
                {weeks.map((w, i) => (
                  <div key={i} className="today-chart-bars">
                    <div
                      className="today-bar specs"
                      style={{ height: `${w.specs}%`, animationDelay: `${i * 0.08}s` }}
                    />
                    <div
                      className="today-bar review"
                      style={{ height: `${w.review}%`, animationDelay: `${i * 0.08 + 0.04}s` }}
                    />
                  </div>
                ))}
              </div>
              <div className="today-chart-xaxis">
                {weeks.map((_, i) => (
                  <span key={i} className="today-chart-x">
                    W{i + 1}
                  </span>
                ))}
              </div>
            </div>
            <div className="today-legend">
              <span>
                <i className="dot specs" /> Specs completed
              </span>
              <span>
                <i className="dot review" /> Review pass rate
              </span>
            </div>
          </div>

          <div className="today-card">
            <h3>{calendar.monthLabel}</h3>
            <div className="today-streak">
              <div>
                <div className="today-streak-label">Progress streak</div>
                <div className="today-streak-num">
                  {calendar.streakWeeks} week{calendar.streakWeeks === 1 ? "" : "s"}
                </div>
              </div>
              <div>
                <div className="today-streak-label">Work activity</div>
                <div className="today-streak-num">{calendar.workActivity}</div>
              </div>
            </div>
            <div className="today-cal">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={`h${i}`} className="today-cal-h">
                  {d}
                </span>
              ))}
              <span className="today-cal-h today-cal-h-streak">Streak</span>

              {calendar.weeks.map((week, wi) => (
                <Fragment key={wi}>
                  {week.days.map((day, di) => {
                    if (day.activityLevel === "none") {
                      return (
                        <span key={di} className="today-cal-day level-none">
                          {day.dayOfMonth ?? ""}
                        </span>
                      );
                    }
                    const Icon =
                      day.iconType && day.iconType !== "activity"
                        ? CAL_ICON[day.iconType]
                        : null;
                    return (
                      <span
                        key={di}
                        className={`today-cal-day level-${day.activityLevel}`}
                        title={day.primaryEventLabel}
                      >
                        {Icon ? <Icon /> : <span className="today-cal-dot" />}
                      </span>
                    );
                  })}
                  <span className="today-cal-streakcell">
                    {week.streakNumber ? (
                      <span className="today-cal-streak-badge">
                        <CalStreakIcon />
                        <span className="today-cal-streak-num">
                          {week.streakNumber}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </Fragment>
              ))}
            </div>
          </div>
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}
