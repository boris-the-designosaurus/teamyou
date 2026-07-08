import type { ActivityEvent } from "../types";

/** Chronological feed of what the Coach captured — newest first. */
export function ActivityFeed(props: { activity: ActivityEvent[] }) {
  if (props.activity.length === 0) {
    return <div className="rail-empty">No activity yet. It fills in as the Coach captures the spec.</div>;
  }

  return (
    <div className="activity-list">
      {[...props.activity].reverse().map((e) => (
        <div key={e.id} className="activity-item">
          <span className="activity-dot" />
          <div>
            <div className="activity-label">{e.label}</div>
            {e.description && <div className="activity-desc">{e.description}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
