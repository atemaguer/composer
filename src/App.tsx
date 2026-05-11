import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
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
  SessionSnapshot
} from "./types";

type AgentServerInfo = {
  httpUrl: string;
  wsUrl: string;
  cwd?: string;
  workspaceName?: string;
};

const workspaceStorageKey = "composer.workspaces";
const selectedWorkspaceStorageKey = "composer.selectedWorkspace";

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

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    writeStorage(workspaceStorageKey, JSON.stringify(workspaceOptions));
  }, [workspaceOptions]);

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

  return (
    <div
      className="grid h-screen min-h-0 overflow-hidden bg-app-shell text-app-text transition-[grid-template-columns] duration-[220ms] ease-in-out motion-reduce:transition-none"
      style={
        {
          gridTemplateColumns: sidebarOpen
            ? "244px minmax(0, 1fr)"
            : "0 minmax(0, 1fr)",
          "--review-content-width": "360px"
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
        onNewSession={() => {
          setSelectedThread("");
          setActiveNav("New session");
        }}
        onSearch={() => setSearchOpen(true)}
        onPlugins={() => {
          setActiveNav("Plugins");
          setSelectedThread("");
        }}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className="grid min-h-0 min-w-0 grid-rows-[44px_minmax(0,1fr)] overflow-hidden">
        <AppChrome
          className="h-11"
          mode={shouldShowConversation ? "session" : "new"}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          inspectorOpen={inspectorOpen}
          setInspectorOpen={setInspectorOpen}
          selectedThread={activeSession?.title ?? ""}
          onNewSession={() => {
            setSelectedThread("");
            setActiveNav("New session");
          }}
          centerSlot={
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate">
                {contentMode === "plugins"
                  ? "Plugins"
                  : activeSession?.title ?? workspaceName}
              </span>
              <MoreHorizontal size={13} />
            </div>
          }
        />

        <div
          className={cn(
            "grid min-h-0 min-w-0 overflow-hidden transition-[grid-template-columns] duration-[220ms] ease-in-out motion-reduce:transition-none",
            !inspectorOpen && "duration-150"
          )}
          style={{
            gridTemplateColumns: inspectorOpen
              ? "minmax(0, 1fr) var(--review-content-width)"
              : "minmax(0, 1fr) 0"
          }}
        >
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

          <ReviewPanel
            open={inspectorOpen}
            present={inspectorOpen}
            filePath={filePreview?.path ?? reviewFilePath}
            diffRows={diffRows}
            filePreview={filePreview}
            filePreviewError={filePreviewError}
            filePreviewLoading={filePreviewLoading}
          />
        </div>
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
  const projectName = providerProjectName(session.provider);
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
    .filter((project) => project.threads.length > 0 || project.name === projectName);
  const existing = withoutThread.find((project) => project.name === projectName);

  if (existing) {
    return withoutThread.map((project) =>
      project.name === projectName
        ? {
            ...project,
            provider: session.provider,
            threads: [thread, ...project.threads]
          }
        : project
    );
  }

  return [
    {
      name: projectName,
      provider: session.provider,
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

function providerProjectName(provider: SessionProvider) {
  if (provider === "meta") {
    return "Meta agent sessions";
  }

  return provider === "claude" ? "Claude sessions" : "Codex sessions";
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
