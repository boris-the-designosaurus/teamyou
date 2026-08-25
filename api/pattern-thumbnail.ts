const MICROLINK_ENDPOINT = "https://api.microlink.io";
const THUM_ENDPOINT = "https://image.thum.io/get";
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

async function readImageResponse(
  response: Response,
  cacheControl: string,
): Promise<PatternThumbnailResult | null> {
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!contentType.startsWith("image/")) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { status: 200, contentType, body: bytes, cacheControl };
}

function thumCaptureUrl(sourceUrl: string, force: boolean): string {
  const cacheHours = force ? 0 : 1;
  return `${THUM_ENDPOINT}/width/960/crop/600/maxAge/${cacheHours}/noanimate/?url=${encodeURIComponent(sourceUrl)}`;
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
    waitUntil: "networkidle2",
    waitForTimeout: "1500",
  });
  if (force) params.set("force", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);
  try {
    // Thum.io has a no-key thumbnail endpoint and avoids Microlink's small
    // anonymous daily quota. Microlink remains a second provider for pages
    // Thum cannot render.
    const thumResponse = await fetchImpl(thumCaptureUrl(sourceUrl, force), {
      signal: controller.signal,
      headers: { accept: "image/avif,image/webp,image/png,image/*" },
    });
    const cacheControl = force
      ? "no-store"
      : "public, max-age=3600, stale-while-revalidate=86400";
    const thumImage = await readImageResponse(thumResponse, cacheControl);
    if (thumImage) return thumImage;

    const microlinkResponse = await fetchImpl(`${MICROLINK_ENDPOINT}?${params}`, {
      signal: controller.signal,
      headers: { accept: "image/avif,image/webp,image/png,image/*" },
    });
    const microlinkImage = await readImageResponse(microlinkResponse, cacheControl);
    if (microlinkImage) return microlinkImage;

    return errorResult(
      502,
      `capture_failed_thum_${thumResponse.status}_microlink_${microlinkResponse.status}`,
    );
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
