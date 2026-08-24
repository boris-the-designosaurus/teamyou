// Local persistence for saved specs. One localStorage blob holds every doc plus
// the currently-open id, so work survives reloads and you can switch between
// specs like real documents.
//
// Limitation: image attachments are stored as base64 inside messages, so a lot
// of screenshots can exceed the ~5MB localStorage quota. saveStore() guards
// against that (evicts the oldest doc and retries); heavy image use is the
// signal to move this to IndexedDB.

import type { GuidePanel, WorkItem } from "./types";

const KEY = "teamyou:v1";
const VERSION = 2;

export type StoredDoc = { item: WorkItem; guide: GuidePanel | null };
export type Store = {
  version: number;
  currentId: string | null;
  docs: Record<string, StoredDoc>;
};

export type DocSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

const DESIGN_PROJECT_INTENT =
  /\b(?:design|redesign|build|create|revamp|rework)\b[\s\S]{0,160}\b(?:portfolio|website|web\s*site|site|app|product|workflow|experience)\b/i;
const CASE_STUDY_AUTHORING_INTENT =
  /\b(?:write|draft|document|create)\b[\s\S]{0,80}\bcase\s+stud(?:y|ies)\b|\btell\s+the\s+story\b/i;

/**
 * Early builds treated any mention of a portfolio as a case-study request.
 * Correct saved docs only when the user's own language clearly asks to make
 * the underlying site/product. A request to write a case study stays intact.
 */
export function migrateLegacyDesignProject(doc: StoredDoc): StoredDoc {
  if (doc.item.type !== "case_study") return doc;

  const userText = doc.item.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  if (
    !DESIGN_PROJECT_INTENT.test(userText) ||
    CASE_STUDY_AUTHORING_INTENT.test(userText)
  ) {
    return doc;
  }

  const title = doc.item.title.replace(/^Case study:/, "Design project:");
  return {
    ...doc,
    item: {
      ...doc.item,
      type: "design_project",
      title,
    },
  };
}

const emptyStore = (): Store => ({
  version: VERSION,
  currentId: null,
  docs: {},
});

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Store;
    if (
      !parsed ||
      parsed.version !== VERSION ||
      typeof parsed.docs !== "object" ||
      parsed.docs === null
    ) {
      return emptyStore();
    }
    return {
      ...parsed,
      docs: Object.fromEntries(
        Object.entries(parsed.docs).map(([id, doc]) => [
          id,
          migrateLegacyDesignProject(doc),
        ]),
      ),
    };
  } catch {
    // Corrupt or incompatible blob — start fresh rather than white-screen.
    return emptyStore();
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Likely QuotaExceededError from big attachments. Drop the oldest doc that
    // isn't the current one and try once more; if it still fails, give up
    // quietly — persistence is best-effort.
    const trimmed = evictOldest(store);
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch {
      /* noop */
    }
  }
}

function evictOldest(store: Store): Store {
  const ids = Object.keys(store.docs);
  if (ids.length <= 1) return store;
  const oldest = ids
    .filter((id) => id !== store.currentId)
    .sort((a, b) =>
      store.docs[a].item.updatedAt < store.docs[b].item.updatedAt ? -1 : 1,
    )[0];
  if (!oldest) return store;
  const docs = { ...store.docs };
  delete docs[oldest];
  return { ...store, docs };
}

/** Doc summaries for the switcher, newest first. */
export function docList(store: Store): DocSummary[] {
  return Object.values(store.docs)
    .map((d) => d.item)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((i) => ({ id: i.id, title: i.title, updatedAt: i.updatedAt }));
}

/** The doc to open on load: the last-open one if it still exists, else newest. */
export function pickOpenId(store: Store): string | null {
  if (store.currentId && store.docs[store.currentId]) return store.currentId;
  return docList(store)[0]?.id ?? null;
}
