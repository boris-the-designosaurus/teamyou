import { useEffect, useRef, useState } from "react";
import type { ImageAttachment, Message } from "../types";
import { fileToAttachment } from "../image";

export function ChatPanel(props: {
  messages: Message[];
  loading: boolean;
  error: { message: string; raw?: string } | null;
  onSend: (text: string, attachments: ImageAttachment[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [props.messages.length, props.loading]);

  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  async function addFiles(files: FileList | File[]) {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    const added = await Promise.all(imgs.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...added]);
  }

  function submit() {
    const canSend = draft.trim().length > 0 || attachments.length > 0;
    if (!canSend || props.loading) return;
    props.onSend(draft, attachments);
    setDraft("");
    setAttachments([]);
  }

  return (
    <section
      className={`chat${dragging ? " drag-over" : ""}`}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">Drop screenshots to attach</div>
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {props.messages.length === 0 && (
          <div className="chat-empty">
            <div className="mark">☕</div>
            <h2>Let's go!</h2>
            <p>What are you trying to make, and why does it matter?</p>
          </div>
        )}

        {props.messages.map((m) => (
          <div key={m.id} className={`bubble bubble-${m.role}`}>
            {m.role === "coach" && <div className="bubble-role">Coach</div>}
            {m.attachments && m.attachments.length > 0 && (
              <div className="bubble-attachments">
                {m.attachments.map((a) => (
                  <img key={a.id} src={a.dataUrl} alt={a.name ?? "screenshot"} />
                ))}
              </div>
            )}
            {m.content && <div className="bubble-content">{m.content}</div>}
          </div>
        ))}

        {props.loading && (
          <div className="bubble bubble-coach">
            <div className="bubble-role">Coach</div>
            <div className="bubble-content typing">Thinking…</div>
          </div>
        )}

        {props.error && (
          <div className="coach-error">
            <strong>Coach error:</strong> {props.error.message}
            {props.error.raw && (
              <details>
                <summary>Raw model output</summary>
                <pre>{props.error.raw}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {attachments.length > 0 && (
          <div className="attach-tray">
            {attachments.map((a) => (
              <div key={a.id} className="attach-thumb">
                <img src={a.dataUrl} alt={a.name ?? "screenshot"} />
                <button
                  type="button"
                  className="attach-remove"
                  title="Remove"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="composer">
          <textarea
            value={draft}
            placeholder="Describe it, or paste a screenshot…"
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.items)
                .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
                .map((it) => it.getAsFile())
                .filter((f): f is File => f !== null);
              if (files.length > 0) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="composer-bar">
            <button
              type="button"
              className="round-btn plus"
              title="Attach screenshot"
              onClick={() => fileInputRef.current?.click()}
            >
              +
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="spacer" />
            <button
              type="button"
              className="round-btn mic-btn"
              title="Voice input — coming soon"
              disabled
            >
              🎤
            </button>
            <button
              type="button"
              className="send-btn"
              onClick={submit}
              disabled={props.loading || (!draft.trim() && attachments.length === 0)}
              title="Send"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
