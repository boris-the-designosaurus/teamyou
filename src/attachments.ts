// Attachment resolution. Every attachment belongs to a work object (spec, todo,
// or the all_todos rollup); this picks the single "current relevant" artifact
// for a given target using the product's priority ladders.
import type { Attachment, Spec } from "./types";

export type ResolveTarget =
  | { kind: "spec" }
  | { kind: "todo"; id: string }
  | { kind: "all_todos" };

function mostRecent(list: Attachment[]): Attachment | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

function pinned(list: Attachment[]): Attachment | null {
  return mostRecent(list.filter((a) => a.isPinned));
}

function firstOf(...candidates: (Attachment | null)[]): Attachment | null {
  for (const c of candidates) if (c) return c;
  return null;
}

// Spec-scoped attachments split by where they live.
function specScoped(spec: Spec): Attachment[] {
  return (spec.attachments ?? []).filter((a) => (a.scope ?? "spec") === "spec");
}
function allTodosAttachments(spec: Spec): Attachment[] {
  return (spec.attachments ?? []).filter((a) => a.scope === "all_todos");
}
function todoAttachments(spec: Spec, todoId: string): Attachment[] {
  return spec.rules.todos.find((t) => t.id === todoId)?.attachments ?? [];
}
function activeTodoAttachments(spec: Spec): Attachment[] {
  return spec.rules.todos
    .filter((t) => t.status !== "done")
    .flatMap((t) => t.attachments ?? []);
}

/**
 * Resolve the single pinned/most-relevant attachment for a target.
 *
 * todo:      pinned-on-todo → recent-on-todo → recent-on-all_todos → recent-on-spec → null
 * all_todos: pinned-all_todos → recent-all_todos → recent-across-active-todos → recent-on-spec → null
 * spec:      pinned-spec → recent-milestone/review → recent-on-spec → null
 */
export function resolvePinnedAttachment(
  spec: Spec,
  target: ResolveTarget,
): Attachment | null {
  if (target.kind === "todo") {
    const own = todoAttachments(spec, target.id);
    return firstOf(
      pinned(own),
      mostRecent(own),
      mostRecent(allTodosAttachments(spec)),
      mostRecent(specScoped(spec)),
    );
  }

  if (target.kind === "all_todos") {
    const roll = allTodosAttachments(spec);
    return firstOf(
      pinned(roll),
      mostRecent(roll),
      mostRecent(activeTodoAttachments(spec)),
      mostRecent(specScoped(spec)),
    );
  }

  // spec
  const scoped = specScoped(spec);
  return firstOf(
    pinned(scoped),
    mostRecent(scoped.filter((a) => a.isMilestone || a.section === "specify_build")),
    mostRecent(scoped),
  );
}

/**
 * Toggle the pinned attachment for a single todo. Pinning a new artifact unpins
 * the previous one; clicking the already-pinned artifact unpins it. Only that
 * todo's attachments are touched — spec-level and all_todos pins are untouched.
 */
export function pinTodoAttachment(
  spec: Spec,
  todoId: string,
  attachmentId: string,
): Spec {
  return {
    ...spec,
    rules: {
      ...spec.rules,
      todos: spec.rules.todos.map((t) => {
        if (t.id !== todoId) return t;
        const atts = t.attachments ?? [];
        const alreadyPinned = atts.find((a) => a.isPinned)?.id === attachmentId;
        return {
          ...t,
          attachments: atts.map((a) => ({
            ...a,
            isPinned: alreadyPinned ? false : a.id === attachmentId,
          })),
        };
      }),
    },
  };
}

/**
 * Link an attachment to a work target (todo / all_todos / spec). Idempotent —
 * re-linking the same attachment id is a no-op. Spec is the fallback when the
 * active context is unclear. Only touches the targeted object.
 */
export function linkAttachmentToTarget(
  spec: Spec,
  target: ResolveTarget,
  att: Attachment,
): Spec {
  const has = (list: Attachment[]) => list.some((a) => a.id === att.id);

  if (target.kind === "todo") {
    return {
      ...spec,
      rules: {
        ...spec.rules,
        todos: spec.rules.todos.map((t) => {
          if (t.id !== target.id) return t;
          const cur = t.attachments ?? [];
          return has(cur)
            ? t
            : { ...t, attachments: [...cur, { ...att, section: "specify_build" as const }] };
        }),
      },
    };
  }

  const cur = spec.attachments ?? [];
  if (has(cur)) return spec;
  const placed: Attachment =
    target.kind === "all_todos" ? { ...att, scope: "all_todos" } : att;
  return { ...spec, attachments: [...cur, placed] };
}

/** All attachments that support a given spec section (spec-scoped + todo-scoped). */
export function attachmentsForSection(
  spec: Spec,
  section: Attachment["section"],
): Attachment[] {
  const scoped = (spec.attachments ?? []).filter((a) => a.section === section);
  const todoScoped = spec.rules.todos
    .flatMap((t) => t.attachments ?? [])
    .filter((a) => a.section === section);
  return [...scoped, ...todoScoped].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
}
