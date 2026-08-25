import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ImageAttachment, Message, MilestoneArtifact } from "../types";
import { fileToAttachment } from "../image";
import coffeeCup from "../../images/coffeecup.svg";
import { DirectionCards } from "./DirectionCards";
import { EvidenceBriefCard } from "./EvidenceBriefCard";
import {
  ComposerAttachIcon,
  ComposerMicIcon,
  SendIcon,
  RocketIcon,
} from "../icons";

/** Inline emphasis stays deliberately small: the Coach may bold one strategic
 * phrase, not style the whole response. */
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** Preserve the quiet conversational layout while rendering intentional
 * paragraph breaks and short markdown-style bullet lists semantically. */
function renderContent(text: string) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`}>
        {paragraph.map((line, index) => (
          <span key={index}>
            {index > 0 && <br />}
            {renderInline(line)}
          </span>
        ))}
      </p>,
    );
    paragraph = [];
  }

  function flushBullets() {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {bullets.map((bullet, index) => (
          <li key={index}>{renderInline(bullet)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  }

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
    } else {
      flushBullets();
      if (line.trim()) paragraph.push(line);
      else flushParagraph();
    }
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

export function ChatPanel(props: {
  messages: Message[];
  loading: boolean;
  error: { message: string; raw?: string } | null;
  onSend: (text: string, attachments: ImageAttachment[]) => void;
  milestoneArtifacts?: MilestoneArtifact[];
  onChooseArtifact?: (artifactId: string) => void;
  // Guide "Need" → chat locate (product boundary: the coach's question lives
  // ONLY here, never duplicated in the Guide). A new object on every click —
  // even a repeat click of the same Need — re-triggers the scroll/highlight.
  highlightSignal?: { messageId: string } | null;
}) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [composerH, setComposerH] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastComposerTop = useRef<number | null>(null);
  const wasEmpty = useRef(props.messages.length === 0);
  const highlightTimer = useRef<number | null>(null);
  const latestMessage = props.messages[props.messages.length - 1];
  const hasVisibleQuickReplies =
    latestMessage?.role === "coach" &&
    !!latestMessage.quickReplies &&
    latestMessage.quickReplies.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [props.messages.length, props.loading]);

  useEffect(() => {
    if (!props.highlightSignal) return;
    const { messageId } = props.highlightSignal;
    setHighlightedId(messageId);
    document
      .getElementById(`chat-msg-${messageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightedId(null), 1800);
    return () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, [props.highlightSignal]);

  // Snapshot the composer's current height so the content can pad itself and
  // never hide behind it.
  function measureComposer() {
    const el = composerRef.current;
    if (el) setComposerH(el.getBoundingClientRect().height);
  }

  // The composer overlays the bottom of the scroll area; track its height. The
  // ResizeObserver fires on text growth AND once attached images have laid out;
  // image onLoad (below) is an explicit belt-and-suspenders for pasted shots.
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setComposerH(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grow the textarea to fit its content (capped by CSS max-height → scroll).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // On the first message, the composer moves from just-below-the-intro to the
  // bottom. FLIP it so it gracefully falls and settles instead of jumping.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const isEmpty = props.messages.length === 0;
    const top = el.getBoundingClientRect().top;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (
      wasEmpty.current &&
      !isEmpty &&
      lastComposerTop.current != null &&
      !reduce
    ) {
      const delta = lastComposerTop.current - top; // was higher up → negative
      if (Math.abs(delta) > 1) {
        el.style.transition = "none";
        el.style.transform = `translateY(${delta}px)`;
        void el.offsetHeight; // commit the start position
        requestAnimationFrame(() => {
          el.style.transition = "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "translateY(0)";
        });
      }
    }

    lastComposerTop.current = top;
    wasEmpty.current = isEmpty;
  }, [props.messages.length]);

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
      className={`chat${dragging ? " drag-over" : ""}${
        props.messages.length === 0 ? " chat--empty" : ""
      }`}
      style={{ "--composer-h": `${Math.round(composerH)}px` } as React.CSSProperties}
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
        <div className="chat-inner">
        {props.messages.length === 0 && (
          <div className="chat-empty">
            <img className="mark" src={coffeeCup} alt="" />
            <h2>Let's go!</h2>
            <p>What are you trying to make, and why does it matter?</p>
          </div>
        )}

        {props.messages.map((m, idx) =>
          m.role === "system" ? (
            <div key={m.id} className="log-note">
              <RocketIcon className="log-note-ic" aria-hidden />
              <span>{m.content}</span>
            </div>
          ) : (
            <div
              key={m.id}
              id={`chat-msg-${m.id}`}
              className={`bubble bubble-${m.role}${highlightedId === m.id ? " highlighted" : ""}`}
            >
              {m.role === "coach" && <div className="bubble-role">Coach</div>}
              {m.attachments && m.attachments.length > 0 && (
                <div className="bubble-attachments">
                  {m.attachments.map((a) => (
                    <figure key={a.id} className="bubble-attachment">
                      {a.dataUrl ? (
                        <img src={a.dataUrl} alt={a.name ?? "screenshot"} />
                      ) : (
                        <div className="bubble-attachment-missing">
                          {a.name ?? "Screenshot"}
                        </div>
                      )}
                      {a.linkedTo && (
                        <figcaption className="bubble-attachment-link">
                          Attached to {a.linkedTo}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}
              {m.role === "coach" && m.evidenceBrief && (
                <EvidenceBriefCard
                  brief={m.evidenceBrief}
                  evidence={m.evidenceSnapshot}
                  openItems={m.evidenceOpenItems}
                />
              )}
              {m.content && (
                <div className="bubble-content">{renderContent(m.content)}</div>
              )}
              {m.role === "coach" &&
                m.milestoneArtifactIds &&
                m.milestoneArtifactIds.length > 0 &&
                props.milestoneArtifacts &&
                props.onChooseArtifact && (
                  <DirectionCards
                    artifacts={props.milestoneArtifacts.filter((a) =>
                      m.milestoneArtifactIds!.includes(a.id),
                    )}
                    onChoose={props.onChooseArtifact}
                    onContinue={(selected) =>
                      props.onSend(
                        `Generate wireframes for: ${selected.map((a) => a.title).join(", ")}`,
                        [],
                      )
                    }
                  />
                )}
              {m.role === "coach" &&
                idx === props.messages.length - 1 &&
                m.quickReplies &&
                m.quickReplies.length > 0 && (
                  <div className="quick-replies">
                    {m.quickReplies.map((qr) => (
                      <button
                        key={qr}
                        type="button"
                        className={`quick-reply-btn${m.recommendedQuickReply === qr ? " recommended" : ""}`}
                        disabled={props.loading}
                        onClick={() => props.onSend(qr, [])}
                        aria-label={m.recommendedQuickReply === qr ? `${qr}, recommended` : qr}
                      >
                        <span>{qr}</span>
                        {m.recommendedQuickReply === qr && (
                          <span className="quick-reply-recommended">Recommended</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          ),
        )}

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
      </div>

      <div className="composer-wrap" ref={composerRef}>
        <div className="composer">
          {attachments.some((a) => a.sendable === false) && (
            <div className="attach-warning">
              SVG / unsupported images are saved to the spec but can't be sent to
              the Coach.
            </div>
          )}
          {attachments.length > 0 && (
            <div className="attach-tray">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className={`attach-thumb${
                    a.sendable === false ? " unsupported" : ""
                  }`}
                >
                  <img
                    src={a.dataUrl}
                    alt={a.name ?? "screenshot"}
                    onLoad={measureComposer}
                  />
                  <button
                    type="button"
                    className="attach-remove"
                    title="Remove"
                    onClick={() =>
                      setAttachments((prev) =>
                        prev.filter((x) => x.id !== a.id),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            placeholder={
              hasVisibleQuickReplies
                ? "Choose an option above, or type your own response…"
                : "Describe it, or paste a screenshot…"
            }
            rows={1}
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
              <ComposerAttachIcon />
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
              <ComposerMicIcon />
            </button>
            <button
              type="button"
              className="send-btn"
              onClick={submit}
              disabled={props.loading || (!draft.trim() && attachments.length === 0)}
              title="Send"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
