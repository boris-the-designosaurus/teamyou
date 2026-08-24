import type {
  CoachTurnResponse,
  Message,
  FlowStep,
  Spec,
  WorkItemType,
  WorkMode,
} from "./types";
import { isSendableImageDataUrl } from "./image";

/**
 * Build the image payloads for one message, dropping anything the Coach can't
 * process (blob: URLs, SVG, unsupported types) so one bad image never breaks the
 * turn. Logs each attachment's shape so the sent payload is always inspectable.
 */
function toImagePayloads(atts: Message["attachments"]) {
  if (!atts || atts.length === 0) return undefined;
  const out: { dataUrl: string }[] = [];
  for (const a of atts) {
    const url = a.dataUrl ?? "";
    const info = {
      name: a.name,
      fileType: a.mediaType,
      bytes: a.bytes,
      previewPrefix: url.slice(0, 32),
      isBlob: url.startsWith("blob:"),
      isPng: url.startsWith("data:image/png;base64,"),
      isJpeg: url.startsWith("data:image/jpeg;base64,"),
      isWebp: url.startsWith("data:image/webp;base64,"),
      sendable: a.sendable !== false && isSendableImageDataUrl(url),
    };
    // eslint-disable-next-line no-console
    console.log("[coach] attachment →", info);
    if (info.sendable) out.push({ dataUrl: url });
    else console.warn("[coach] skipping non-sendable attachment", a.name, a.mediaType);
  }
  return out.length > 0 ? out : undefined;
}

export class CoachError extends Error {
  raw?: string;
  code?: string;
  constructor(message: string, opts?: { raw?: string; code?: string }) {
    super(message);
    this.name = "CoachError";
    this.raw = opts?.raw;
    this.code = opts?.code;
  }
}

/**
 * POST the conversation to /api/coach and return the parsed CoachTurnResponse.
 * On an error status, throws a CoachError carrying the raw model output (if any)
 * so the UI can surface prompt failures loudly in dev.
 */
export async function callCoach(args: {
  messages: Message[];
  workItemType: WorkItemType;
  workMode: WorkMode;
  activeStep: FlowStep;
  spec: Spec;
  // A code-level nudge injected into the system prompt for THIS turn only —
  // e.g. "you've asked 2 follow-ups on this step without advancing." Not
  // persisted, not part of the transcript; see the same-step-ask streak in
  // App.tsx for where this gets set.
  nudge?: string;
}): Promise<CoachTurnResponse> {
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: args.messages.map((m) => ({
        role: m.role,
        content: m.content,
        images: toImagePayloads(m.attachments),
      })),
      workItemType: args.workItemType,
      workMode: args.workMode,
      activeStep: args.activeStep,
      spec: args.spec,
      nudge: args.nudge,
    }),
  });

  const data = (await res.json()) as
    | CoachTurnResponse
    | { error: string; message?: string; raw?: string };

  if (!res.ok || "error" in data) {
    const err = data as { error: string; message?: string; raw?: string };
    throw new CoachError(err.message ?? err.error ?? `Request failed (${res.status})`, {
      raw: err.raw,
      code: err.error,
    });
  }

  return data as CoachTurnResponse;
}
