import type { ImageAttachment } from "./types";

const MAX_EDGE = 1600; // long-edge cap — keeps screenshots within a sane token/payload size
const PERSISTED_PREVIEW_EDGE = 720;
const PERSISTED_PREVIEW_QUALITY = 0.72;
// Formats the Coach (Anthropic vision) can process.
const SENDABLE = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Turn an image File/Blob into an ImageAttachment.
 *
 * Every sendable attachment is re-encoded through a canvas to a canonical format
 * so its data URL prefix ALWAYS matches its bytes — this is what the Coach API
 * requires and where the "Could not process image" bug came from (a clipboard
 * image whose declared type didn't match its data). GIFs pass through to keep
 * animation. SVG / undecodable images stay attached locally but are not sent.
 */
export async function fileToAttachment(file: File): Promise<ImageAttachment> {
  const rawDataUrl = await readAsDataUrl(file);
  const base = {
    id: crypto.randomUUID(),
    name: file.name,
    bytes: file.size,
  };

  // SVG and non-images: keep for local display, never send.
  if (file.type === "image/svg+xml" || !file.type.startsWith("image/")) {
    return {
      ...base,
      dataUrl: rawDataUrl,
      mediaType: file.type || "application/octet-stream",
      sendable: false,
    };
  }

  // GIF: preserve animation — canvas would flatten it. The Coach accepts gif.
  if (file.type === "image/gif") {
    const persistedDataUrl = await reencode(
      rawDataUrl,
      "image/jpeg",
      PERSISTED_PREVIEW_EDGE,
      PERSISTED_PREVIEW_QUALITY,
    );
    return {
      ...base,
      dataUrl: rawDataUrl,
      mediaType: "image/gif",
      persistedDataUrl: persistedDataUrl ?? undefined,
      persistedMediaType: persistedDataUrl ? "image/jpeg" : undefined,
      sendable: true,
    };
  }

  // Everything else raster: re-encode (and downscale) so the prefix matches the
  // bytes. png → png, jpeg → jpeg, webp → webp, anything odd → png.
  const target =
    file.type === "image/jpeg" || file.type === "image/webp"
      ? file.type
      : "image/png";
  const encoded = await reencode(rawDataUrl, target);
  if (!encoded) {
    // Couldn't decode it — keep locally, don't risk a bad payload.
    return { ...base, dataUrl: rawDataUrl, mediaType: file.type, sendable: false };
  }
  const persistedDataUrl = await reencode(
    encoded,
    "image/jpeg",
    PERSISTED_PREVIEW_EDGE,
    PERSISTED_PREVIEW_QUALITY,
  );
  return {
    ...base,
    dataUrl: encoded,
    mediaType: target,
    bytes: Math.round((encoded.length - encoded.indexOf(",") - 1) * 0.75),
    persistedDataUrl: persistedDataUrl ?? undefined,
    persistedMediaType: persistedDataUrl ? "image/jpeg" : undefined,
    sendable: true,
  };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Decode a data URL and re-encode it to `mediaType` via canvas (downscaling to
 * MAX_EDGE). Returns a data URL whose prefix matches its bytes, or null if the
 * image can't be decoded.
 */
function reencode(
  dataUrl: string,
  mediaType: string,
  maxEdge = MAX_EDGE,
  outputQuality = 0.85,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const longEdge = Math.max(img.width, img.height);
      const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const quality = mediaType === "image/png" ? undefined : outputQuality;
        resolve(canvas.toDataURL(mediaType, quality));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** True for a data URL of a Coach-processable image type. */
export function isSendableImageDataUrl(dataUrl: string): boolean {
  return SENDABLE.some((t) => dataUrl.startsWith(`data:${t};base64,`));
}

/** Split a data URL into its base64 payload (no prefix). */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}
