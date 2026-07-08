import type { ImageAttachment } from "./types";

const MAX_EDGE = 1600; // long-edge cap — keeps screenshots within a sane token/payload size
const SUPPORTED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Turn an image File/Blob into an ImageAttachment, downscaling to MAX_EDGE on
 * the long edge if needed. GIFs are passed through untouched (canvas would drop
 * animation, and they're rarely huge here).
 */
export async function fileToAttachment(file: File): Promise<ImageAttachment> {
  const mediaType = SUPPORTED.includes(file.type) ? file.type : "image/png";

  const rawDataUrl = await readAsDataUrl(file);

  // Skip re-encoding for GIF (preserve animation) — just pass through.
  if (mediaType === "image/gif") {
    return {
      id: crypto.randomUUID(),
      dataUrl: rawDataUrl,
      mediaType,
      name: file.name,
    };
  }

  const dataUrl = await downscale(rawDataUrl, mediaType);
  return { id: crypto.randomUUID(), dataUrl, mediaType, name: file.name };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downscale(dataUrl: string, mediaType: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const longEdge = Math.max(width, height);
      if (longEdge <= MAX_EDGE) {
        resolve(dataUrl); // already small enough
        return;
      }
      const scale = MAX_EDGE / longEdge;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const quality = mediaType === "image/jpeg" ? 0.85 : undefined;
      resolve(canvas.toDataURL(mediaType, quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Split a data URL into its base64 payload for sending to the API. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}
