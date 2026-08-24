import type { Message } from "./types";

/** Persist the chosen answer on the Coach message that offered it. */
export function selectQuickReply(
  messages: Message[],
  messageId: string,
  value: string,
): Message[] {
  return messages.map((message) =>
    message.id === messageId && message.quickReplies?.includes(value)
      ? { ...message, selectedQuickReply: value }
      : message,
  );
}
