import { describe, expect, it } from "vitest";
import { toCoachRequestMessages } from "./coachClient";
import type { ImageAttachment, Message } from "./types";

function image(id: string): ImageAttachment {
  return {
    id,
    name: `${id}.png`,
    mediaType: "image/png",
    dataUrl: `data:image/png;base64,${id}`,
    sendable: true,
  };
}

function message(
  id: string,
  role: Message["role"],
  attachments?: ImageAttachment[],
): Message {
  return {
    id,
    role,
    content: `${id} content`,
    attachments,
    createdAt: "2026-08-24T12:00:00.000Z",
  };
}

describe("toCoachRequestMessages", () => {
  it("sends raw screenshots only on the latest user turn", () => {
    const result = toCoachRequestMessages([
      message("old-user", "user", [image("old")]),
      message("coach", "coach"),
      message("latest-user", "user", [image("latest")]),
    ]);

    expect(result[0].images).toBeUndefined();
    expect(result[1].images).toBeUndefined();
    expect(result[2].images).toEqual([
      {
        id: "latest",
        name: "latest.png",
        dataUrl: "data:image/png;base64,latest",
      },
    ]);
  });

  it("does not resend historical screenshots on a later text-only turn", () => {
    const result = toCoachRequestMessages([
      message("image-turn", "user", [image("portfolio")]),
      message("grounded-observation", "coach"),
      message("follow-up", "user"),
    ]);

    expect(result.every((entry) => entry.images === undefined)).toBe(true);
    expect(result.map((entry) => entry.content)).toEqual([
      "image-turn content",
      "grounded-observation content",
      "follow-up content",
    ]);
  });

  it("still drops unsupported images from the latest user turn", () => {
    const unsupported = {
      ...image("diagram"),
      mediaType: "image/svg+xml",
      dataUrl: "data:image/svg+xml;base64,diagram",
      sendable: false,
    };

    const [result] = toCoachRequestMessages([
      message("latest-user", "user", [unsupported]),
    ]);

    expect(result.images).toBeUndefined();
  });
});
