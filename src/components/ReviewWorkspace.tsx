import { useState } from "react";
import type {
  CommentThread,
  FindingSeverity,
  MilestoneArtifact,
  ReviewCategory,
  Spec,
} from "../types";
import { REVIEW_CATEGORY_LABEL as CATEGORY_LABEL } from "../types";
import { ARTIFACT_STATUS_LABEL } from "./MilestoneCard";
import { reviewCategoryState } from "../merge";
import {
  createCommentThread,
  replyToThread,
  setThreadResolved,
  threadsForArtifact,
} from "../commentThreads";
import { CloseIcon, ChevronDownIcon, ShieldIcon, SendIcon, CheckmarkIcon } from "../icons";
import { WireframeVisual } from "./DirectionCards";

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  blocker: "Blocker",
  important: "Important",
  minor: "Minor",
};

type WorkspaceTab = "checks" | "discussions";

/**
 * The Review workspace — Review Checks (AI-generated findings against locked
 * criteria) + Discussions (persistent, artifact-anchored comment threads).
 * Entered from a milestone artifact's "Run review" / "Open review" action.
 * Never auto-runs a review on open (TEAMYOU_SOURCE_OF_TRUTH.md).
 */
export function ReviewWorkspace(props: {
  artifact: MilestoneArtifact;
  artifacts: MilestoneArtifact[];
  spec: Spec;
  reviewCategories: ReviewCategory[];
  onClose: () => void;
  onSelectArtifact: (artifactId: string) => void;
  onChooseArtifact: (artifactId: string) => void;
  onUpdateSpec: (updater: (spec: Spec) => Spec) => void;
  onRunReview: () => void;
  onApproveForBuild: () => void;
  onAskAI: (question: string) => Promise<string>;
  reviewRunning: boolean;
  reviewHasRun: boolean;
}) {
  const { artifact, spec, reviewCategories } = props;
  const threads = threadsForArtifact(spec, artifact.id);
  const [tab, setTab] = useState<WorkspaceTab>(threads.length > 0 ? "discussions" : "checks");
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<{ xPct: number; yPct: number } | null>(null);
  const [highlightedThreadId, setHighlightedThreadId] = useState<string | null>(null);

  const findings = spec.reviewFindings.filter((f) => f.artifactId === artifact.id);
  const hasRun = findings.length > 0 || props.reviewHasRun;
  const isWireframe = artifact.kind === "wireframe";

  function categoryLabel(cat: ReviewCategory): string {
    if (!isWireframe) return CATEGORY_LABEL[cat];
    if (cat === "problem_alignment") return "Original problem";
    if (cat === "acceptance_criteria") return "Locked criteria";
    if (cat === "interaction_states") return "Hierarchy & core flow";
    if (cat === "critical_risks") return "Scope & key risks";
    return CATEGORY_LABEL[cat];
  }

  function categoryState(cat: ReviewCategory): "not_run" | "passed" | "failed" {
    if (!hasRun) return "not_run";
    return reviewCategoryState(findings, cat);
  }

  async function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const anchor = pendingAnchor;
    setPendingAnchor(null);
    props.onUpdateSpec((sp) => createCommentThread(sp, artifact.id, anchor, text));
    setTab("discussions");
  }

  async function askAI() {
    const text = draft.trim();
    if (!text || asking) return;
    setDraft("");
    const anchor = pendingAnchor;
    setPendingAnchor(null);
    setAsking(true);
    // Create the thread with the question, then append the coach's answer.
    let threadId = "";
    props.onUpdateSpec((sp) => {
      const next = createCommentThread(sp, artifact.id, anchor, text);
      threadId = next.commentThreads[next.commentThreads.length - 1].id;
      return next;
    });
    setTab("discussions");
    try {
      const answer = await props.onAskAI(text);
      props.onUpdateSpec((sp) => replyToThread(sp, threadId, "coach", answer));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      props.onUpdateSpec((sp) =>
        replyToThread(sp, threadId, "coach", `Sorry — something went wrong (${message}).`),
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="review-workspace">
      <div className="review-workspace-topbar">
        <div className="review-workspace-title">
          <button type="button" className="review-workspace-back" onClick={props.onClose} aria-label="Back to work">←</button>
          <span>{artifact.title}</span>
          <span className="tag milestone-status-tag">{ARTIFACT_STATUS_LABEL[artifact.status]}</span>
        </div>
        <button type="button" className="round-btn" onClick={props.onClose} title="Close">
          <CloseIcon />
        </button>
      </div>

      <nav className="tabs review-tabs">
        <button
          type="button"
          className={`tab${tab === "checks" ? " active" : ""}`}
          onClick={() => setTab("checks")}
        >
          {isWireframe ? "Direction checks" : "Review checks"}
        </button>
        <button
          type="button"
          className={`tab${tab === "discussions" ? " active" : ""}`}
          onClick={() => setTab("discussions")}
        >
          Discussions{threads.length > 0 ? ` (${threads.length})` : ""}
        </button>
      </nav>

      <div className="review-workspace-body">
        <aside className="review-version-rail" aria-label="Design versions">
          {props.artifacts.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`review-version-thumb${candidate.id === artifact.id ? " active" : ""}`}
              onClick={() => props.onSelectArtifact(candidate.id)}
              title={candidate.title}
            >
              <span className="review-version-preview">
                {candidate.kind === "wireframe" ? (
                  <WireframeVisual artifact={candidate} />
                ) : candidate.thumbnailUrl ? (
                  <img src={candidate.thumbnailUrl} alt="" />
                ) : (
                  <i />
                )}
              </span>
              <strong>{candidate.title}</strong>
            </button>
          ))}
        </aside>

        <main className="review-design-canvas">
          <div
            className={`review-design-artboard${tab === "discussions" ? " commenting" : ""}`}
            onClick={(event) => {
              if (tab !== "discussions") return;
              const rect = event.currentTarget.getBoundingClientRect();
              setPendingAnchor({
                xPct: ((event.clientX - rect.left) / rect.width) * 100,
                yPct: ((event.clientY - rect.top) / rect.height) * 100,
              });
              setHighlightedThreadId(null);
            }}
          >
            {artifact.kind === "wireframe" ? (
              <WireframeVisual artifact={artifact} />
            ) : artifact.thumbnailUrl ? (
              <img src={artifact.thumbnailUrl} alt={artifact.title} />
            ) : (
              <div className="review-design-missing">No visual attached yet</div>
            )}
            {threads
              .filter((thread): thread is CommentThread & { anchor: { xPct: number; yPct: number } } => !!thread.anchor)
              .map((thread, index) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`review-artifact-pin${highlightedThreadId === thread.id ? " active" : ""}${
                    thread.status === "resolved" ? " resolved" : ""
                  }`}
                  style={{ left: `${thread.anchor.xPct}%`, top: `${thread.anchor.yPct}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setHighlightedThreadId(thread.id);
                    setTab("discussions");
                  }}
                >
                  {index + 1}
                </button>
              ))}
            {pendingAnchor && (
              <span
                className="review-artifact-pin pending"
                style={{ left: `${pendingAnchor.xPct}%`, top: `${pendingAnchor.yPct}%` }}
              />
            )}
          </div>
        </main>

        <aside className="review-inspector">
        {tab === "checks" ? (
          <div className="review-checks">
            <div className="review-categories">
              {reviewCategories.map((cat) => {
                const state = categoryState(cat);
                return (
                  <div key={cat} className={`review-category-row state-${state}`}>
                    {state === "passed" ? (
                      <CheckmarkIcon className="review-category-ic" />
                    ) : (
                      <ShieldIcon className="review-category-ic" />
                    )}
                    <span>{categoryLabel(cat)}</span>
                    <span className="review-category-state">
                      {state === "not_run" ? "Not run" : state === "passed" ? "Passed" : "Failed"}
                    </span>
                  </div>
                );
              })}
            </div>

            {findings.length === 0 ? (
              <p className="review-empty">
                {hasRun
                  ? "No findings against these categories."
                  : isWireframe
                    ? "No direction check run yet. Check whether this wireframe solves the original problem, fits the locked criteria, has a clear hierarchy and core flow, and stays in scope."
                    : "No review run yet. Run a review to check this artifact against the locked problem, scope, acceptance criteria, and design-system rules."}
              </p>
            ) : (
              <ul className="review-findings">
                {findings.map((f) => (
                  <li key={f.id} className={`review-finding severity-${f.severity} status-${f.status}`}>
                    <div className="review-finding-head">
                      <span className={`review-severity-badge severity-${f.severity}`}>
                        {SEVERITY_LABEL[f.severity]}
                      </span>
                      <span className="review-finding-category">{categoryLabel(f.category)}</span>
                      {f.status !== "open" && (
                        <span className="tag">{f.status === "resolved" ? "Resolved" : "Accepted"}</span>
                      )}
                    </div>
                    <p className="review-finding-text">{f.finding}</p>
                    <dl className="review-finding-detail">
                      <dt>Evidence</dt>
                      <dd>{f.evidence}</dd>
                      <dt>Impact</dt>
                      <dd>{f.impact}</dd>
                      <dt>Expected correction</dt>
                      <dd>{f.expectedCorrection}</dd>
                      {f.relatedCriterion && (
                        <>
                          <dt>Related criterion</dt>
                          <dd>{f.relatedCriterion}</dd>
                        </>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="discussions">
            {pendingAnchor && (
              <p className="review-pending-anchor-hint">
                Commenting at the pinned point — type below and send, or{" "}
                <button type="button" onClick={() => setPendingAnchor(null)}>
                  cancel the pin
                </button>
                .
              </p>
            )}
            {threads.length === 0 ? (
              <p className="review-empty">
                No comments yet. {artifact.thumbnailUrl ? "Click the image to pin a comment, or " : ""}
                Ask a question, leave a note, or request a change.
              </p>
            ) : (
              threads.map((t) => (
                <ThreadView
                  key={t.id}
                  thread={t}
                  index={threads.filter((x) => x.anchor).findIndex((x) => x.id === t.id)}
                  highlighted={highlightedThreadId === t.id}
                  onUpdateSpec={props.onUpdateSpec}
                />
              ))
            )}
          </div>
        )}
        </aside>
      </div>

      <div className="review-composer">
        <textarea
          rows={1}
          placeholder={
            pendingAnchor ? "Comment on the pinned point…" : "Leave a comment, or ask the AI a question…"
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="review-actions">
          <button
            type="button"
            className="review-action"
            onClick={() => {
              if (draft.trim()) void submitDraft();
              else setTab("discussions");
            }}
            title="Comments"
          >
            <SendIcon /> Comments{threads.length > 0 ? ` (${threads.length})` : ""}
          </button>
          <button
            type="button"
            className="review-action"
            onClick={() => void askAI()}
            disabled={!draft.trim() || asking}
            title="Ask AI"
          >
            {asking ? "Asking…" : "Ask AI"}
          </button>
          <button
            type="button"
            className="review-action"
            onClick={() => {
              setTab("checks");
              props.onRunReview();
            }}
            disabled={props.reviewRunning}
            title={isWireframe ? "Check direction" : "Run review"}
          >
            {props.reviewRunning
              ? "Checking…"
              : isWireframe
                ? "Check direction"
                : "Run review"}
          </button>
          <button type="button" className="review-action" disabled title="No linked Figma file yet">
            Open in Figma <ChevronDownIcon />
          </button>
          {artifact.kind === "wireframe" ? (
            <button
              type="button"
              className="review-action primary"
              onClick={() => props.onChooseArtifact(artifact.id)}
              disabled={artifact.status === "selected"}
            >
              {artifact.status === "selected" ? "Chosen" : "Choose direction"}
            </button>
          ) : (
            <button
              type="button"
              className="review-action primary"
              onClick={props.onApproveForBuild}
              disabled={artifact.status === "approved_for_build"}
              title="Approve for build"
            >
              Approve for build
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadView(props: {
  thread: CommentThread;
  index: number; // position among anchored threads; -1 when not anchored
  highlighted: boolean;
  onUpdateSpec: (updater: (spec: Spec) => Spec) => void;
}) {
  const { thread } = props;
  const [reply, setReply] = useState("");

  function submitReply() {
    const text = reply.trim();
    if (!text) return;
    props.onUpdateSpec((sp) => replyToThread(sp, thread.id, "user", text));
    setReply("");
  }

  return (
    <div className={`comment-thread status-${thread.status}${props.highlighted ? " highlighted" : ""}`}>
      {thread.anchor && <span className="comment-thread-pin-badge">{props.index + 1}</span>}
      <div className="comment-thread-messages">
        {thread.messages.map((m) => (
          <div key={m.id} className={`comment-message role-${m.role}`}>
            <span className="comment-message-role">{m.role === "coach" ? "Coach" : "You"}</span>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      <div className="comment-thread-actions">
        <input
          className="comment-reply-input"
          placeholder="Reply…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitReply();
            }
          }}
        />
        {reply.trim() && (
          <button type="button" className="comment-resolve-btn" onClick={submitReply}>
            Reply
          </button>
        )}
        <button
          type="button"
          className="comment-resolve-btn"
          onClick={() => props.onUpdateSpec((sp) => setThreadResolved(sp, thread.id, thread.status !== "resolved"))}
        >
          {thread.status === "resolved" ? "Reopen" : "Resolve"}
        </button>
      </div>
    </div>
  );
}
