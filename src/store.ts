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

const PORTFOLIO_DIRECTION_PROJECT = /\b(?:portfolio|hired|product design job)\b/i;

/**
 * One-time recovery for the active portfolio project used while validating the
 * pattern workspace. It removes the stale pattern artifacts and their inline
 * card references, then reopens Find relevant patterns with one clear action
 * that asks the Coach to retrieve a genuinely fresh sourced set.
 */
export function clearCurrentPortfolioPatterns(
  store: Store,
  messageId: string = crypto.randomUUID(),
  timestamp = new Date().toISOString(),
): Store {
  const currentId = store.currentId;
  if (!currentId) return store;
  const current = store.docs[currentId];
  if (!current || current.item.type !== "design_project") return store;

  const searchableText = [
    current.item.title,
    current.item.spec.brief.goal,
    current.item.spec.brief.problem,
  ].filter(Boolean).join(" ");
  if (!PORTFOLIO_DIRECTION_PROJECT.test(searchableText)) return store;

  const patternIds = current.item.spec.milestoneArtifacts
    .filter((artifact) => artifact.kind === "pattern_shortlist")
    .map((artifact) => artifact.id);
  if (patternIds.length === 0) return store;

  const patternIdSet = new Set(patternIds);
  const item: WorkItem = {
    ...current.item,
    currentStep: "find_patterns",
    spec: {
      ...current.item.spec,
      milestoneArtifacts: current.item.spec.milestoneArtifacts.filter(
        (artifact) => artifact.kind !== "pattern_shortlist",
      ),
    },
    messages: [
      ...current.item.messages.map((message) => {
        if (!message.milestoneArtifactIds) return message;
        const remaining = message.milestoneArtifactIds.filter((id) => !patternIdSet.has(id));
        return {
          ...message,
          milestoneArtifactIds: remaining.length > 0 ? remaining : undefined,
        };
      }),
      {
        id: messageId,
        role: "coach",
        content:
          "The previous pattern examples and thumbnails have been cleared. Generate a fresh, sourced pattern set now?",
        quickReplies: ["Generate fresh patterns"],
        recommendedQuickReply: "Generate fresh patterns",
        createdAt: timestamp,
      },
    ],
    updatedAt: timestamp,
  };

  return {
    ...store,
    docs: {
      ...store.docs,
      [currentId]: {
        item,
        guide: {
          title: "Find relevant patterns",
          captured: [],
          need: "Fresh sourced pattern set",
          nextPrompt: "Generate a fresh set of visual pattern references?",
          priorSummary: "Criteria are preserved; the stale pattern set was removed.",
        },
      },
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
  const storageSafe = storageSafeStore(store);
  try {
    localStorage.setItem(KEY, JSON.stringify(storageSafe));
  } catch {
    // Legacy projects may already contain full-size screenshots without a
    // persisted preview. Preserve every decision, message, and currentStep by
    // dropping only those image payloads before considering document eviction.
    const metadataOnly = withoutImagePayloads(storageSafe);
    try {
      localStorage.setItem(KEY, JSON.stringify(metadataOnly));
    } catch {
      const trimmed = evictOldest(metadataOnly);
      try {
        localStorage.setItem(KEY, JSON.stringify(trimmed));
      } catch {
        /* noop */
      }
    }
  }
}

/** Replace full screenshot bytes with the lightweight preview generated when
 * the attachment was added. The in-memory Store is never mutated. */
export function storageSafeStore(store: Store): Store {
  return mapAttachments(store, (attachment) => {
    const dataUrl = attachment.persistedDataUrl ?? attachment.dataUrl;
    const mediaType =
      attachment.persistedMediaType ?? attachment.mediaType;
    const {
      persistedDataUrl: _persistedDataUrl,
      persistedMediaType: _persistedMediaType,
      ...rest
    } = attachment;
    return { ...rest, dataUrl, mediaType };
  });
}

function withoutImagePayloads(store: Store): Store {
  return mapAttachments(store, (attachment) => ({
    ...attachment,
    dataUrl: "",
    sendable: false,
  }));
}

function mapAttachments(
  store: Store,
  mapAttachment: (
    attachment: NonNullable<WorkItem["messages"][number]["attachments"]>[number],
  ) => NonNullable<WorkItem["messages"][number]["attachments"]>[number],
): Store {
  return {
    ...store,
    docs: Object.fromEntries(
      Object.entries(store.docs).map(([id, doc]) => [
        id,
        {
          ...doc,
          item: {
            ...doc.item,
            messages: doc.item.messages.map((message) => ({
              ...message,
              attachments: message.attachments?.map(mapAttachment),
            })),
          },
        },
      ]),
    ),
  };
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
