const MICROLINK_ENDPOINT = "https://api.microlink.io";
const MAX_IMAGE_BYTES = 2_500_000;

export type PatternThumbnailResult = {
  status: number;
  contentType: string;
  body: Uint8Array;
  cacheControl?: string;
};

function safeSourceUrl(value: string | undefined): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host === "0.0.0.0" ||
      host === "127.0.0.1" ||
      host === "::1"
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function errorResult(status: number, message: string): PatternThumbnailResult {
  return {
    status,
    contentType: "application/json; charset=utf-8",
    body: new TextEncoder().encode(JSON.stringify({ error: message })),
    cacheControl: "no-store",
  };
}

/** Capture a source page server-side and return image bytes to the browser. */
export async function fetchPatternThumbnail(
  source: string | undefined,
  force = false,
  fetchImpl: typeof fetch = fetch,
): Promise<PatternThumbnailResult> {
  const sourceUrl = safeSourceUrl(source);
  if (!sourceUrl) return errorResult(400, "invalid_source_url");

  const params = new URLSearchParams({
    url: sourceUrl,
    screenshot: "true",
    meta: "false",
    embed: "screenshot.url",
    "viewport.width": "960",
    "viewport.height": "600",
  });
  if (force) params.set("force", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetchImpl(`${MICROLINK_ENDPOINT}?${params}`, {
      signal: controller.signal,
      headers: { accept: "image/avif,image/webp,image/png,image/*" },
    });
    if (!response.ok) return errorResult(502, `capture_failed_${response.status}`);

    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!contentType.startsWith("image/")) return errorResult(502, "capture_was_not_an_image");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      return errorResult(502, "capture_size_invalid");
    }

    return {
      status: 200,
      contentType,
      body: bytes,
      cacheControl: force ? "no-store" : "public, max-age=3600, stale-while-revalidate=86400",
    };
  } catch (error) {
    return errorResult(
      502,
      error instanceof Error && error.name === "AbortError"
        ? "capture_timed_out"
        : "capture_unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(
  req: { method?: string; query?: Record<string, string | string[] | undefined> },
  res: {
    status: (code: number) => unknown;
    setHeader: (name: string, value: string) => void;
    send: (body: Uint8Array) => void;
    json: (body: unknown) => void;
  },
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405);
    res.json({ error: "method_not_allowed" });
    return;
  }
  const rawUrl = req.query?.url;
  const rawForce = req.query?.force;
  const result = await fetchPatternThumbnail(
    Array.isArray(rawUrl) ? rawUrl[0] : rawUrl,
    (Array.isArray(rawForce) ? rawForce[0] : rawForce) === "true",
  );
  res.status(result.status);
  res.setHeader("content-type", result.contentType);
  res.setHeader("cache-control", result.cacheControl ?? "no-store");
  res.send(result.body);
}
