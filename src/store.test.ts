import { describe, expect, it } from "vitest";
import { emptySpec, type WorkItem } from "./types";
import { migrateLegacyDesignProject, type StoredDoc } from "./store";

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
