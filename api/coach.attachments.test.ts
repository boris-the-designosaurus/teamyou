import { describe, expect, it } from "vitest";
import { toAttachmentSource } from "./coach";

describe("Coach attachment parsing", () => {
  it("parses PDFs as document sources", () => {
    expect(
      toAttachmentSource({
        dataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
      }),
    ).toEqual({
      kind: "document",
      mediaType: "application/pdf",
      data: "JVBERi0xLjQ=",
    });
  });

  it("keeps raster images as image sources", () => {
    expect(
      toAttachmentSource({ dataUrl: "data:image/png;base64,iVBORw0KGgo=" }),
    ).toEqual({
      kind: "image",
      mediaType: "image/png",
      data: "iVBORw0KGgo=",
    });
  });
});
