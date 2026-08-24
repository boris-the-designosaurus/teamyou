// Artifact-anchored discussion threads (the "Discussions" tab in the Review
// workspace). Pure, immutable helpers in the style of attachments.ts — these
// are user-driven state changes, NOT part of the Coach turn contract, so they
// never go through mergeSpec. The one exception is a coach reply INTO a
// thread, which is still just appended here after a narrowly-scoped
// callCoach call (see ReviewWorkspace's "Ask AI" action).
import type { CommentThread, Spec } from "./types";

export type MakeId = () => string;
const defaultMakeId: MakeId = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();

export function createCommentThread(
  spec: Spec,
  artifactId: string,
  anchor: { xPct: number; yPct: number } | null,
  text: string,
  makeId: MakeId = defaultMakeId,
): Spec {
  const now = nowISO();
  const thread: CommentThread = {
    id: makeId(),
    artifactId,
    anchor,
    messages: [{ id: makeId(), role: "user", text, createdAt: now }],
    status: "open",
    createdAt: now,
  };
  return { ...spec, commentThreads: [...spec.commentThreads, thread] };
}

export function replyToThread(
  spec: Spec,
  threadId: string,
  role: "user" | "coach",
  text: string,
  makeId: MakeId = defaultMakeId,
): Spec {
  const now = nowISO();
  return {
    ...spec,
    commentThreads: spec.commentThreads.map((t) =>
      t.id === threadId
        ? { ...t, messages: [...t.messages, { id: makeId(), role, text, createdAt: now }] }
        : t,
    ),
  };
}

/** Resolving is never forced — the user (or an uploaded artifact later) decides. */
export function setThreadResolved(spec: Spec, threadId: string, resolved: boolean): Spec {
  return {
    ...spec,
    commentThreads: spec.commentThreads.map((t) =>
      t.id === threadId ? { ...t, status: resolved ? "resolved" : "open" } : t,
    ),
  };
}

export function threadsForArtifact(spec: Spec, artifactId: string): CommentThread[] {
  return spec.commentThreads
    .filter((t) => t.artifactId === artifactId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}
