import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySpec, type WorkItem } from "./types";
import {
  migrateLegacyDesignProject,
  reopenCurrentPortfolioDirection,
  saveStore,
  storageSafeStore,
  type Store,
  type StoredDoc,
} from "./store";

function storedDoc(content: string, title = "Case study: Generate contract work"): StoredDoc {
  const item: WorkItem = {
    id: "doc-1",
    title,
    type: "case_study",
    workMode: "design_exploration",
    status: "drafting",
    currentStep: "define_problem",
    messages: [
      {
        id: "message-1",
        role: "user",
        content,
        createdAt: "2026-08-23T00:00:00.000Z",
      },
    ],
    spec: emptySpec(),
    activity: [],
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
  return { item, guide: null };
}

describe("migrateLegacyDesignProject", () => {
  it("reclassifies a saved portfolio redesign without losing its identity", () => {
    const before = storedDoc(
      "I want to redesign my product-design portfolio so it generates contract opportunities.",
    );
    const after = migrateLegacyDesignProject(before);

    expect(after.item.id).toBe(before.item.id);
    expect(after.item.messages).toEqual(before.item.messages);
    expect(after.item.type).toBe("design_project");
    expect(after.item.title).toBe("Design project: Generate contract work");
  });

  it("does not reclassify a request to write a case study about a redesign", () => {
    const before = storedDoc(
      "I want to write a case study documenting my website redesign.",
    );
    expect(migrateLegacyDesignProject(before)).toBe(before);
  });

  it("leaves unrelated case studies unchanged", () => {
    const before = storedDoc("Help me document the results of Self-Scheduling.");
    expect(migrateLegacyDesignProject(before)).toBe(before);
  });
});

describe("reopenCurrentPortfolioDirection", () => {
  it("reopens only the active portfolio project and requires a fresh selection", () => {
    const doc = storedDoc("Portfolio redesign", "Design project: Get hired for product design");
    doc.item.type = "design_project";
    doc.item.currentStep = "refine_treatments";
    doc.item.spec.milestoneArtifacts = [
      {
        id: "pattern-1",
        kind: "pattern_shortlist",
        title: "Metric-first header",
        status: "selected",
        createdAt: "2026-08-23T00:00:00.000Z",
        step: "find_patterns",
      },
    ];
    const store: Store = {
      version: 2,
      currentId: doc.item.id,
      docs: { [doc.item.id]: doc },
    };

    const reopened = reopenCurrentPortfolioDirection(
      store,
      "reopen-message",
      "2026-08-24T12:00:00.000Z",
    );

    expect(reopened.docs[doc.item.id].item.currentStep).toBe("choose_direction");
    expect(reopened.docs[doc.item.id].item.spec.milestoneArtifacts[0].status).toBe("exploring");
    expect(reopened.docs[doc.item.id].item.messages.at(-1)?.milestoneArtifactIds).toEqual(["pattern-1"]);
    expect(reopened.docs[doc.item.id].guide?.need).toBe("Direction selection");
    expect(store.docs[doc.item.id].item.currentStep).toBe("refine_treatments");
  });

  it("leaves a non-portfolio project untouched", () => {
    const doc = storedDoc("Design a billing modal", "Design project: Billing modal");
    doc.item.type = "design_project";
    const store: Store = {
      version: 2,
      currentId: doc.item.id,
      docs: { [doc.item.id]: doc },
    };

    expect(reopenCurrentPortfolioDirection(store, "id", "now")).toBe(store);
  });
});


describe("screenshot-safe persistence", () => {
  afterEach(() => vi.unstubAllGlobals());

  function storeWithScreenshot(persistedDataUrl?: string): Store {
    const doc = storedDoc("Portfolio evidence");
    doc.item.currentStep = "find_patterns";
    doc.item.messages[0].attachments = [
      {
        id: "screenshot-1",
        name: "analytics.png",
        dataUrl: "data:image/png;base64,FULL_IMAGE",
        mediaType: "image/png",
        persistedDataUrl,
        persistedMediaType: persistedDataUrl ? "image/jpeg" : undefined,
        sendable: true,
      },
    ];
    return {
      version: 2,
      currentId: doc.item.id,
      docs: { [doc.item.id]: doc },
    };
  }

  it("stores the lightweight preview without mutating the live project", () => {
    const store = storeWithScreenshot("data:image/jpeg;base64,PREVIEW");
    const safe = storageSafeStore(store);
    const attachment = safe.docs["doc-1"].item.messages[0].attachments![0];

    expect(attachment.dataUrl).toContain("PREVIEW");
    expect(attachment.mediaType).toBe("image/jpeg");
    expect(store.docs["doc-1"].item.messages[0].attachments![0].dataUrl).toContain(
      "FULL_IMAGE",
    );
    expect(safe.docs["doc-1"].item.currentStep).toBe("find_patterns");
  });

  it("preserves currentStep and the transcript when a legacy full image exceeds quota", () => {
    const writes: string[] = [];
    vi.stubGlobal("localStorage", {
      setItem: vi.fn((_key: string, value: string) => {
        if (value.includes("FULL_IMAGE")) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        writes.push(value);
      }),
    });

    saveStore(storeWithScreenshot());

    expect(writes).toHaveLength(1);
    const saved = JSON.parse(writes[0]) as Store;
    expect(saved.docs["doc-1"].item.currentStep).toBe("find_patterns");
    expect(saved.docs["doc-1"].item.messages[0].content).toBe("Portfolio evidence");
    expect(saved.docs["doc-1"].item.messages[0].attachments![0].dataUrl).toBe("");
  });
});
