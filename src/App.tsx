import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent
} from "react";
import { MoreHorizontal } from "lucide-react";

import { AppChrome } from "./components/AppChrome";
import {
  Composer,
  type PromptComposerFooterOption
} from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { NewSessionPage } from "./components/NewSessionPage";
import { PluginsPage } from "./components/PluginsPage";
import { ReviewPanel } from "./components/ReviewPanel";
import { SearchModal } from "./components/SearchModal";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { ThreadTabs, type ThreadTabItem } from "./components/ThreadTabs";
import {
  conversationItems,
  diffRows,
  projects as mockProjects,
  reviewFilePath
} from "./data/mock-data";
import { cn } from "./lib/cn";
import type {
  AgentModel,
  ApprovalDecision,
  ApprovalRequest,
  ComposerImageAttachment,
  FilePreview,
  IntelligenceMode,
  LiveAgentEvent,
  NavKey,
  PermissionMode,
  Project,
  ProjectThread,
  SessionContent,
  SessionProvider,
  SessionSnapshot,
  ThreadViewMode
} from "./types";

type AgentServerInfo = {
  httpUrl: string;
  wsUrl: string;
  cwd?: string;
  workspaceName?: string;
};

const workspaceStorageKey = "composer.workspaces";
const selectedWorkspaceStorageKey = "composer.selectedWorkspace";
const threadViewModeStorageKey = "composer.threadViewMode";
const reviewContentWidthStorageKey = "composer.reviewContentWidth";
const minReviewContentWidth = 300;
const maxReviewContentWidth = 720;

const defaultModelsByProvider: Record<SessionProvider, AgentModel> = {
  codex: "gpt-5.4",
  claude: "claude-sonnet-4-6",
  meta: "meta-claude-opus-codex-mini"
};

const defaultIntelligenceByProvider: Record<SessionProvider, IntelligenceMode> = {
  codex: "Medium",
  claude: "High",
  meta: "High"
};

const initialSnapshot = createInitialSnapshot();

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadViewMode, setThreadViewMode] = useState<ThreadViewMode>(
    () => readThreadViewMode()
  );
  const [reviewContentWidth, setReviewContentWidth] = useState(
    () => readReviewContentWidth()
  );
  const [inspectorResizing, setInspectorResizing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNav, setActiveNav] = useState<NavKey>("New session");
  const [selectedThread, setSelectedThread] = useState("");
  const [projects, setProjects] = useState<Project[]>(initialSnapshot.projects);
  const [sessions, setSessions] = useState<Record<string, SessionContent>>(
    initialSnapshot.sessions
  );
  const [agentServer, setAgentServer] = useState<AgentServerInfo | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [prompt, setPrompt] = useState("");
  const [permission, setPermission] =
    useState<PermissionMode>("Full access");
  const [provider, setProviderState] = useState<SessionProvider>("codex");
  const [modelByProvider, setModelByProvider] = useState<
    Record<SessionProvider, AgentModel>
  >(defaultModelsByProvider);
  const [intelligenceByProvider, setIntelligenceByProvider] = useState<
    Record<SessionProvider, IntelligenceMode>
  >(defaultIntelligenceByProvider);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [imageAttachments, setImageAttachments] = useState<
    ComposerImageAttachment[]
  >([]);
  const [workspaceOptions, setWorkspaceOptions] = useState<
    PromptComposerFooterOption[]
  >(() => loadWorkspaceOptions());
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    () => readStorage(selectedWorkspaceStorageKey) ?? ""
  );
  const [pendingNewRequestId, setPendingNewRequestId] = useState<string | null>(
    null
  );
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null);
  const [filePreviewLoading, setFilePreviewLoading] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const expectingNewSessionRef = useRef(false);

  const activeSession = selectedThread ? sessions[selectedThread] : undefined;
  const activeProvider = provider;
  const activeModel = modelByProvider[activeProvider];
  const activeIntelligence = intelligenceByProvider[activeProvider];

  const allWorkspaceOptions = useMemo(
    () =>
      mergeWorkspaceOptions([
        agentServer?.cwd
          ? {
              id: agentServer.cwd,
              label: agentServer.workspaceName ?? basename(agentServer.cwd),
              cwd: agentServer.cwd,
              detail: agentServer.cwd
            }
          : undefined,
        ...workspaceOptions,
        ...workspaceOptionsFromSessions(sessions)
      ]),
    [agentServer, sessions, workspaceOptions]
  );
  const selectedWorkspace =
    allWorkspaceOptions.find((option) => option.id === selectedWorkspaceId) ??
    allWorkspaceOptions[0];
  const currentCwd = activeSession?.cwd ?? selectedWorkspace?.cwd;
  const workspaceName =
    selectedWorkspace?.label ??
    agentServer?.workspaceName ??
    (currentCwd ? basename(currentCwd) : "Workspace");
  const threadTabs = useMemo(
    () =>
      createThreadTabs({
        projects,
        selectedThread,
        selectedWorkspaceId: selectedWorkspace?.id,
        selectedWorkspaceCwd: selectedWorkspace?.cwd,
        selectedWorkspaceName: selectedWorkspace?.label
      }),
    [
      projects,
      selectedThread,
      selectedWorkspace?.cwd,
      selectedWorkspace?.id,
      selectedWorkspace?.label
    ]
  );
  const activePendingItems =
    activeSession?.pendingItems ??
    (pendingNewRequestId
      ? [
          {
            id: `${pendingNewRequestId}-pending`,
            type: "running_tool" as const,
            label: `Starting ${providerLabel(provider)}`,
            status: "running" as const
          }
        ]
      : []);
  const activeSessionRunning =
    Boolean(activeSession?.pendingItems.length) ||
    activeSession?.runtimeStatus === "running" ||
    activeSession?.runtimeStatus === "awaiting_approval";
  const submitMode: "send" | "stop" =
    activeSessionRunning || pendingNewRequestId ? "stop" : "send";
  const contentMode = activeNav === "Plugins" ? "plugins" : "session";
  const shouldShowConversation = contentMode === "session" && Boolean(activeSession);
  const showThreadTabs = shouldShowConversation && threadViewMode === "tabs";

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    writeStorage(workspaceStorageKey, JSON.stringify(workspaceOptions));
  }, [workspaceOptions]);

  useEffect(() => {
    writeStorage(threadViewModeStorageKey, threadViewMode);
  }, [threadViewMode]);

  useEffect(() => {
    writeStorage(reviewContentWidthStorageKey, String(reviewContentWidth));
  }, [reviewContentWidth]);

  useEffect(() => {
    if (selectedWorkspace?.id) {
      writeStorage(selectedWorkspaceStorageKey, selectedWorkspace.id);
    }
  }, [selectedWorkspace?.id]);

  useEffect(() => {
    if (!selectedWorkspaceId && allWorkspaceOptions[0]) {
      setSelectedWorkspaceId(allWorkspaceOptions[0].id);
    }
  }, [allWorkspaceOptions, selectedWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAgentServer() {
      try {
        const server = await window.composer?.getAgentServer?.();

        if (!cancelled && server) {
          setAgentServer(server);
        }
      } catch (error) {
        console.warn("Could not load Composer agent server", error);
      }
    }

    void loadAgentServer();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (agentServer?.wsUrl || !window.composer?.listLocalSessions) {
      return;
    }

    let cancelled = false;

    async function loadLocalSessions() {
      try {
        const snapshot = await window.composer?.listLocalSessions?.();

        if (!cancelled && snapshot) {
          setProjects(snapshot.projects);
          setSessions(snapshot.sessions);
        }
      } catch (error) {
        console.warn("Could not load local sessions", error);
      }
    }

    void loadLocalSessions();

    return () => {
      cancelled = true;
    };
  }, [agentServer?.wsUrl]);

  const applyAgentEvent = useCallback(
    (event: LiveAgentEvent) => {
      if (event.type === "sessions.snapshot") {
        setProjects(event.snapshot.projects);
        setSessions(event.snapshot.sessions);
        return;
      }

      if (event.type === "session.started") {
        setSessions((current) => ({
          ...current,
          [event.session.id]: normalizeSession(event.session)
        }));
        setProjects((current) => upsertSessionProject(current, event.session));

        if (expectingNewSessionRef.current) {
          expectingNewSessionRef.current = false;
          setPendingNewRequestId(null);
          setSelectedThread(event.session.id);
          setActiveNav("New session");
        }
        return;
      }

      if (event.type === "session.updated") {
        setSessions((current) => ({
          ...current,
          [event.session.id]: normalizeSession(event.session)
        }));
        setProjects((current) => upsertSessionProject(current, event.session));
        return;
      }

      if (event.type === "approval.requested") {
        setApprovals((current) =>
          current.some((approval) => approval.id === event.approval.id)
            ? current
            : [...current, event.approval]
        );
        return;
      }

      if (event.type === "approval.resolved") {
        setApprovals((current) =>
          current.filter((approval) => approval.id !== event.approvalId)
        );
        return;
      }

      if (event.type === "turn.completed" && selectedThread === event.sessionId) {
        setPendingNewRequestId(null);
      }
    },
    [selectedThread]
  );

  useEffect(() => {
    if (!agentServer?.wsUrl) {
      return undefined;
    }

    const socket = new WebSocket(agentServer.wsUrl);
    socketRef.current = socket;

    socket.onmessage = (message) => {
      try {
        applyAgentEvent(JSON.parse(String(message.data)) as LiveAgentEvent);
      } catch (error) {
        console.warn("Ignoring malformed agent event", error);
      }
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [agentServer?.wsUrl, applyAgentEvent]);

  function setProvider(nextProvider: SessionProvider) {
    setProviderState(nextProvider);
    setPermissionOpen(false);
    setIntelligenceOpen(false);
    setModelByProvider((current) => ({
      ...current,
      [nextProvider]: current[nextProvider] ?? defaultModelsByProvider[nextProvider]
    }));
    setIntelligenceByProvider((current) => ({
      ...current,
      [nextProvider]:
        current[nextProvider] ?? defaultIntelligenceByProvider[nextProvider]
    }));
  }

  function selectThread(threadId: string) {
    const session = sessions[threadId];

    setSelectedThread(threadId);
    setActiveNav("New session");

    if (!session) {
      return;
    }

    const nextProvider = composerProviderForSession(session, provider);
    setProvider(nextProvider);

    if (session.cwd) {
      setSelectedWorkspaceId(session.cwd);
    }
  }

  function setClampedReviewContentWidth(value: number) {
    setReviewContentWidth(clampReviewContentWidth(value));
  }

  function startInspectorResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setInspectorResizing(true);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      setClampedReviewContentWidth(window.innerWidth - moveEvent.clientX);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setInspectorResizing(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function resizeInspectorWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    setClampedReviewContentWidth(
      reviewContentWidth + (event.key === "ArrowLeft" ? 24 : -24)
    );
  }

  async function submitPrompt() {
    const body = prompt.trim();

    if (!body || submitMode === "stop") {
      return;
    }

    const requestId = createId();
    const sessionId = activeSession?.id;
    const requestProvider = activeProvider;

    if (!agentServer?.httpUrl) {
      createOfflineSession(body, requestProvider);
      return;
    }

    if (!sessionId) {
      expectingNewSessionRef.current = true;
      setPendingNewRequestId(requestId);
    }

    setPrompt("");
    setImageAttachments([]);

    try {
      const response = await fetch(`${agentServer.httpUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          sessionId,
          provider: requestProvider,
          prompt: body,
          cwd: currentCwd,
          permissionMode: permission,
          intelligence: activeIntelligence,
          model: activeModel,
          imageAttachments: imageAttachments.map((attachment) => ({
            name: attachment.name,
            mediaType: attachment.mediaType,
            dataUrl: attachment.dataUrl,
            path: attachment.path
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`Agent request failed with ${response.status}`);
      }

      await drainResponse(response);
    } catch (error) {
      if (!sessionId) {
        expectingNewSessionRef.current = false;
        setPendingNewRequestId(null);
      }

      const message = error instanceof Error ? error.message : String(error);
      setSessions((current) =>
        appendErrorMessage(current, sessionId, body, requestProvider, message)
      );
    }
  }

  async function stopActiveRun() {
    if (!agentServer?.httpUrl) {
      setPendingNewRequestId(null);
      return;
    }

    const body = activeSession
      ? { sessionId: activeSession.id }
      : pendingNewRequestId
        ? { requestId: pendingNewRequestId }
        : null;

    if (!body) {
      return;
    }

    try {
      await fetch(`${agentServer.httpUrl}/api/interrupt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      console.warn("Could not stop active run", error);
    }
  }

  async function updateThreadVisibility(
    sessionId: string,
    action: "archive" | "delete"
  ) {
    const session = sessions[sessionId];

    if (!session) {
      return;
    }

    if (
      action === "delete" &&
      !window.confirm(`Delete "${session.title}"? This removes the local session file when available.`)
    ) {
      return;
    }

    try {
      const snapshot = agentServer?.httpUrl
        ? await updateThreadVisibilityViaServer(agentServer.httpUrl, sessionId, action)
        : await window.composer?.updateSessionVisibility?.({ sessionId, action });

      if (snapshot) {
        setProjects(snapshot.projects);
        setSessions(snapshot.sessions);
      } else {
        setProjects((current) => removeThreadFromProjects(current, sessionId));
        setSessions((current) => {
          const next = { ...current };
          delete next[sessionId];
          return next;
        });
      }

      if (selectedThread === sessionId) {
        setSelectedThread("");
        setActiveNav("New session");
      }
    } catch (error) {
      console.warn(`Could not ${action} session`, error);
    }
  }

  function resolveApproval(approvalId: string, decision: ApprovalDecision) {
    socketRef.current?.send(
      JSON.stringify({
        type: "approval.resolve",
        approvalId,
        decision
      })
    );
    setApprovals((current) =>
      current.filter((approval) => approval.id !== approvalId)
    );
  }

  function createOfflineSession(body: string, requestProvider: SessionProvider) {
    const id = `${requestProvider}-offline-${createId()}`;
    const session: SessionContent = {
      id,
      provider: requestProvider,
      providerSessions: {},
      contextVersion: 0,
      lastProvider: requestProvider,
      runtimeStatus: "idle",
      title: titleFromPrompt(body),
      cwd: currentCwd,
      model: modelByProvider[requestProvider],
      updatedAt: new Date().toISOString(),
      items: [
        {
          id: `${id}-user-0`,
          type: "user_message",
          body,
          timestamp: formatTime(new Date())
        },
        {
          id: `${id}-assistant-0`,
          type: "assistant_message",
          body:
            "The Composer agent server is not connected, so this local preview cannot execute the request."
        }
      ],
      pendingItems: []
    };

    setSessions((current) => ({ ...current, [id]: session }));
    setProjects((current) => upsertSessionProject(current, session));
    setSelectedThread(id);
    setPrompt("");
  }

  async function addImageAttachments(files: File[]) {
    const attachments = await Promise.all(files.map(fileToAttachment));
    setImageAttachments((current) => [...current, ...attachments]);
  }

  function removeImageAttachment(id: string) {
    setImageAttachments((current) =>
      current.filter((attachment) => attachment.id !== id)
    );
  }

  async function createWorkspace(query: string) {
    const response = await window.composer?.createProject?.({
      name: query,
      baseCwd: selectedWorkspace?.cwd ?? currentCwd
    });
    const option = response
      ? {
          id: response.cwd,
          label: response.workspaceName,
          cwd: response.cwd,
          detail: response.cwd
        }
      : {
          id: `workspace-${createId()}`,
          label: query.trim() || "New project",
          detail: "Pending local folder"
        };

    setWorkspaceOptions((current) => mergeWorkspaceOptions([...current, option]));
    setSelectedWorkspaceId(option.id);
    setSelectedThread("");
    setActiveNav("New session");
  }

  async function openFile(filePath: string) {
    setInspectorOpen(true);
    setFilePreview(null);
    setFilePreviewError(null);
    setFilePreviewLoading(true);

    try {
      if (!window.composer?.readTextFile) {
        throw new Error("File preview is available in the desktop app.");
      }

      setFilePreview(await window.composer.readTextFile(filePath));
    } catch (error) {
      setFilePreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setFilePreviewLoading(false);
    }
  }

  const composerControls = {
    permission,
    setPermission,
    model: activeModel,
    setModel: (nextModel: AgentModel) =>
      setModelByProvider((current) => ({
        ...current,
        [activeProvider]: nextModel
      })),
    intelligence: activeIntelligence,
    setIntelligence: (nextIntelligence: IntelligenceMode) =>
      setIntelligenceByProvider((current) => ({
        ...current,
        [activeProvider]: nextIntelligence
      })),
    permissionOpen,
    setPermissionOpen,
    intelligenceOpen,
    setIntelligenceOpen,
    permissionMenuId: "composer-permission-menu",
    intelligenceMenuId: "composer-intelligence-menu",
    provider: activeProvider,
    setProvider,
    value: prompt,
    setValue: setPrompt,
    onSubmit: submitPrompt,
    onStop: stopActiveRun,
    submitMode,
    submitDisabled: submitMode === "send" && !prompt.trim(),
    imageAttachments,
    onAddImageAttachments: addImageAttachments,
    onRemoveImageAttachment: removeImageAttachment,
    approvals: approvals.filter((approval) =>
      activeSession ? approval.sessionId === activeSession.id : true
    ),
    onResolveApproval: resolveApproval
  };

  if (settingsOpen) {
    return <SettingsPage onBack={() => setSettingsOpen(false)} />;
  }

  function startNewSession(project?: Project) {
    const workspaceCwd =
      project?.cwd ?? (project?.id?.startsWith("/") ? project.id : undefined);
    const workspaceId = workspaceCwd ?? project?.id;

    if (workspaceId) {
      if (workspaceCwd) {
        setWorkspaceOptions((current) =>
          mergeWorkspaceOptions([
            ...current,
            {
              id: workspaceCwd,
              label: project?.name ?? basename(workspaceCwd),
              cwd: workspaceCwd,
              detail: workspaceCwd
            }
          ])
        );
      }

      setSelectedWorkspaceId(workspaceId);
    }

    setSelectedThread("");
    setActiveNav("New session");
  }

  return (
    <div
      className="grid h-screen min-h-0 overflow-hidden bg-app-shell text-app-text transition-[grid-template-columns] duration-[220ms] ease-in-out motion-reduce:transition-none"
      style={
        {
          gridTemplateColumns: sidebarOpen
            ? "244px minmax(0, 1fr)"
            : "0 minmax(0, 1fr)",
          "--review-content-width": `${reviewContentWidth}px`
        } as CSSProperties
      }
    >
      <Sidebar
        open={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        projects={projects}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        selectedThread={selectedThread}
        setSelectedThread={selectThread}
        onThreadSelect={selectThread}
        onThreadArchive={(threadId) => void updateThreadVisibility(threadId, "archive")}
        onThreadDelete={(threadId) => void updateThreadVisibility(threadId, "delete")}
        onNewSession={startNewSession}
        onSearch={() => setSearchOpen(true)}
        onPlugins={() => {
          setActiveNav("Plugins");
          setSelectedThread("");
        }}
        onSettings={() => setSettingsOpen(true)}
      />

      <main
        className={cn(
          "relative grid min-h-0 min-w-0 overflow-hidden motion-reduce:transition-none",
          inspectorResizing
            ? "transition-none"
            : "transition-[grid-template-columns] duration-[220ms] ease-in-out",
          !inspectorOpen && !inspectorResizing && "duration-150"
        )}
        style={{
          gridTemplateColumns: inspectorOpen
            ? "minmax(0, 1fr) var(--review-content-width)"
            : "minmax(0, 1fr) 0"
        }}
      >
        <section className="grid min-h-0 min-w-0 grid-rows-[44px_minmax(0,1fr)] overflow-hidden">
          <AppChrome
            className="h-11"
            mode={shouldShowConversation ? "session" : "new"}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            inspectorOpen={inspectorOpen}
            setInspectorOpen={setInspectorOpen}
            selectedThread={activeSession?.title ?? ""}
            onNewSession={() => startNewSession()}
            threadViewMode={threadViewMode}
            onThreadViewModeChange={setThreadViewMode}
            centerSlot={contentMode === "plugins" || shouldShowConversation ? (
              <div className="flex h-full min-w-0 flex-1 items-center gap-3">
                {!showThreadTabs && (
                  <div className="flex min-w-0 shrink-0 items-center gap-2">
                    <span className="max-w-[220px] truncate">
                      {contentMode === "plugins"
                        ? "Plugins"
                        : activeSession?.title ?? workspaceName}
                    </span>
                    <MoreHorizontal size={13} />
                  </div>
                )}
                {showThreadTabs && (
                  <ThreadTabs
                    className="min-w-0"
                    variant="header"
                    threads={threadTabs}
                    selectedThread={selectedThread}
                    workspaceName={workspaceName}
                    onThreadSelect={selectThread}
                    onThreadClose={() => {
                      setSelectedThread("");
                      setActiveNav("New session");
                    }}
                    onThreadArchive={(threadId) =>
                      void updateThreadVisibility(threadId, "archive")
                    }
                    onThreadDelete={(threadId) =>
                      void updateThreadVisibility(threadId, "delete")
                    }
                  />
                )}
              </div>
            ) : null}
          />

          <div className="h-full min-h-0 min-w-0 overflow-hidden">
            {contentMode === "plugins" ? (
              <PluginsPage agentServerUrl={agentServer?.httpUrl} />
            ) : shouldShowConversation && activeSession ? (
              <Conversation
                cwd={activeSession.cwd ?? currentCwd}
                inspectorOpen={inspectorOpen}
                items={activeSession.items}
                pendingItems={activePendingItems}
                composer={composerControls}
                onOpenFile={openFile}
              />
            ) : (
              <NewSessionPage
                workspaceName={workspaceName}
                composer={composerControls}
                workspaceOptions={allWorkspaceOptions}
                selectedWorkspaceId={selectedWorkspace?.id}
                onWorkspaceSelect={(option) => {
                  setSelectedWorkspaceId(option.id);
                  setSelectedThread("");
                }}
                onWorkspaceCreate={createWorkspace}
              />
            )}
          </div>
        </section>

        <div
          role="separator"
          aria-label="Resize inspector"
          aria-orientation="vertical"
          aria-valuemin={minReviewContentWidth}
          aria-valuemax={maxReviewContentWidth}
          aria-valuenow={reviewContentWidth}
          tabIndex={inspectorOpen ? 0 : -1}
          className={cn(
            "app-no-drag group/resize absolute inset-y-0 z-20 w-1.5 cursor-col-resize bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70 motion-reduce:transition-none",
            inspectorResizing
              ? "transition-none"
              : "transition-[right,opacity] duration-[220ms] ease-in-out",
            !inspectorOpen && "pointer-events-none opacity-0"
          )}
          style={{ right: inspectorOpen ? "var(--review-content-width)" : 0 }}
          onPointerDown={startInspectorResize}
          onKeyDown={resizeInspectorWithKeyboard}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.08] transition-colors group-hover/resize:bg-app-blue/55" />
        </div>

        <ReviewPanel
          open={inspectorOpen}
          present={inspectorOpen}
          filePath={filePreview?.path ?? reviewFilePath}
          diffRows={diffRows}
          filePreview={filePreview}
          filePreviewError={filePreviewError}
          filePreviewLoading={filePreviewLoading}
          onClose={() => setInspectorOpen(false)}
        />
      </main>

      <SearchModal
        open={searchOpen}
        projects={projects}
        query={searchQuery}
        setQuery={setSearchQuery}
        onClose={() => setSearchOpen(false)}
        onSelectThread={selectThread}
      />
    </div>
  );
}

function createInitialSnapshot(): SessionSnapshot {
  const sessions = Object.fromEntries(
    mockProjects.flatMap((project) =>
      project.threads.map((thread) => [
        thread.id,
        normalizeSession({
          id: thread.id,
          provider: thread.provider ?? project.provider ?? "codex",
          title: thread.name,
          updatedAt: new Date().toISOString(),
          cwd: thread.cwd,
          model: thread.model,
          items: thread.active ? conversationItems : [],
          pendingItems: []
        })
      ])
    )
  );

  return { projects: mockProjects, sessions };
}

function normalizeSession(session: SessionContent): SessionContent {
  return {
    ...session,
    items: session.items ?? [],
    pendingItems: session.pendingItems ?? [],
    providerSessions: session.providerSessions ?? {},
    runtimeStatus: session.runtimeStatus ?? "idle"
  };
}

function composerProviderForSession(
  session: SessionContent,
  fallback: SessionProvider
): SessionProvider {
  return session.lastProvider ?? session.provider ?? fallback;
}

function upsertSessionProject(projects: Project[], session: SessionContent) {
  const project = workspaceProjectForSession(session);
  const thread: ProjectThread = {
    id: session.id,
    name: session.title,
    age: relativeAge(session.updatedAt),
    provider: session.provider,
    model: session.model,
    cwd: session.cwd
  };
  const withoutThread = projects
    .map((project) => ({
      ...project,
      threads: project.threads.filter((item) => item.id !== session.id)
    }))
    .filter((item) => item.threads.length > 0 || projectKey(item) === project.id);
  const existing = withoutThread.find((item) => projectKey(item) === project.id);

  if (existing) {
    return withoutThread.map((item) =>
      projectKey(item) === project.id
        ? {
            ...item,
            id: project.id,
            name: project.name,
            cwd: project.cwd,
            threads: [thread, ...item.threads]
          }
        : item
    );
  }

  return [
    {
      id: project.id,
      name: project.name,
      cwd: project.cwd,
      threads: [thread]
    },
    ...withoutThread
  ];
}

function appendErrorMessage(
  sessions: Record<string, SessionContent>,
  sessionId: string | undefined,
  prompt: string,
  provider: SessionProvider,
  error: string
): Record<string, SessionContent> {
  if (!sessionId || !sessions[sessionId]) {
    const id = `${provider}-error-${createId()}`;

    return {
      ...sessions,
      [id]: {
        id,
        provider,
        runtimeStatus: "error" as const,
        title: titleFromPrompt(prompt),
        updatedAt: new Date().toISOString(),
        items: [
          {
            id: `${id}-user`,
            type: "user_message" as const,
            body: prompt,
            timestamp: formatTime(new Date())
          },
          {
            id: `${id}-error`,
            type: "notice" as const,
            label: error
          }
        ],
        pendingItems: []
      }
    };
  }

  const session = sessions[sessionId];

  const updatedSession: SessionContent = {
    ...session,
    runtimeStatus: "error",
    pendingItems: [],
    items: [
      ...session.items,
      {
        id: `${sessionId}-error-${Date.now()}`,
        type: "notice" as const,
        label: error
      }
    ]
  };

  return {
    ...sessions,
    [sessionId]: updatedSession
  };
}

function loadWorkspaceOptions(): PromptComposerFooterOption[] {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey);
    const parsed = raw ? (JSON.parse(raw) as PromptComposerFooterOption[]) : [];

    return Array.isArray(parsed)
      ? parsed.filter(
          (option) =>
            typeof option?.id === "string" &&
            typeof option?.label === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function readThreadViewMode(): ThreadViewMode {
  const value = readStorage(threadViewModeStorageKey);

  return value === "tabs" || value === "sidebar" ? value : "sidebar";
}

function readReviewContentWidth() {
  const value = Number(readStorage(reviewContentWidthStorageKey));

  return clampReviewContentWidth(value || 360);
}

function clampReviewContentWidth(value: number) {
  const viewportLimit =
    typeof window === "undefined"
      ? maxReviewContentWidth
      : Math.max(minReviewContentWidth, Math.floor(window.innerWidth * 0.62));

  return Math.min(
    Math.max(Math.round(value), minReviewContentWidth),
    Math.min(maxReviewContentWidth, viewportLimit)
  );
}

function createThreadTabs({
  projects,
  selectedThread,
  selectedWorkspaceId,
  selectedWorkspaceCwd,
  selectedWorkspaceName
}: {
  projects: Project[];
  selectedThread: string;
  selectedWorkspaceId?: string;
  selectedWorkspaceCwd?: string;
  selectedWorkspaceName?: string;
}): ThreadTabItem[] {
  const workspaceProject =
    projects.find((project) =>
      projectMatchesWorkspace(project, {
        id: selectedWorkspaceId,
        cwd: selectedWorkspaceCwd,
        name: selectedWorkspaceName
      })
    ) ??
    projects.find((project) =>
      project.threads.some((thread) => thread.id === selectedThread)
    ) ??
    projects[0];

  const tabs = workspaceProject
    ? workspaceProject.threads.map((thread) => threadToTab(workspaceProject, thread))
    : [];

  if (!selectedThread || tabs.some((thread) => thread.id === selectedThread)) {
    return tabs;
  }

  const activeThread = projects
    .flatMap((project) => project.threads.map((thread) => threadToTab(project, thread)))
    .find((thread) => thread.id === selectedThread);

  return activeThread ? [activeThread, ...tabs] : tabs;
}

function projectMatchesWorkspace(
  project: Project,
  workspace: { id?: string; cwd?: string; name?: string }
) {
  const projectValues = [project.id, project.cwd, project.name]
    .filter(Boolean)
    .map((value) => normalizePathKey(String(value)));
  const workspaceValues = [workspace.id, workspace.cwd, workspace.name]
    .filter(Boolean)
    .map((value) => normalizePathKey(String(value)));

  return workspaceValues.some((value) => projectValues.includes(value));
}

function threadToTab(project: Project, thread: ProjectThread): ThreadTabItem {
  return {
    id: thread.id,
    name: thread.name,
    age: thread.age,
    provider: thread.provider ?? project.provider,
    workspaceName: project.name
  };
}

function normalizePathKey(value: string) {
  return value.replace(/\/+$/, "");
}

function workspaceOptionsFromSessions(
  sessions: Record<string, SessionContent>
): PromptComposerFooterOption[] {
  return Object.values(sessions)
    .flatMap((session) => {
      if (!session.cwd) {
        return [];
      }

      return [
        {
            id: session.cwd,
            label: basename(session.cwd),
            cwd: session.cwd,
            detail: session.cwd
        }
      ];
    });
}

function mergeWorkspaceOptions(
  options: Array<PromptComposerFooterOption | undefined>
): PromptComposerFooterOption[] {
  const byId = new Map<string, PromptComposerFooterOption>();

  for (const option of options) {
    if (!option) {
      continue;
    }

    byId.set(option.cwd ?? option.id, {
      ...option,
      id: option.cwd ?? option.id
    });
  }

  return [...byId.values()];
}

function fileToAttachment(file: File): Promise<ComposerImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");

      resolve({
        id: createId(),
        name: file.name,
        mediaType: file.type || "image/png",
        previewUrl: dataUrl,
        dataUrl
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function drainResponse(response: Response) {
  if (!response.body) {
    await response.text();
    return;
  }

  const reader = response.body.getReader();

  while (true) {
    const { done } = await reader.read();

    if (done) {
      return;
    }
  }
}

async function updateThreadVisibilityViaServer(
  serverUrl: string,
  sessionId: string,
  action: "archive" | "delete"
) {
  const response = await fetch(`${serverUrl}/api/sessions/visibility`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, action })
  });

  if (!response.ok) {
    throw new Error(`Session ${action} failed with ${response.status}`);
  }

  const body = await response.json() as { snapshot?: SessionSnapshot };
  return body.snapshot;
}

function removeThreadFromProjects(projects: Project[], sessionId: string) {
  return projects
    .map((project) => ({
      ...project,
      threads: project.threads.filter((thread) => thread.id !== sessionId)
    }))
    .filter((project) => project.threads.length > 0);
}

function providerLabel(provider: SessionProvider) {
  if (provider === "meta") {
    return "Meta agent";
  }

  return provider === "claude" ? "Claude" : "Codex";
}

function titleFromPrompt(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "Untitled session";
  }

  return normalized.length > 54 ? `${normalized.slice(0, 51)}...` : normalized;
}

function relativeAge(value?: string) {
  if (!value) {
    return "now";
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return "now";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) {
    return "now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function basename(filePath: string) {
  return filePath.replace(/\/+$/, "").split("/").pop() || filePath;
}

function workspaceProjectForSession(session: Pick<SessionContent, "cwd">) {
  const cwd = session.cwd?.replace(/\/+$/, "");

  return {
    id: cwd ?? "unknown-workspace",
    name: cwd ? basename(cwd) : "Unknown workspace",
    cwd
  };
}

function projectKey(project: Project) {
  return project.id ?? project.cwd ?? project.name;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local storage can be disabled in embedded previews.
  }
}
