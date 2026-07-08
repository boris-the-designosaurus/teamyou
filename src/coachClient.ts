import type { CoachTurnResponse, Message, SpecStep, Spec, WorkItemType } from "./types";
import { dataUrlToBase64 } from "./image";

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
  activeStep: SpecStep;
  spec: Spec;
}): Promise<CoachTurnResponse> {
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: args.messages.map((m) => ({
        role: m.role,
        content: m.content,
        images: m.attachments?.map((a) => ({
          mediaType: a.mediaType,
          data: dataUrlToBase64(a.dataUrl),
        })),
      })),
      workItemType: args.workItemType,
      activeStep: args.activeStep,
      spec: args.spec,
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
