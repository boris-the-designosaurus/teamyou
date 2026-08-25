import { describe, expect, it, vi } from "vitest";
import { fetchPatternThumbnail } from "./pattern-thumbnail";

describe("pattern thumbnail proxy", () => {
  it("captures a public source page and returns image bytes", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const result = await fetchPatternThumbnail(
      "https://example.com/case-study",
      true,
      fetchMock as typeof fetch,
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/png");
    expect([...result.body]).toEqual([137, 80, 78, 71]);
    const upstreamUrl = String(fetchMock.mock.calls[0][0]);
    expect(upstreamUrl).toContain("image.thum.io/get");
    expect(upstreamUrl).toContain("maxAge/0");
    expect(upstreamUrl).toContain("url=https%3A%2F%2Fexample.com%2Fcase-study");
  });

  it("rejects unsafe local sources without calling the capture service", async () => {
    const fetchMock = vi.fn();
    const result = await fetchPatternThumbnail(
      "http://localhost:5174/private",
      false,
      fetchMock as typeof fetch,
    );
    expect(result.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to Microlink when the primary thumbnail provider fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    const result = await fetchPatternThumbnail(
      "https://example.com",
      false,
      fetchMock as typeof fetch,
    );
    expect(result.status).toBe(200);
    expect(String(fetchMock.mock.calls[1][0])).toContain("api.microlink.io");
    expect(String(fetchMock.mock.calls[1][0])).toContain("waitForTimeout=1500");
    expect(String(fetchMock.mock.calls[1][0])).toContain("screenshot.type=jpeg");
  });

  it("fails visibly only after both thumbnail providers fail", async () => {
    const result = await fetchPatternThumbnail(
      "https://example.com",
      false,
      vi.fn(async () => new Response("rate limited", { status: 429 })) as typeof fetch,
    );
    expect(result.status).toBe(502);
    expect(new TextDecoder().decode(result.body)).toContain(
      "capture_failed_thum_429_microlink_429",
    );
  });
});
