import type { ComponentType, SVGProps } from "react";
import type { ActivityEvent, ActivityEventType } from "../types";
import {
  NotesPencilIcon,
  AltPathIcon,
  RefreshIcon,
  LockIcon,
  ActiveChatIcon,
  DocCheckmarkIcon,
  ChecklistIcon,
  RocketIcon,
  ComposerAttachIcon,
  ReceiptIcon,
  SignpostIcon,
  SpecCheckIcon,
  ShieldIcon,
  SendIcon,
  AiRobotIcon,
  CheckmarkIcon,
} from "../icons";

// Icon glyph is chosen by event CATEGORY. The color (gold vs gray) is driven by
// importance, not category — see the badge CSS.
const TYPE_ICON: Record<
  ActivityEventType,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  brief_updated: NotesPencilIcon,
  workflow_updated: AltPathIcon,
  rules_updated: RefreshIcon,
  decision_captured: LockIcon,
  open_question_added: ActiveChatIcon,
  acceptance_criterion_added: DocCheckmarkIcon,
  todo_created: ChecklistIcon,
  step_changed: RocketIcon,
  evidence_captured: ReceiptIcon,
  outcome_defined: SignpostIcon,
  milestone_captured: SpecCheckIcon,
  review_run: ShieldIcon,
  handoff_ready: SendIcon,
  build_linked: AiRobotIcon,
  verification_completed: CheckmarkIcon,
};

function relativeTime(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

/** Chronological feed of what the Coach captured — newest first. */
export function ActivityFeed(props: { activity: ActivityEvent[] }) {
  if (props.activity.length === 0) {
    return (
      <div className="rail-empty">
        No activity yet. It fills in as the Coach captures the spec.
      </div>
    );
  }

  return (
    <div className="activity-list">
      {[...props.activity].reverse().map((e) => {
        const Icon = TYPE_ICON[e.type] ?? RocketIcon;
        return (
          <div key={e.id} className={`activity-item importance-${e.importance}`}>
            <span className="activity-badge">
              <Icon />
            </span>
            <div className="activity-body">
              <div className="activity-head">
                <span className="activity-label">{e.label}</span>
                <span className="activity-time">{relativeTime(e.createdAt)}</span>
              </div>
              {e.target && e.target.kind !== "spec" && (
                <div className="activity-context">{e.target.label}</div>
              )}
              {e.description && (
                <div className="activity-desc">{e.description}</div>
              )}
              {/* Scan-first: no image previews. Compact artifact chips only —
                  none for normal events, one for a milestone, all for
                  significant. Richer previews live in the Spec, not here. */}
              {e.attachments && e.attachments.length > 0 && e.importance !== "normal" && (
                <div className="activity-chips">
                  {(e.importance === "milestone"
                    ? e.attachments.slice(0, 1)
                    : e.attachments
                  ).map((a) => (
                    <a
                      key={a.id}
                      className="activity-chip"
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      title={a.label}
                    >
                      <ComposerAttachIcon />
                      <span>{a.label}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
