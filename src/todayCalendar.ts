// Derives the Today calendar model from real activity.
//
// The calendar shows the MOST MEANINGFUL thing that happened each day — not
// merely whether the day was active. The icon says WHAT KIND of thing happened
// (its category); the emphasis/color says HOW important it was (activityLevel).
import type { ActivityEvent, ActivityEventType } from "./types";
import type { StoredDoc } from "./store";

export type CalIconType =
  | "activity"
  | "decision"
  | "workflow"
  | "review"
  | "milestone";

export type CalActivityLevel = "none" | "light" | "meaningful" | "milestone";

export type TodayCalendarDay = {
  date: string; // YYYY-MM-DD
  dayOfMonth: number | null; // null for leading/trailing padding cells
  inMonth: boolean;
  activityLevel: CalActivityLevel;
  primaryEventType?: ActivityEventType;
  primaryEventLabel?: string;
  iconType?: CalIconType;
  streakDay?: number; // running consecutive count of qualifying days
};

export type TodayCalendarWeek = {
  days: TodayCalendarDay[]; // exactly 7 (Mon–Sun)
  streakNumber?: number; // weekly streak badge, when the week is part of the streak
};

export type TodayCalendarModel = {
  monthLabel: string; // "July 2026"
  weeks: TodayCalendarWeek[];
  streakWeeks: number; // consecutive qualifying weeks (header "Progress streak")
  workActivity: number; // total activity events
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Event type → icon category. Importance can override this to "milestone".
const TYPE_CATEGORY: Record<ActivityEventType, CalIconType> = {
  step_changed: "milestone",
  acceptance_criterion_added: "review",
  rules_updated: "review",
  workflow_updated: "workflow",
  decision_captured: "decision",
  brief_updated: "activity",
  open_question_added: "activity",
  todo_created: "activity",
  evidence_captured: "activity",
  outcome_defined: "review",
  milestone_captured: "milestone",
  review_run: "review",
  handoff_ready: "milestone",
  build_linked: "workflow",
  verification_completed: "milestone",
};

// Priority when several things happened on one day — highest wins the icon.
const CATEGORY_PRIORITY: Record<CalIconType, number> = {
  milestone: 5,
  review: 4,
  workflow: 3,
  decision: 2,
  activity: 1,
};

function eventCategory(e: ActivityEvent): CalIconType {
  if (e.importance === "milestone") return "milestone";
  return TYPE_CATEGORY[e.type] ?? "activity";
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// A day counts toward the streak only with genuinely meaningful work — not
// passive activity like opening the app or a lone brief tweak.
function qualifies(level: CalActivityLevel): boolean {
  return level === "meaningful" || level === "milestone";
}

export function buildTodayCalendar(
  specs: StoredDoc[],
  now: Date,
): TodayCalendarModel {
  // 1. Bucket every activity event by its calendar day.
  const byDay = new Map<string, ActivityEvent[]>();
  let total = 0;
  for (const doc of specs) {
    for (const e of doc.item.activity) {
      total++;
      const k = dayKey(new Date(e.createdAt));
      const arr = byDay.get(k);
      if (arr) arr.push(e);
      else byDay.set(k, [e]);
    }
  }

  // 2. Reduce a single day's events to its most meaningful signal.
  function deriveDay(date: Date, inMonth: boolean): TodayCalendarDay {
    const base: TodayCalendarDay = {
      date: dayKey(date),
      dayOfMonth: inMonth ? date.getDate() : null,
      inMonth,
      activityLevel: "none",
    };
    const events = inMonth ? byDay.get(base.date) : undefined;
    if (!events || !events.length) return base;

    let primary = events[0];
    let primaryCat = eventCategory(primary);
    for (const e of events) {
      const c = eventCategory(e);
      if (CATEGORY_PRIORITY[c] > CATEGORY_PRIORITY[primaryCat]) {
        primary = e;
        primaryCat = c;
      }
    }

    let level: CalActivityLevel;
    if (events.some((e) => e.importance === "milestone")) level = "milestone";
    else if (
      events.some((e) => {
        const c = eventCategory(e);
        return (
          c === "review" ||
          c === "workflow" ||
          c === "decision" ||
          e.importance === "significant"
        );
      })
    )
      level = "meaningful";
    else level = "light";

    return {
      ...base,
      activityLevel: level,
      primaryEventType: primary.type,
      primaryEventLabel: primary.label,
      iconType: primaryCat,
    };
  }

  // 3. Lay out the month as Monday-start weeks with padding.
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: TodayCalendarDay[] = [];
  for (let i = firstDow; i > 0; i--) {
    cells.push(deriveDay(new Date(year, month, 1 - i), false));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(deriveDay(new Date(year, month, d), true));
  }
  while (cells.length % 7 !== 0) {
    cells.push(deriveDay(new Date(year, month, daysInMonth + (cells.length % 7)), false));
  }

  // 4. Per-day streak running count (qualifying days in a row).
  let dayRun = 0;
  for (const c of cells) {
    if (c.inMonth && qualifies(c.activityLevel)) {
      dayRun++;
      c.streakDay = dayRun;
    } else if (c.inMonth) {
      dayRun = 0;
    }
  }

  // 5. Group into weeks and compute the weekly streak (badge + header count).
  const weeks: TodayCalendarWeek[] = [];
  let weekRun = 0;
  let streakWeeks = 0;
  for (let i = 0; i < cells.length; i += 7) {
    const days = cells.slice(i, i + 7);
    const hasQualifying = days.some((d) => d.inMonth && qualifies(d.activityLevel));
    if (hasQualifying) {
      weekRun++;
      streakWeeks = weekRun;
      weeks.push({ days, streakNumber: weekRun });
    } else {
      weekRun = 0;
      weeks.push({ days });
    }
  }

  return {
    monthLabel: `${MONTHS[month]} ${year}`,
    weeks,
    streakWeeks,
    workActivity: total,
  };
}
