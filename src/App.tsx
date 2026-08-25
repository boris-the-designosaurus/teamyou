import { useEffect, useRef, useState } from "react";
import {
  emptySpec,
  FLOW_STEP_LABEL,
  WORK_MODES,
  type GuidePanel as GuidePanelHints,
  type ImageAttachment,
  type Message,
  type Spec,
  type WorkItem,
  type WorkItemType,
} from "./types";
import {
  chooseMilestoneArtifact,
  countPassedCategories,
  mergeSpec,
  setMilestoneArtifactStatus,
  toActivityEvents,
  updateBuildHandoff,
  updateWorkingBuild,
} from "./merge";
import { callCoach, CoachError } from "./coachClient";
import {
  loadStore,
  clearCurrentPortfolioPatterns,
  saveStore,
  docList,
  pickOpenId,
  type Store,
  type DocSummary,
  type StoredDoc,
} from "./store";
import { buildSeedDocs, LEGACY_SEED_IDS, SEED_DOC_IDS, SEED_VERSION } from "./seedDemo";
import {
  pinTodoAttachment,
  type ResolveTarget,
} from "./attachments";
import { Modal, TYPE_LABELS, type MainTab } from "./components/Modal";
import { ChatPanel } from "./components/ChatPanel";
import { GuideRail } from "./components/GuidePanel";
import { SpecDoc } from "./components/SpecView";
import { ActivityFeed } from "./components/ActivityFeed";
import { ProcessMap } from "./components/ProcessMap";
import { Today } from "./components/Today";
import { ReviewWorkspace } from "./components/ReviewWorkspace";
import { REVIEW_CATEGORIES } from "./types";
import { buildAskStreakNudge, nextAskStreak, turnWasAsk } from "./coachGate";
import { findLastCoachMessageId } from "./chatLocate";
import { appendCoachTurnMessages } from "./messageOrder";

const VALID_TYPES: WorkItemType[] = [
  "feature_spec",
  "agent_spec",
  "design_project",
  "case_study",
  "presentation",
];

const REGENERATE_PORTFOLIO_PATTERNS_KEY = "teamyou:regeneratePortfolioPatterns:2026-08-24:v2";

function nowISO() {
  return new Date().toISOString();
}

function stepStartedMsg(step: string, reopened = false): Message {
  return {
    id: crypto.randomUUID(),
    role: "system",
    content: `${FLOW_STEP_LABEL[step as keyof typeof FLOW_STEP_LABEL] ?? step} ${reopened ? "reopened" : "started"}`,
    createdAt: nowISO(),
  };
}

function createWorkItem(type: WorkItemType): WorkItem {
  const ts = nowISO();
  return {
    id: crypto.randomUUID(),
    title: "New…",
    type,
    workMode: "fast_spec",
    status: "drafting",
    currentStep: "understand_request",
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
  // Persisted store of all saved specs (source of truth for the doc list). The
  // active doc is mirrored into workItem/guide below for editing.
  const storeRef = useRef<Store>(loadStore());
  // Seed demo specs synchronously (before deriving the open doc) so the initial
  // workItem reflects seeded content and auto-save can't clobber it. Guarded by
  // SEED_VERSION, so it runs once per content change.
  if (localStorage.getItem("teamyou:seedVersion") !== String(SEED_VERSION)) {
    const s = storeRef.current;
    for (const id of [...LEGACY_SEED_IDS, ...SEED_DOC_IDS]) delete s.docs[id];
    for (const doc of buildSeedDocs()) s.docs[doc.item.id] = doc;
    saveStore(s);
    localStorage.setItem("teamyou:seedVersion", String(SEED_VERSION));
  }
  // One-time local recovery requested while validating retrieved thumbnails.
  // Remove the stale cards entirely and reopen pattern finding with a one-click
  // fresh search; all framing and criteria remain intact.
  if (localStorage.getItem(REGENERATE_PORTFOLIO_PATTERNS_KEY) !== "done") {
    const cleared = clearCurrentPortfolioPatterns(storeRef.current);
    if (cleared !== storeRef.current) {
      storeRef.current = cleared;
      saveStore(cleared);
    }
    localStorage.setItem(REGENERATE_PORTFOLIO_PATTERNS_KEY, "done");
  }
  const initial = (() => {
    const id = pickOpenId(storeRef.current);
    const doc = id ? storeRef.current.docs[id] : null;
    return doc ?? { item: createWorkItem("feature_spec"), guide: null };
  })();

  const [workItem, setWorkItem] = useState<WorkItem>(initial.item);
  const [guide, setGuide] = useState<GuidePanelHints | null>(initial.guide);
  const [docs, setDocs] = useState<DocSummary[]>(() => docList(storeRef.current));
  const [fullDocs, setFullDocs] = useState<StoredDoc[]>(() =>
    Object.values(storeRef.current.docs),
  );
  const [view, setView] = useState<"today" | "editor">("today");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; raw?: string } | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>("work");
  const [workRail, setWorkRail] = useState<"guide" | "activity">("guide");
  const [specRail, setSpecRail] = useState<"screens" | "activity">("screens");
  // Which work object the user is focused on — drives the Guide's current
  // artifact. Set from the Spec view (todo expansion / todos focus).
  const [activeTarget, setActiveTarget] = useState<ResolveTarget>({ kind: "spec" });

  // Review workspace — entered from a milestone artifact's "Run review" /
  // "Open review" action. reviewedArtifactIds is session-only (not persisted):
  // it just distinguishes "never reviewed" from "reviewed with zero findings"
  // for the Review Checks category rows.
  const [reviewArtifactId, setReviewArtifactId] = useState<string | null>(null);
  const [reviewedArtifactIds, setReviewedArtifactIds] = useState<Set<string>>(new Set());
  const [reviewRunning, setReviewRunning] = useState(false);

  // Guide "Need" → chat locate: clicking the active step's compact Need label
  // scrolls to and briefly highlights the coach message it came from, rather
  // than duplicating the question inside the Guide. A fresh object each click
  // (not just the message id) so ChatPanel's effect re-fires even on a repeat
  // click of the same Need.
  const [locateSignal, setLocateSignal] = useState<{ messageId: string } | null>(null);
  function locateCoachPrompt() {
    const messageId = findLastCoachMessageId(workItem.messages);
    if (messageId) setLocateSignal({ messageId });
  }

  // Same-step-ask streak gate — code-level enforcement of "default to no more
  // than two follow-up questions per step." Counts consecutive coach turns
  // that stayed on the same activeStep with stepGate.disposition "ask" (or,
  // if the model omitted stepGate, a non-empty guidePanel.need as a fallback
  // signal). Reset the moment the step advances or the disposition isn't
  // "ask". At >=2, the NEXT outgoing turn carries a one-turn nudge telling the
  // coach to capture-and-advance unless the next answer is genuinely blocking.
  const sameStepAskStreakRef = useRef(0);

  function refreshDocs() {
    setDocs(docList(storeRef.current));
    setFullDocs(Object.values(storeRef.current.docs));
  }

  // Auto-save the active doc whenever it changes. Skip brand-new empty drafts
  // (no messages and not already saved) so the switcher isn't cluttered — but
  // still persist edits to existing docs (e.g. pinning a seed doc's artifact).
  useEffect(() => {
    if (workItem.messages.length === 0 && !storeRef.current.docs[workItem.id])
      return;
    const s = storeRef.current;
    s.docs[workItem.id] = { item: workItem, guide };
    s.currentId = workItem.id;
    saveStore(s);
    refreshDocs();
  }, [workItem, guide]);

  function newDoc(type: WorkItemType = "feature_spec") {
    setWorkItem(createWorkItem(type));
    setGuide(null);
    setError(null);
    setMainTab("work");
    setActiveTarget({ kind: "spec" });
    setView("editor");
  }

  function openDoc(id: string) {
    const doc = storeRef.current.docs[id];
    if (!doc) return;
    storeRef.current.currentId = id;
    saveStore(storeRef.current);
    setWorkItem(doc.item);
    setGuide(doc.guide);
    setError(null);
    setMainTab("work");
    setActiveTarget({ kind: "spec" });
    setView("editor");
  }

  function deleteDoc(id: string) {
    const s = storeRef.current;
    delete s.docs[id];
    const remaining = docList(s);
    if (workItem.id === id) {
      // Deleting the open doc — jump to the newest remaining, or a fresh one.
      if (remaining[0]) {
        openDoc(remaining[0].id);
      } else {
        s.currentId = null;
        saveStore(s);
        refreshDocs();
        newDoc();
      }
    } else {
      saveStore(s);
      refreshDocs();
    }
  }

  async function sendMessage(text: string, attachments: ImageAttachment[] = []) {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || loading) return;

    setError(null);

    // Posted screenshots are conversation context by default. The Coach can
    // capture the durable observation/reference they support in specUpdates,
    // but merely attaching an image must not promote it into the decision spine.

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      attachments:
        attachments.length > 0
          ? attachments
          : undefined,
      createdAt: nowISO(),
    };

    // The Brief begins when the conversation starts — log it once, at the top.
    const startMarkers: Message[] =
      workItem.messages.length === 0 ? [stepStartedMsg("understand_request")] : [];

    const withUser: WorkItem = {
      ...workItem,
      spec: workItem.spec,
      messages: [...workItem.messages, ...startMarkers, userMsg],
      updatedAt: nowISO(),
    };
    setWorkItem(withUser);
    setLoading(true);

    const askStreakNudge = buildAskStreakNudge(sameStepAskStreakRef.current, withUser.currentStep);

    try {
      const turn = await callCoach({
        // System markers are UI-only — never send them to the Coach.
        messages: withUser.messages.filter((m) => m.role !== "system"),
        workItemType: withUser.type,
        workMode: withUser.workMode,
        activeStep: withUser.currentStep,
        spec: withUser.spec,
        nudge: askStreakNudge,
      });

      // Same-step-ask streak: advance resets it; staying put with an "ask"
      // disposition (or, lacking stepGate, a non-empty "need") increments it.
      const stayedOnStep = turn.activeStep === withUser.currentStep;
      const wasAsk = turnWasAsk(stayedOnStep, turn.stepGate, turn.guidePanel?.need);
      sameStepAskStreakRef.current = nextAskStreak(sameStepAskStreakRef.current, wasAsk);

      const mergedSpec = mergeSpec(withUser.spec, turn.specUpdates);
      // Milestone artifacts this turn introduced — the coach message links to
      // them so the "Choose" card grid renders in the right place in history.
      const priorArtifactIds = new Set(withUser.spec.milestoneArtifacts.map((a) => a.id));
      const newMilestoneArtifactIds = mergedSpec.milestoneArtifacts
        .filter((a) => !priorArtifactIds.has(a.id))
        .map((a) => a.id);

      const coachMsg: Message = {
        id: crypto.randomUUID(),
        role: "coach",
        content: turn.reply,
        quickReplies: turn.quickReplies && turn.quickReplies.length > 0 ? turn.quickReplies : undefined,
        recommendedQuickReply: turn.recommendedQuickReply,
        milestoneArtifactIds:
          newMilestoneArtifactIds.length > 0 ? newMilestoneArtifactIds : undefined,
        evidenceBrief: turn.specUpdates.evidenceBrief,
        evidenceSnapshot: turn.specUpdates.evidenceBrief
          ? mergedSpec.evidence.filter((item) => item.step === "assess_evidence")
          : undefined,
        evidenceOpenItems: turn.specUpdates.evidenceBrief
          ? mergedSpec.openQuestions
              .filter(
                (item) =>
                  item.step === "assess_evidence" && item.status === "open",
              )
              .map((item) => item.text)
          : undefined,
        createdAt: nowISO(),
      };

      const newActivity = toActivityEvents(turn.activityEvents, nowISO());
      // Auto-detected type from the Coach (Rule 1 style: the model's read wins,
      // but only if it's a valid value).
      const detected =
        turn.workItemType && VALID_TYPES.includes(turn.workItemType)
          ? turn.workItemType
          : undefined;
      const detectedMode =
        turn.workMode && WORK_MODES.includes(turn.workMode)
          ? turn.workMode
          : undefined;

      // When the Coach advances or a user revision reopens an earlier step,
      // introduce that context before the Coach reply that belongs to it.
      const advanceMarker: Message | null =
        turn.activeStep !== withUser.currentStep
          ? stepStartedMsg(turn.activeStep, !!turn.flowRevision)
          : null;

      setWorkItem((prev) => {
        const type = detected ?? prev.type;
        return {
          ...prev,
          type,
          workMode: detectedMode ?? prev.workMode,
          title: deriveTitle(type, mergedSpec),
          messages: appendCoachTurnMessages(
            prev.messages,
            coachMsg,
            advanceMarker,
          ),
          spec: mergedSpec,
          currentStep: turn.activeStep,
          activity: [...prev.activity, ...newActivity],
          updatedAt: nowISO(),
        };
      });
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

  function updateSpec(updater: (spec: Spec) => Spec) {
    setWorkItem((prev) => ({ ...prev, spec: updater(prev.spec), updatedAt: nowISO() }));
  }

  /** A narrowly-scoped Coach call that does NOT touch the main chat transcript
   * — used by the Review workspace ("Run review" / "Ask AI in a thread"). */
  async function callCoachScoped(prompt: string): Promise<import("./types").CoachTurnResponse> {
    return callCoach({
      messages: [{ id: crypto.randomUUID(), role: "user", content: prompt, createdAt: nowISO() }],
      workItemType: workItem.type,
      workMode: workItem.workMode,
      activeStep: workItem.currentStep,
      spec: workItem.spec,
    });
  }

  async function runArtifactReview(artifactId: string) {
    const artifact = workItem.spec.milestoneArtifacts.find((a) => a.id === artifactId);
    if (!artifact || reviewRunning) return;
    setReviewRunning(true);
    setError(null);
    try {
      const acceptanceCriteriaNote =
        artifact.kind === "working_build" && workItem.spec.rules.acceptanceCriteria.length > 0
          ? ` For each locked acceptance criterion this build's behavior confirms or fails, also return specUpdates.acceptanceCriteriaStatusUpdates (real criterion id, status "met" or "failed").`
          : "";
      const turn = await callCoachScoped(
        `Run a review of the artifact "${artifact.title}" (artifactId "${artifact.id}") against the locked problem, scope, acceptance criteria, and design-system expectations. Return findings in specUpdates.reviewFindings scoped to that artifactId, each with category, severity, finding, evidence, impact, expectedCorrection, and relatedCriterion.${acceptanceCriteriaNote} This is a review action, not a framing turn — leave activeStep as "${workItem.currentStep}" and do not ask a framing question.`,
      );
      updateSpec((sp) => {
        let next = mergeSpec(sp, turn.specUpdates);
        // Keep the Working Build's review stats honest — computed from the
        // actual findings rather than trusted from the model, so "N passed"
        // never goes stale relative to what Review Checks itself shows.
        if (artifact.kind === "working_build") {
          const findings = next.reviewFindings.filter((f) => f.artifactId === artifactId);
          const passed = countPassedCategories(findings, REVIEW_CATEGORIES);
          next = updateWorkingBuild(next, {
            reviewsStarted: REVIEW_CATEGORIES.length,
            reviewsPassed: passed,
            status: passed === REVIEW_CATEGORIES.length ? "ready" : "in_review",
          });
        }
        return next;
      });
      setReviewedArtifactIds((prev) => new Set(prev).add(artifactId));
    } catch (err) {
      if (err instanceof CoachError) setError({ message: err.message, raw: err.raw });
      else setError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setReviewRunning(false);
    }
  }

  async function askAboutArtifact(question: string, artifactTitle: string): Promise<string> {
    try {
      const turn = await callCoachScoped(
        `This is a narrow side question about the artifact "${artifactTitle}" asked from the Review workspace — NOT a framing turn, and not part of the guided flow. Answer it concisely in the "reply" field only. Set specUpdates to {} and activityEvents/quickReplies to [] unless the answer reveals a genuinely new decision worth capturing. Do not ask a follow-up question back. Keep activeStep exactly as given — do not change it. Question: ${question}`,
      );
      return turn.reply;
    } catch (err) {
      const message = err instanceof CoachError ? err.message : err instanceof Error ? err.message : String(err);
      return `Sorry — I couldn't get an answer just now (${message}). Try rephrasing, or ask again.`;
    }
  }

  function saveBuildHandoff(handoffId: string, patch: Partial<import("./types").BuildHandoff>) {
    updateSpec((sp) => updateBuildHandoff(sp, handoffId, patch));
  }

  /** Sending a handoff advances it into a Working Build state — creating the
   * WorkingBuild record and a reviewable milestone artifact if this is the
   * first handoff sent, so build review reuses the same Review workspace as
   * design review (CURRENT_UPDATE_SPEC.md §4C, §I). */
  function sendBuildHandoff(handoffId: string) {
    updateSpec((sp) => {
      const handoff = sp.buildHandoffs.find((h) => h.id === handoffId);
      if (!handoff) return sp;
      let next = updateBuildHandoff(sp, handoffId, { status: "sent" });
      next = updateWorkingBuild(next, {});
      const hasWorkingArtifact = next.milestoneArtifacts.some((a) => a.kind === "working_build");
      if (!hasWorkingArtifact) {
        next = {
          ...next,
          milestoneArtifacts: [
            ...next.milestoneArtifacts,
            {
              id: crypto.randomUUID(),
              kind: "working_build",
              title: handoff.title,
              status: "working_build",
              step: "build_in_tool",
              createdAt: nowISO(),
            },
          ],
        };
      }
      return next;
    });
  }

  function attachBuildUrl(url: string) {
    updateSpec((sp) => updateWorkingBuild(sp, { buildUrl: url }));
  }

  /** "Mark verified" is a deliberate user action, computed deterministically
   * from real findings/criteria — never something the Coach flips on its own
   * (COACH_BEHAVIOR_SPEC.md explicitly lists "marking work verified because
   * no comments remain" as a failure mode). Refuses while a blocker is open
   * (ACCEPTANCE_TESTS.md §J). */
  function markVerified() {
    const buildArtifact = workItem.spec.milestoneArtifacts.find((a) => a.kind === "working_build");
    if (!buildArtifact) return;
    updateSpec((sp) => {
      const findings = sp.reviewFindings.filter((f) => f.artifactId === buildArtifact.id);
      const criticalIssues = findings.filter(
        (f) => f.status === "open" && f.severity === "blocker",
      ).length;
      if (criticalIssues > 0) return sp;
      const reviewsPassed = countPassedCategories(findings, REVIEW_CATEGORIES);
      const requirementsTotal = sp.rules.acceptanceCriteria.length;
      const requirementsVerified = sp.rules.acceptanceCriteria.filter(
        (c) => c.status === "met",
      ).length;
      const verification: NonNullable<Spec["verification"]> = {
        buildId: buildArtifact.id,
        reviewsPassed,
        reviewsTotal: REVIEW_CATEGORIES.length,
        requirementsVerified,
        requirementsTotal,
        criticalIssues,
        findings,
        status: "verified",
      };
      return setMilestoneArtifactStatus(
        { ...sp, verification },
        buildArtifact.id,
        "verified",
      );
    });
  }

  const activeRail = mainTab === "work" ? workRail : specRail;
  const setActiveRail = (k: string) =>
    mainTab === "work"
      ? setWorkRail(k as "guide" | "activity")
      : setSpecRail(k as "screens" | "activity");

  if (view === "today") {
    return (
      <Today
        specs={fullDocs}
        onOpen={openDoc}
        onNew={() => newDoc()}
      />
    );
  }

  const reviewArtifact = reviewArtifactId
    ? workItem.spec.milestoneArtifacts.find((a) => a.id === reviewArtifactId)
    : undefined;
  if (reviewArtifact) {
    return (
      <ReviewWorkspace
        artifact={reviewArtifact}
        spec={workItem.spec}
        reviewCategories={REVIEW_CATEGORIES}
        onClose={() => setReviewArtifactId(null)}
        onUpdateSpec={updateSpec}
        onRunReview={() => void runArtifactReview(reviewArtifact.id)}
        onApproveForBuild={() =>
          updateSpec((sp) => setMilestoneArtifactStatus(sp, reviewArtifact.id, "approved_for_build"))
        }
        onAskAI={(q) => askAboutArtifact(q, reviewArtifact.title)}
        reviewRunning={reviewRunning}
        reviewHasRun={reviewedArtifactIds.has(reviewArtifact.id)}
      />
    );
  }

  return (
    <Modal
      title={workItem.title}
      mainTab={mainTab}
      onChangeTab={setMainTab}
      docs={docs}
      currentId={workItem.id}
      onOpenDoc={openDoc}
      onNewDoc={() => newDoc()}
      onDeleteDoc={deleteDoc}
      onClose={() => setView("today")}
    >
      <div className="workspace">
        <div className="main-col">
          {mainTab === "work" ? (
            <ChatPanel
              messages={workItem.messages}
              loading={loading}
              error={error}
              onSend={sendMessage}
              highlightSignal={locateSignal}
              milestoneArtifacts={workItem.spec.milestoneArtifacts}
              onChooseArtifact={(artifactId) =>
                setWorkItem((prev) => ({
                  ...prev,
                  spec: chooseMilestoneArtifact(prev.spec, artifactId),
                  updatedAt: nowISO(),
                }))
              }
            />
          ) : (
            <SpecDoc
              spec={workItem.spec}
              type={workItem.type}
              onFocusTarget={setActiveTarget}
              onPinTodoAttachment={(todoId, attId) =>
                setWorkItem((prev) => ({
                  ...prev,
                  spec: pinTodoAttachment(prev.spec, todoId, attId),
                  updatedAt: nowISO(),
                }))
              }
            />
          )}
        </div>

        <aside className="rail">
          <div className="rail-tabs">
            {mainTab === "work" ? (
              <button
                type="button"
                className={`tab${workRail === "guide" ? " active" : ""}`}
                onClick={() => setWorkRail("guide")}
              >
                Guide
              </button>
            ) : (
              <button
                type="button"
                className={`tab${specRail === "screens" ? " active" : ""}`}
                onClick={() => setSpecRail("screens")}
              >
                Screens
              </button>
            )}
            <button
              type="button"
              className={`tab${activeRail === "activity" ? " active" : ""}`}
              onClick={() => setActiveRail("activity")}
            >
              Activity
            </button>
          </div>
          <div className="rail-body">
            {mainTab === "work" && workRail === "guide" && (
              <GuideRail
                activeStep={workItem.currentStep}
                hints={guide}
                spec={workItem.spec}
                activeTarget={activeTarget}
                onOpenReview={setReviewArtifactId}
                onSaveHandoff={saveBuildHandoff}
                onSendHandoff={sendBuildHandoff}
                onAttachBuildUrl={attachBuildUrl}
                onMarkVerified={markVerified}
                onLocateCoachPrompt={locateCoachPrompt}
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
