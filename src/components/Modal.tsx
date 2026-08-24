import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WorkItemType } from "../types";
import type { DocSummary } from "../store";
import { ChevronDownIcon } from "../icons";

export const TYPE_LABELS: Record<WorkItemType, string> = {
  feature_spec: "Feature spec",
  agent_spec: "Agent spec",
  design_project: "Design project",
  case_study: "Case study",
  presentation: "Presentation",
};

export type MainTab = "work" | "spec";

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * The editor header: a document switcher (title → dropdown of saved specs),
 * a start-new button, and the Work / Spec top tabs.
 */
export function Modal(props: {
  title: string;
  mainTab: MainTab;
  onChangeTab: (tab: MainTab) => void;
  docs: DocSummary[];
  currentId: string;
  onOpenDoc: (id: string) => void;
  onNewDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const empty = props.title === "New…" || props.title.trim() === "";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        {/* Top bar wraps the title + tabs so the Framed-minimal shadow casts
            below the whole block, not between the title and the tabs. */}
        <div className="modal-topbar">
          <header className="modal-header">
            <div className="doc-switcher" ref={menuRef}>
              <button
                type="button"
                className="doc-switcher-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className={`modal-title${empty ? " empty" : ""}`}>
                  {props.title}
                </span>
                <ChevronDownIcon className="doc-switcher-caret" aria-hidden />
              </button>

              {menuOpen && (
                <div className="doc-menu" role="menu">
                  <button
                    type="button"
                    className="doc-menu-new"
                    onClick={() => {
                      props.onNewDoc();
                      setMenuOpen(false);
                    }}
                  >
                    + New spec
                  </button>
                  {props.docs.length > 0 && <div className="doc-menu-sep" />}
                  {props.docs.map((d) => (
                    <div
                      key={d.id}
                      className={`doc-menu-item${
                        d.id === props.currentId ? " current" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="doc-menu-open"
                        onClick={() => {
                          props.onOpenDoc(d.id);
                          setMenuOpen(false);
                        }}
                      >
                        <span className="doc-menu-title">{d.title}</span>
                        <span className="doc-menu-time">
                          {timeAgo(d.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="doc-menu-del"
                        title="Delete spec"
                        aria-label="Delete spec"
                        onClick={() => props.onDeleteDoc(d.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className="icon-btn"
              type="button"
              onClick={props.onClose}
              title="Start a new spec"
            >
              ✕
            </button>
          </header>

          <nav className="tabs">
            <button
              className={`tab${props.mainTab === "work" ? " active" : ""}`}
              type="button"
              onClick={() => props.onChangeTab("work")}
            >
              Work
            </button>
            <button
              className={`tab${props.mainTab === "spec" ? " active" : ""}`}
              type="button"
              onClick={() => props.onChangeTab("spec")}
            >
              Spec
            </button>
          </nav>
        </div>

        <div className="modal-body">{props.children}</div>
      </div>
    </div>
  );
}
