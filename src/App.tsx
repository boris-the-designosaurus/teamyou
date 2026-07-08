import { useState } from "react";
import {
  emptySpec,
  type GuidePanel as GuidePanelHints,
  type ImageAttachment,
  type Message,
  type Spec,
  type WorkItem,
  type WorkItemType,
} from "./types";
import { mergeSpec, toActivityEvents } from "./merge";
import { callCoach, CoachError } from "./coachClient";
import { Modal, TYPE_LABELS, type MainTab } from "./components/Modal";
import { ChatPanel } from "./components/ChatPanel";
import { GuideRail } from "./components/GuidePanel";
import { SpecDoc } from "./components/SpecView";
import { ActivityFeed } from "./components/ActivityFeed";
import { ProcessMap } from "./components/ProcessMap";

function nowISO() {
  return new Date().toISOString();
}

function createWorkItem(type: WorkItemType): WorkItem {
  const ts = nowISO();
  return {
    id: crypto.randomUUID(),
    title: "New…",
    type,
    status: "drafting",
    currentStep: "brief",
    messages: [],
    spec: emptySpec(),
    activity: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Give the doc a real header title once the brief has substance. */
function deriveTitle(type: WorkItemType, spec: Spec): string {
  const seed = spec.brief.goal ?? spec.brief.problem;
  if (!seed) return "New…";
  const words = seed.split(/\s+/).slice(0, 6).join(" ").replace(/[.,;:]$/, "");
  return `${TYPE_LABELS[type]}: ${words}`;
}

export function App() {
  const [workItem, setWorkItem] = useState<WorkItem>(() => createWorkItem("feature_spec"));
  const [guide, setGuide] = useState<GuidePanelHints | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; raw?: string } | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>("work");
  const [workRail, setWorkRail] = useState<"guide" | "activity">("guide");
  const [specRail, setSpecRail] = useState<"screens" | "activity">("screens");

  function resetTo(type: WorkItemType) {
    setWorkItem(createWorkItem(type));
    setGuide(null);
    setError(null);
    setMainTab("work");
  }

  async function sendMessage(text: string, attachments: ImageAttachment[] = []) {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || loading) return;

    setError(null);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: nowISO(),
    };

    const withUser: WorkItem = {
      ...workItem,
      messages: [...workItem.messages, userMsg],
      updatedAt: nowISO(),
    };
    setWorkItem(withUser);
    setLoading(true);

    try {
      const turn = await callCoach({
        messages: withUser.messages,
        workItemType: withUser.type,
        activeStep: withUser.currentStep,
        spec: withUser.spec,
      });

      const coachMsg: Message = {
        id: crypto.randomUUID(),
        role: "coach",
        content: turn.reply,
        createdAt: nowISO(),
      };

      const mergedSpec = mergeSpec(withUser.spec, turn.specUpdates);
      const newActivity = toActivityEvents(turn.activityEvents, nowISO());

      setWorkItem((prev) => ({
        ...prev,
        title: prev.title === "New…" ? deriveTitle(prev.type, mergedSpec) : prev.title,
        messages: [...prev.messages, coachMsg],
        spec: mergedSpec,
        currentStep: turn.activeStep,
        activity: [...prev.activity, ...newActivity],
        updatedAt: nowISO(),
      }));
      setGuide(turn.guidePanel);
    } catch (err) {
      if (err instanceof CoachError) {
        setError({ message: err.message, raw: err.raw });
      } else {
        setError({ message: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      setLoading(false);
    }
  }

  const railTabs =
    mainTab === "work"
      ? ([
          { key: "guide", label: "Guide" },
          { key: "activity", label: "Activity" },
        ] as const)
      : ([
          { key: "screens", label: "Screens" },
          { key: "activity", label: "Activity" },
        ] as const);

  const activeRail = mainTab === "work" ? workRail : specRail;
  const setActiveRail = (k: string) =>
    mainTab === "work"
      ? setWorkRail(k as "guide" | "activity")
      : setSpecRail(k as "screens" | "activity");

  return (
    <Modal
      title={workItem.title}
      mainTab={mainTab}
      onChangeTab={setMainTab}
      workItemType={workItem.type}
      onChangeType={resetTo}
      onClose={() => resetTo(workItem.type)}
    >
      <div className="workspace">
        <div className="main-col">
          {mainTab === "work" ? (
            <ChatPanel
              messages={workItem.messages}
              loading={loading}
              error={error}
              onSend={sendMessage}
            />
          ) : (
            <SpecDoc spec={workItem.spec} type={workItem.type} />
          )}
        </div>

        <aside className="rail">
          <div className="rail-tabs">
            {railTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`rail-tab${activeRail === t.key ? " active" : ""}`}
                onClick={() => setActiveRail(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="rail-body">
            {mainTab === "work" && workRail === "guide" && (
              <GuideRail
                activeStep={workItem.currentStep}
                hints={guide}
                spec={workItem.spec}
              />
            )}
            {mainTab === "work" && workRail === "activity" && (
              <ActivityFeed activity={workItem.activity} />
            )}
            {mainTab === "spec" && specRail === "screens" && (
              <ProcessMap spec={workItem.spec} type={workItem.type} title={workItem.title} />
            )}
            {mainTab === "spec" && specRail === "activity" && (
              <ActivityFeed activity={workItem.activity} />
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
