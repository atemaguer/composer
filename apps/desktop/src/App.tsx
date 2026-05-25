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
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

import { AppChrome } from "./components/AppChrome";
import { Composer } from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { NewSessionPage } from "./components/NewSessionPage";
import { ReviewPanel } from "./components/ReviewPanel";
import { SearchModal } from "./components/SearchModal";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { ThreadTabs, type ThreadTabItem } from "./components/ThreadTabs";
import { cn } from "./lib/cn";
import { useComposerStore } from "./state/composer-store";
import { useFilePreviewStore } from "./state/file-preview-store";
import { useRuntimeStore } from "./state/runtime-store";
import { isSessionRunning, useSessionStore } from "./state/session-store";
import { clampReviewContentWidth, useUiStore } from "./state/ui-store";
import {
  mergeWorkspaceOptions,
  useWorkspaceStore,
  workspaceOptionsFromSessions
} from "./state/workspace-store";
import type {
  ApprovalDecision,
  ComposerImageAttachment,
  ComposerReviewCommentAttachment,
  DelegateSessionProvider,
  LiveAgentEvent,
  ProviderFilter,
  Project,
  ProjectThread,
  ReviewDiff,
  ReviewDiffFile,
  SessionContent,
  SessionProvider,
  SessionSnapshot,
  ThreadViewMode
} from "./types";

const minReviewContentWidth = 300;
const maxReviewContentWidth = 720;

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const setInspectorOpen = useUiStore((state) => state.setInspectorOpen);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const threadViewMode = useUiStore((state) => state.threadViewMode);
  const setThreadViewMode = useUiStore((state) => state.setThreadViewMode);
  const reviewContentWidth = useUiStore((state) => state.reviewContentWidth);
  const setReviewContentWidth = useUiStore(
    (state) => state.setReviewContentWidth
  );
  const inspectorResizing = useUiStore((state) => state.inspectorResizing);
  const setInspectorResizing = useUiStore(
    (state) => state.setInspectorResizing
  );
  const searchOpen = useUiStore((state) => state.searchOpen);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);
  const activeNav = useUiStore((state) => state.activeNav);
  const setActiveNav = useUiStore((state) => state.setActiveNav);
  const navigationAvailability = useUiStore(
    (state) => state.navigationAvailability
  );
  const setNavigationAvailability = useUiStore(
    (state) => state.setNavigationAvailability
  );

  const selectedThread = useSessionStore((state) => state.selectedThread);
  const setSelectedThread = useSessionStore((state) => state.setSelectedThread);
  const projects = useSessionStore((state) => state.projects);
  const sessions = useSessionStore((state) => state.sessions);
  const setSessions = useSessionStore((state) => state.setSessions);
  const setSessionSnapshot = useSessionStore((state) => state.setSnapshot);
  const upsertSession = useSessionStore((state) => state.upsertSession);
  const removeSession = useSessionStore((state) => state.removeSession);
  const approvals = useSessionStore((state) => state.approvals);
  const addApproval = useSessionStore((state) => state.addApproval);
  const removeApproval = useSessionStore((state) => state.removeApproval);
  const pendingNewRequestId = useSessionStore(
    (state) => state.pendingNewRequestId
  );
  const setPendingNewRequestId = useSessionStore(
    (state) => state.setPendingNewRequestId
  );

  const agentServer = useRuntimeStore((state) => state.agentServer);
  const setAgentServer = useRuntimeStore((state) => state.setAgentServer);

  const prompt = useComposerStore((state) => state.prompt);
  const setPrompt = useComposerStore((state) => state.setPrompt);
  const permission = useComposerStore((state) => state.permission);
  const setPermission = useComposerStore((state) => state.setPermission);
  const provider = useComposerStore((state) => state.provider);
  const setProvider = useComposerStore((state) => state.setProvider);
  const modelByProvider = useComposerStore((state) => state.modelByProvider);
  const intelligenceByProvider = useComposerStore(
    (state) => state.intelligenceByProvider
  );
  const permissionOpen = useComposerStore((state) => state.permissionOpen);
  const setPermissionOpen = useComposerStore((state) => state.setPermissionOpen);
  const intelligenceOpen = useComposerStore((state) => state.intelligenceOpen);
  const setIntelligenceOpen = useComposerStore(
    (state) => state.setIntelligenceOpen
  );
  const imageAttachments = useComposerStore((state) => state.imageAttachments);
  const reviewCommentAttachments = useComposerStore(
    (state) => state.reviewCommentAttachments
  );
  const addComposerImageAttachments = useComposerStore(
    (state) => state.addImageAttachments
  );
  const removeComposerImageAttachment = useComposerStore(
    (state) => state.removeImageAttachment
  );
  const addComposerReviewCommentAttachment = useComposerStore(
    (state) => state.addReviewCommentAttachment
  );
  const removeComposerReviewCommentAttachment = useComposerStore(
    (state) => state.removeReviewCommentAttachment
  );
  const clearComposer = useComposerStore((state) => state.clearComposer);
  const setActiveModel = useComposerStore((state) => state.setActiveModel);
  const setActiveIntelligence = useComposerStore(
    (state) => state.setActiveIntelligence
  );

  const workspaceOptions = useWorkspaceStore((state) => state.workspaceOptions);
  const setWorkspaceOptions = useWorkspaceStore(
    (state) => state.setWorkspaceOptions
  );
  const selectedWorkspaceId = useWorkspaceStore(
    (state) => state.selectedWorkspaceId
  );
  const setSelectedWorkspaceId = useWorkspaceStore(
    (state) => state.setSelectedWorkspaceId
  );

  const filePreview = useFilePreviewStore((state) => state.filePreview);
  const setFilePreview = useFilePreviewStore((state) => state.setFilePreview);
  const filePreviewError = useFilePreviewStore(
    (state) => state.filePreviewError
  );
  const setFilePreviewError = useFilePreviewStore(
    (state) => state.setFilePreviewError
  );
  const filePreviewLoading = useFilePreviewStore(
    (state) => state.filePreviewLoading
  );
  const setFilePreviewLoading = useFilePreviewStore(
    (state) => state.setFilePreviewLoading
  );
  const openPreview = useFilePreviewStore((state) => state.openPreview);

  const socketRef = useRef<WebSocket | null>(null);
  const expectingNewSessionRef = useRef(false);
  const maxRouterHistoryIndexRef = useRef(routerHistoryIndex());
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [sessionsLoading, setSessionsLoading] = useState(
    () =>
      Boolean(window.composer?.listLocalSessions) ||
      Boolean(window.composer?.getAgentServer)
  );
  const [autoUpdateState, setAutoUpdateState] = useState<AutoUpdateState>({
    status: "idle"
  });
  const [reviewDiff, setReviewDiff] = useState<ReviewDiff | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [selectedReviewPath, setSelectedReviewPath] = useState<string | null>(
    null
  );
  const reviewRequestIdRef = useRef(0);

  const activeSession = selectedThread ? sessions[selectedThread] : undefined;
  const activeProvider = provider;
  const activeModel = modelByProvider[activeProvider];
  const activeIntelligence = intelligenceByProvider[activeProvider];
  const activeSessionNeedsParallelAdoption =
    activeSession ? needsParallelAdoption(activeSession) : false;

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
  const currentCwd = activeSession
    ? sessionWorkspaceCwd(activeSession) ?? selectedWorkspace?.cwd
    : selectedWorkspace?.cwd;
  const workspaceName =
    selectedWorkspace?.label ??
    agentServer?.workspaceName ??
    (currentCwd ? basename(currentCwd) : "Workspace");
  const runningSessionIds = useMemo(
    () =>
      new Set(
        Object.values(sessions).flatMap((session) =>
          isSessionRunning(session) ? [session.id] : []
        )
      ),
    [sessions]
  );
  const threadTabs = useMemo(
    () =>
      createThreadTabs({
        projects,
        providerFilter,
        runningSessionIds,
        selectedThread,
        selectedWorkspaceId: selectedWorkspace?.id,
        selectedWorkspaceCwd: selectedWorkspace?.cwd,
        selectedWorkspaceName: selectedWorkspace?.label
      }),
    [
      projects,
      providerFilter,
      runningSessionIds,
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
  const activeSessionRunning = activeSession
    ? isSessionRunning(activeSession)
    : false;
  const submitMode: "send" | "stop" =
    activeSessionRunning || pendingNewRequestId ? "stop" : "send";
  const shouldShowConversation = Boolean(activeSession);
  const showThreadTabs = shouldShowConversation && threadViewMode === "tabs";

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
      if (!agentServer?.wsUrl && !window.composer?.listLocalSessions) {
        setSessionsLoading(false);
      }
      return;
    }

    let cancelled = false;

    async function loadLocalSessions() {
      setSessionsLoading(true);

      try {
        const snapshot = await window.composer?.listLocalSessions?.();

        if (!cancelled && snapshot) {
          setSessionSnapshot(snapshot);
        }
      } catch (error) {
        console.warn("Could not load local sessions", error);
      } finally {
        if (!cancelled) {
          setSessionsLoading(false);
        }
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
        setSessionSnapshot(event.snapshot);
        setSessionsLoading(false);
        return;
      }

      if (event.type === "session.started") {
        setSessionsLoading(false);
        upsertSession(event.session);

        if (expectingNewSessionRef.current) {
          expectingNewSessionRef.current = false;
          setPendingNewRequestId(null);
          setSelectedThread(event.session.id);
          setActiveNav("New session");
          navigate(sessionRoute(event.session.id));
        }
        return;
      }

      if (event.type === "session.updated") {
        setSessionsLoading(false);
        upsertSession(event.session);
        return;
      }

      if (event.type === "approval.requested") {
        addApproval(event.approval);
        return;
      }

      if (event.type === "approval.resolved") {
        removeApproval(event.approvalId);
        return;
      }

      if (event.type === "turn.completed" && selectedThread === event.sessionId) {
        setPendingNewRequestId(null);
      }
    },
    [
      addApproval,
      navigate,
      removeApproval,
      selectedThread,
      setActiveNav,
      setPendingNewRequestId,
      setSelectedThread,
      setSessionSnapshot,
      upsertSession
    ]
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
      setSessionsLoading(false);
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [agentServer?.wsUrl, applyAgentEvent]);

  useEffect(() => {
    let cancelled = false;
    const removeListener = window.composer?.onAutoUpdateState?.((state) => {
      setAutoUpdateState(state);
    });

    void window.composer?.getAutoUpdateState?.()
      .then((state) => {
        if (!cancelled) {
          setAutoUpdateState(state);
        }
      })
      .catch((error) => {
        console.warn("Could not read auto-update state", error);
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  function selectThread(
    threadId: string,
    options: { updateRoute?: boolean } = {}
  ) {
    const session = sessions[threadId];

    setSelectedThread(threadId);
    setActiveNav("New session");

    if (options.updateRoute !== false) {
      navigateAppRoute(sessionRoute(threadId));
    }

    if (!session) {
      return;
    }

    const nextProvider = composerProviderForSession(session, provider);
    setProvider(nextProvider);

    const sessionWorkspace = sessionWorkspaceCwd(session);

    if (sessionWorkspace) {
      setSelectedWorkspaceId(sessionWorkspace);
    }
  }

  function navigateAppRoute(pathname: string, options?: { replace?: boolean }) {
    if (location.pathname === pathname) {
      return;
    }

    navigate(pathname, { replace: options?.replace });
  }

  function navigateBack() {
    navigate(-1);
  }

  function navigateForward() {
    navigate(1);
  }

  function installAutoUpdate() {
    void window.composer?.installAutoUpdate?.().catch((error) => {
      console.warn("Could not install downloaded update", error);
    });
  }

  useEffect(() => {
    const nextIndex = routerHistoryIndex();

    if (navigationType === "PUSH") {
      maxRouterHistoryIndexRef.current = nextIndex;
    } else {
      maxRouterHistoryIndexRef.current = Math.max(
        maxRouterHistoryIndexRef.current,
        nextIndex
      );
    }

    setNavigationAvailability({
      canGoBack: nextIndex > 0,
      canGoForward: nextIndex < maxRouterHistoryIndexRef.current
    });
  }, [location.key, navigationType]);

  useEffect(() => {
    const route = appRouteFromPathname(location.pathname);

    if (location.pathname === "/") {
      navigateAppRoute("/new", { replace: true });
      return;
    }

    if (route.kind === "session") {
      selectThread(route.sessionId, { updateRoute: false });
      return;
    }

    setSelectedThread("");
    setActiveNav("New session");
  }, [location.pathname, sessions]);

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
    const promptWithComments = formatPromptWithReviewComments(
      body,
      reviewCommentAttachments
    );

    if (!promptWithComments || submitMode === "stop") {
      return;
    }

    const requestId = createId();
    const sessionId = activeSession?.id;
    const requestProvider = activeProvider;

    if (!agentServer?.httpUrl) {
      createOfflineSession(promptWithComments, requestProvider);
      return;
    }

    if (!sessionId) {
      expectingNewSessionRef.current = true;
      setPendingNewRequestId(requestId);
    }

    clearComposer();

    try {
      const response = await fetch(`${agentServer.httpUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          sessionId,
          provider: requestProvider,
          prompt: promptWithComments,
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
        appendErrorMessage(current, sessionId, promptWithComments, requestProvider, message)
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

  async function archiveThread(sessionId: string) {
    const session = sessions[sessionId];

    if (!session) {
      return;
    }

    try {
      const snapshot = agentServer?.httpUrl
        ? await archiveThreadViaServer(agentServer.httpUrl, sessionId)
        : await window.composer?.updateSessionVisibility?.({
            sessionId,
            action: "archive"
          });

      if (snapshot) {
        setSessionSnapshot(snapshot);
      } else {
        removeSession(sessionId);
      }

      if (selectedThread === sessionId) {
        setSelectedThread("");
        setActiveNav("New session");
        navigateAppRoute("/new", { replace: true });
      }
    } catch (error) {
      console.warn("Could not archive session", error);
    }
  }

  async function adoptParallelThread(provider: DelegateSessionProvider) {
    if (!activeSession || !agentServer?.httpUrl) {
      return;
    }

    try {
      const response = await fetch(`${agentServer.httpUrl}/api/sessions/adopt-parallel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSession.id,
          provider
        })
      });

      if (!response.ok) {
        throw new Error(`Parallel thread adoption failed with ${response.status}`);
      }

      const data = await response.json() as { snapshot?: SessionSnapshot };

      if (data.snapshot) {
        setSessionSnapshot(data.snapshot);
      }

      setSelectedThread(activeSession.id);
      setProvider(provider);
      navigateAppRoute(sessionRoute(activeSession.id), { replace: true });
    } catch (error) {
      console.warn("Could not adopt parallel thread", error);
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
    removeApproval(approvalId);
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

    upsertSession(session);
    setSelectedThread(id);
    setActiveNav("New session");
    setPrompt("");
    navigateAppRoute(sessionRoute(id));
  }

  async function addImageAttachments(files: File[]) {
    const attachments = await Promise.all(files.map(fileToAttachment));
    addComposerImageAttachments(attachments);
  }

  function removeImageAttachment(id: string) {
    removeComposerImageAttachment(id);
  }

  function addReviewCommentAttachment(
    attachment: Omit<ComposerReviewCommentAttachment, "id">
  ) {
    addComposerReviewCommentAttachment({
      ...attachment,
      id: createId()
    });
  }

  function removeReviewCommentAttachment(id: string) {
    removeComposerReviewCommentAttachment(id);
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
    navigateAppRoute("/new");
  }

  async function openReview(request: {
    filePath?: string;
    files?: ReviewDiffFile[];
  } = {}) {
    const { filePath, files } = request;
    setInspectorOpen(true);
    setFilePreview(null);
    setFilePreviewError(null);
    setFilePreviewLoading(false);

    if (files) {
      setReviewDiff(reviewDiffFromFiles(files, currentCwd));
    }

    if (filePath) {
      setSelectedReviewPath(filePath);
    }

    await loadReviewDiff(filePath, files);
  }

  async function loadReviewDiff(
    filePath?: string,
    fallbackFiles?: ReviewDiffFile[]
  ) {
    const cwd = currentCwd;
    const requestId = reviewRequestIdRef.current + 1;
    reviewRequestIdRef.current = requestId;

    if (!agentServer?.httpUrl || !cwd) {
      setReviewDiff(fallbackFiles ? reviewDiffFromFiles(fallbackFiles, cwd) : null);
      setReviewError(
        fallbackFiles
          ? null
          : "Review is available after the agent server connects."
      );
      setReviewLoading(false);
      return;
    }

    setReviewLoading(true);
    setReviewError(null);

    try {
      const response = await fetch(`${agentServer.httpUrl}/api/review/diff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cwd,
          filePath,
          filePaths: fallbackFiles?.map((file) => file.path)
        })
      });

      if (!response.ok) {
        throw new Error(`Review request failed with ${response.status}`);
      }

      const nextDiff = (await response.json()) as ReviewDiff;

      if (reviewRequestIdRef.current !== requestId) {
        return;
      }

      const resolvedDiff =
        nextDiff.files.length > 0 || !fallbackFiles
          ? nextDiff
          : reviewDiffFromFiles(fallbackFiles, cwd);
      setReviewDiff(resolvedDiff);
      setSelectedReviewPath((current) => {
        if (filePath) {
          return resolvedDiff.files.find((file) => file.path === filePath)?.path ??
            resolvedDiff.files[0]?.path ??
            filePath;
        }

        if (current && resolvedDiff.files.some((file) => file.path === current)) {
          return current;
        }

        return resolvedDiff.files[0]?.path ?? null;
      });
    } catch (error) {
      if (reviewRequestIdRef.current !== requestId) {
        return;
      }

      setReviewError(error instanceof Error ? error.message : String(error));
      setReviewDiff(fallbackFiles ? reviewDiffFromFiles(fallbackFiles, cwd) : null);
    } finally {
      if (reviewRequestIdRef.current === requestId) {
        setReviewLoading(false);
      }
    }
  }

  function showInspector(next: boolean) {
    if (!next) {
      setInspectorOpen(false);
      return;
    }

    void openReview();
  }

  async function openFile(filePath: string) {
    setInspectorOpen(true);
    openPreview();

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
    setModel: setActiveModel,
    intelligence: activeIntelligence,
    setIntelligence: setActiveIntelligence,
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
    submitDisabled:
      submitMode === "send" &&
      (activeSessionNeedsParallelAdoption ||
        (!prompt.trim() && reviewCommentAttachments.length === 0)),
    imageAttachments,
    reviewCommentAttachments,
    onAddImageAttachments: addImageAttachments,
    onRemoveImageAttachment: removeImageAttachment,
    onRemoveReviewCommentAttachment: removeReviewCommentAttachment,
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
    navigateAppRoute("/new");
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
        providerFilter={providerFilter}
        setProviderFilter={setProviderFilter}
        runningSessionIds={runningSessionIds}
        sessionsLoading={sessionsLoading}
        autoUpdateState={autoUpdateState}
        onInstallAutoUpdate={installAutoUpdate}
        onThreadSelect={selectThread}
        onThreadArchive={(threadId) => void archiveThread(threadId)}
        onNewSession={startNewSession}
        canNavigateBack={navigationAvailability.canGoBack}
        canNavigateForward={navigationAvailability.canGoForward}
        onNavigateBack={navigateBack}
        onNavigateForward={navigateForward}
        onSearch={() => setSearchOpen(true)}
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
            setInspectorOpen={showInspector}
            selectedThread={activeSession?.title ?? ""}
            onNewSession={() => startNewSession()}
            canNavigateBack={navigationAvailability.canGoBack}
            canNavigateForward={navigationAvailability.canGoForward}
            onNavigateBack={navigateBack}
            onNavigateForward={navigateForward}
            threadViewMode={threadViewMode}
            onThreadViewModeChange={setThreadViewMode}
            centerSlot={shouldShowConversation ? (
              <div className="flex h-full min-w-0 flex-1 items-center gap-3">
                {!showThreadTabs && (
                  <div className="flex min-w-0 shrink-0 items-center gap-2">
                    <span className="max-w-[220px] truncate">
                      {activeSession?.title ?? workspaceName}
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
                      navigateAppRoute("/new");
                    }}
                    onThreadArchive={(threadId) =>
                      void archiveThread(threadId)
                    }
                  />
                )}
              </div>
            ) : null}
          />

          <div className="h-full min-h-0 min-w-0 overflow-hidden">
            {shouldShowConversation && activeSession ? (
              <Conversation
                key={[
                  activeSession.id,
                  activeSession.provider,
                  activeSession.renderMode ?? "single",
                  activeSession.parallelAdoptedProvider ?? ""
                ].join(":")}
                cwd={activeSession.cwd ?? currentCwd}
                inspectorOpen={inspectorOpen}
                items={activeSession.items}
                pendingItems={activePendingItems}
                composer={composerControls}
                parallelAdoption={{
                  required: activeSessionNeedsParallelAdoption,
                  selectedProvider: activeSession.parallelAdoptedProvider,
                  onAdopt: adoptParallelThread
                }}
                onOpenFile={openFile}
                onReviewChanges={(request) => void openReview(request)}
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
                  setActiveNav("New session");
                  navigateAppRoute("/new");
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
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-app-line-strong transition-colors group-hover/resize:bg-app-accent/55" />
        </div>

        <ReviewPanel
          open={inspectorOpen}
          present={inspectorOpen}
          review={reviewDiff}
          reviewLoading={reviewLoading}
          reviewError={reviewError}
          selectedReviewPath={selectedReviewPath}
          filePreview={filePreview}
          filePreviewError={filePreviewError}
          filePreviewLoading={filePreviewLoading}
          onSelectReviewFile={(filePath) => setSelectedReviewPath(filePath)}
          onAddReviewComment={addReviewCommentAttachment}
          onRefreshReview={() => void loadReviewDiff(selectedReviewPath ?? undefined)}
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

function composerProviderForSession(
  session: SessionContent,
  fallback: SessionProvider
): SessionProvider {
  return session.lastProvider ?? session.provider ?? fallback;
}

function needsParallelAdoption(session: SessionContent) {
  return (
    session.provider === "meta" &&
    session.renderMode === "hybrid" &&
    session.model === "Codex + Claude parallel" &&
    Boolean(session.providerSessions?.codex?.sessionId) &&
    Boolean(session.providerSessions?.claude?.sessionId) &&
    !session.parallelAdoptedProvider
  );
}

function sessionWorkspaceCwd(session: SessionContent) {
  return displayWorkspaceCwd(session.displayCwd ?? session.cwd);
}

function displayWorkspaceCwd(cwd?: string) {
  if (!cwd) {
    return undefined;
  }

  const normalized = cwd.replace(/\/+$/, "");
  const claudeWorktreeMarker = "/.claude/worktrees/";
  const claudeIndex = normalized.indexOf(claudeWorktreeMarker);

  if (claudeIndex > 0) {
    return normalized.slice(0, claudeIndex);
  }

  return normalized;
}

function reviewDiffFromFiles(
  files: ReviewDiffFile[],
  cwd = ""
): ReviewDiff {
  return {
    cwd,
    generatedAt: new Date().toISOString(),
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    raw: ""
  };
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

function createThreadTabs({
  projects,
  providerFilter,
  runningSessionIds,
  selectedThread,
  selectedWorkspaceId,
  selectedWorkspaceCwd,
  selectedWorkspaceName
}: {
  projects: Project[];
  providerFilter: ProviderFilter;
  runningSessionIds: ReadonlySet<string>;
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
    ? workspaceProject.threads
        .filter((thread) => threadMatchesProviderFilter(thread, providerFilter))
        .map((thread) => threadToTab(workspaceProject, thread, runningSessionIds))
    : [];

  if (!selectedThread || tabs.some((thread) => thread.id === selectedThread)) {
    return tabs;
  }

  const activeThread = projects
    .flatMap((project) =>
      project.threads
        .filter((thread) => threadMatchesProviderFilter(thread, providerFilter))
        .map((thread) => threadToTab(project, thread, runningSessionIds))
    )
    .find((thread) => thread.id === selectedThread);

  return activeThread ? [activeThread, ...tabs] : tabs;
}

function threadMatchesProviderFilter(
  thread: ProjectThread,
  providerFilter: ProviderFilter
) {
  return providerFilter === "all" || thread.provider === providerFilter;
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

function threadToTab(
  project: Project,
  thread: ProjectThread,
  runningSessionIds: ReadonlySet<string>
): ThreadTabItem {
  return {
    id: thread.id,
    name: thread.name,
    age: thread.age,
    provider: thread.provider ?? project.provider,
    workspaceName: project.name,
    running: runningSessionIds.has(thread.id)
  };
}

function normalizePathKey(value: string) {
  return value.replace(/\/+$/, "");
}

function sessionRoute(sessionId: string) {
  return `/sessions/${encodeURIComponent(sessionId)}`;
}

function appRouteFromPathname(pathname: string):
  | { kind: "new" }
  | { kind: "session"; sessionId: string } {
  const sessionMatch = pathname.match(/^\/sessions\/(.+)$/);

  if (sessionMatch?.[1]) {
    return {
      kind: "session",
      sessionId: decodeURIComponent(sessionMatch[1])
    };
  }

  return { kind: "new" };
}

function routerHistoryIndex() {
  const index = window.history.state?.idx;

  return typeof index === "number" ? index : 0;
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

function formatPromptWithReviewComments(
  prompt: string,
  comments: ComposerReviewCommentAttachment[]
) {
  if (comments.length === 0) {
    return prompt;
  }

  const commentLines = comments.map((comment, index) => {
    const quotedLine = comment.lineContent
      ? `\n  Code: ${comment.lineContent}`
      : "";

    return [
      `${index + 1}. ${comment.filePath} ${comment.side}${comment.lineNumber}:`,
      `  Comment: ${comment.body}${quotedLine}`
    ].join("\n");
  });
  const reviewSection = [
    "Review comments:",
    ...commentLines
  ].join("\n\n");

  if (!prompt) {
    return `Please address these review comments.\n\n${reviewSection}`;
  }

  return `${prompt}\n\n${reviewSection}`;
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

async function archiveThreadViaServer(
  serverUrl: string,
  sessionId: string
) {
  const response = await fetch(`${serverUrl}/api/sessions/visibility`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, action: "archive" })
  });

  if (!response.ok) {
    throw new Error(`Session archive failed with ${response.status}`);
  }

  const body = await response.json() as { snapshot?: SessionSnapshot };
  return body.snapshot;
}

function providerLabel(provider: SessionProvider) {
  if (provider === "meta") {
    return "Compose agent";
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
