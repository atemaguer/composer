import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent
} from "react";
import {
  Check,
  GitBranch,
  GitPullRequestCreateArrow,
  Laptop,
  Paperclip,
  X
} from "lucide-react";
import { useLocation, useNavigate, useRouter } from "./router-compat";
import { useShallow } from "zustand/react/shallow";

import { AppChrome } from "./components/AppChrome";
import {
  Composer,
  type PromptComposerControls,
  type PromptComposerFooterItem,
  type PromptComposerFooterOption
} from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { NewSessionPage } from "./components/NewSessionPage";
import { ReviewPanel } from "./components/ReviewPanel";
import { SearchModal } from "./components/SearchModal";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { useLiquidGlassEnabled } from "./components/liquid-glass/useLiquidGlass";
import { ThreadTabs, type ThreadTabItem } from "./components/ThreadTabs";
import { ComposerClient, type ComposerEventSocket } from "@composer/client";
import { cn } from "./lib/cn";
import { providerStatusLabel as providerLabel } from "./provider-registry";
import {
  BranchRefsCache,
  blockedBranchSwitchReason,
  describeUncommitted,
  resolveBranchComparison,
  resolveCurrentBranchRef,
  resolveSelectedBranchRef
} from "./state/branch-refs-cache";
import {
  newComposerPromptScope,
  useComposerStore
} from "./state/composer-store";
import {
  pushActionError,
  pushAppError,
  pushAppToast
} from "./components/AppToaster";
import { ConversationTitleMenu } from "./components/ConversationTitleMenu";
import { useFilePreviewStore } from "./state/file-preview-store";
import { useRuntimeStore } from "./state/runtime-store";
import { isSessionRunning, useSessionStore } from "./state/session-store";
import {
  clampReviewContentWidth,
  clampSidebarWidth,
  maxReviewContentWidth,
  maxSidebarWidth,
  minReviewContentWidth,
  minSidebarWidth,
  useUiStore
} from "./state/ui-store";
import {
  mergeWorkspaceOptions,
  useWorkspaceStore
} from "./state/workspace-store";
import type {
  ApprovalDecision,
  ComposerImageAttachment,
  ComposerReviewCommentAttachment,
  ConversationItem,
  DelegateSessionProvider,
  FileChangeRow,
  InspectorPanelTab,
  LiveAgentEvent,
  ProviderFilter,
  Project,
  ProjectThread,
  QueuedUserMessage,
  QuestionAnswer,
  ReviewDiff,
  ReviewBranchList,
  ReviewDiffFile,
  ReviewDiffScope,
  ReviewBranchComparison,
  ReviewBranchRef,
  SessionContent,
  SessionProvider,
  SessionSnapshot,
  ThreadViewMode,
  WorkspaceFileEntry
} from "./types";

type NewSessionWorkTarget = "local" | "worktree";

function workspaceDefaultProvider(
  workspaceId: string | undefined
): SessionProvider {
  return (
    useWorkspaceStore.getState().getWorkspaceDefaultProvider(workspaceId) ??
    "meta"
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const liquidGlass = useLiquidGlassEnabled();
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const sidebarResizing = useUiStore((state) => state.sidebarResizing);
  const setSidebarResizing = useUiStore(
    (state) => state.setSidebarResizing
  );
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
  const [inspectorFullscreen, setInspectorFullscreen] = useState(false);
  const searchOpen = useUiStore((state) => state.searchOpen);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);
  const [createProjectInitialName, setCreateProjectInitialName] = useState("");
  const [createProjectLoading, setCreateProjectLoading] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
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
  // Subscribe only to the active session rather than the entire sessions map so
  // agent events for other (or background) sessions don't re-render App.
  const activeSession = useSessionStore((state) =>
    state.selectedThread ? state.sessions[state.selectedThread] : undefined
  );
  // Membership-based set of running session ids. The selector recomputes per
  // event, but useShallow keeps the same reference (and skips a render) unless
  // the actual set of running ids changes.
  const runningSessionIds = useSessionStore(
    useShallow((state) => collectRunningSessionIds(state.sessions))
  );
  // Distinct session cwds, shallow-compared so this only changes when the set
  // of workspace folders backing sessions actually changes (not on every token).
  const sessionWorkspaceCwds = useSessionStore(
    useShallow((state) => collectSessionWorkspaceCwds(state.sessions))
  );
  // Primitive existence flag so route effects that only care whether the
  // selected thread is present in the store don't depend on the whole map.
  const selectedThreadLoaded = useSessionStore((state) =>
    selectedThread ? Boolean(state.sessions[selectedThread]) : false
  );
  const setSessions = useSessionStore((state) => state.setSessions);
  const setSessionSnapshot = useSessionStore((state) => state.setSnapshot);
  const upsertSession = useSessionStore((state) => state.upsertSession);
  const applySessionStoreAgentEvent = useSessionStore(
    (state) => state.applyAgentEvent
  );
  const removeSession = useSessionStore((state) => state.removeSession);
  const approvals = useSessionStore((state) => state.approvals);
  const removeApproval = useSessionStore((state) => state.removeApproval);
  const pendingNewRequestId = useSessionStore(
    (state) => state.pendingNewRequestId
  );
  const setPendingNewRequestId = useSessionStore(
    (state) => state.setPendingNewRequestId
  );

  const agentServer = useRuntimeStore((state) => state.agentServer);
  const setAgentServer = useRuntimeStore((state) => state.setAgentServer);
  const agentClient = useMemo(
    () =>
      agentServer?.httpUrl
        ? new ComposerClient<
            LiveAgentEvent,
            SessionSnapshot,
            ReviewDiff,
            ReviewBranchList
          >(agentServer)
        : null,
    [agentServer]
  );

  // NOTE: App intentionally does NOT subscribe to `prompt`. Composer owns the
  // controlled draft text directly from the store, so keystrokes re-render only
  // Composer, not this 2800-line root. App reads the latest value lazily at
  // submit time via useComposerStore.getState().prompt.
  const setPrompt = useComposerStore((state) => state.setPrompt);
  const setPromptScope = useComposerStore((state) => state.setPromptScope);
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
  const setModelForProvider = useComposerStore(
    (state) => state.setModelForProvider
  );
  const setActiveIntelligence = useComposerStore(
    (state) => state.setActiveIntelligence
  );
  const setIntelligenceForProvider = useComposerStore(
    (state) => state.setIntelligenceForProvider
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
  const setWorkspaceDefaultProvider = useWorkspaceStore(
    (state) => state.setWorkspaceDefaultProvider
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

  const socketRef = useRef<ComposerEventSocket<LiveAgentEvent> | null>(null);
  const processedAgentEventsRef = useRef<Set<string>>(new Set());
  const expectingNewSessionRef = useRef(false);
  const pendingNewSessionRequestRef = useRef<{
    requestId: string;
    prompt: string;
    provider: SessionProvider;
  } | null>(null);
  const loadingSessionIdsRef = useRef<Set<string>>(new Set());
  // Holds the original File for each image attachment so we can defer the
  // base64 (readAsDataURL) encode to submit time instead of doing it eagerly
  // just to render a preview (previews use a cheap object URL).
  const imageAttachmentFilesRef = useRef<Map<string, File>>(new Map());
  const maxRouterHistoryIndexRef = useRef(0);
  const [loadingSessionIds, setLoadingSessionIds] = useState<Set<string>>(
    () => new Set()
  );
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
  const [reviewScope, setReviewScope] =
    useState<ReviewDiffScope>("unstaged");
  const [reviewBranchRefs, setReviewBranchRefs] = useState<ReviewBranchRef[]>([]);
  const [reviewBranchRefsLoading, setReviewBranchRefsLoading] = useState(false);
  const [reviewBranchRefsError, setReviewBranchRefsError] = useState<string | null>(null);
  const [currentBranchRef, setCurrentBranchRef] = useState<string | null>(null);
  const [uncommittedCount, setUncommittedCount] = useState(0);
  const [selectedComposerBranchRef, setSelectedComposerBranchRef] =
    useState<string | null>(null);
  const [workspaceGitAvailable, setWorkspaceGitAvailable] = useState<
    boolean | null
  >(null);
  const [newSessionWorkTarget, setNewSessionWorkTarget] =
    useState<NewSessionWorkTarget>("local");
  const [reviewBranchComparison, setReviewBranchComparison] =
    useState<ReviewBranchComparison | null>(null);
  const [inspectorTab, setInspectorTab] =
    useState<InspectorPanelTab>("review");
  const [filePreviewTabOpen, setFilePreviewTabOpen] = useState(false);
  const [filePreviewPath, setFilePreviewPath] = useState<string | null>(null);
  const [filePreviewTabs, setFilePreviewTabs] = useState<string[]>([]);
  const [filePreviewHistory, setFilePreviewHistory] = useState<{
    paths: string[];
    index: number;
  }>({ paths: [], index: -1 });
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileEntry[]>([]);
  const [workspaceFilesLoading, setWorkspaceFilesLoading] = useState(false);
  const [workspaceFilesError, setWorkspaceFilesError] = useState<string | null>(null);
  const [lastTurnReviewFilesOverride, setLastTurnReviewFilesOverride] =
    useState<ReviewDiffFile[] | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [selectedReviewPath, setSelectedReviewPath] = useState<string | null>(
    null
  );
  const reviewRequestIdRef = useRef(0);
  const reviewBranchRefsRequestIdRef = useRef(0);
  const reviewBranchRefsCacheRef = useRef<BranchRefsCache>(new BranchRefsCache());
  const workspaceFilesRequestIdRef = useRef(0);
  const filePreviewRequestIdRef = useRef(0);

  const activeSessionItems = activeSession?.items ?? emptyConversationItems;
  const activeSessionQueuedMessages =
    activeSession?.queuedMessages ?? emptyQueuedMessages;
  // Re-key the backward scan on the items array reference: every mutating branch
  // of applyLiveSessionEvent (incl. tool.completed) assigns a NEW items array
  // while no-op branches reuse it, and the no-session case falls back to the
  // shared emptyConversationItems constant. So this recomputes exactly when the
  // timeline changes (a length+last-item key missed an in-place tool.completed
  // after a trailing assistant message) without re-rendering App for other
  // sessions' events.
  const activeSessionLastTurnReviewFiles = useMemo(
    () => latestReviewFilesFromItems(activeSessionItems) ?? null,
    [activeSessionItems]
  );
  const lastTurnReviewFiles =
    lastTurnReviewFilesOverride ?? activeSessionLastTurnReviewFiles;
  // The composer-store `provider` is the single source of truth for which engine
  // handles the next message. It is synced *from* the session when a session is
  // selected/loaded (selectThread / ensureSessionLoaded) and after a Compose
  // adoption (adoptParallelThread) — those are the only writers on the session
  // view. Reading it directly lets a manual provider switch in the picker take
  // effect immediately; deriving from the session instead would ignore the pick.
  const activeProvider = provider;
  const activeModel = modelByProvider[activeProvider];
  const activeIntelligence = intelligenceByProvider[activeProvider];
  const composerPromptScope = selectedThread
    ? sessionComposerPromptScope(selectedThread)
    : newComposerPromptScope;

  const resolvedNewSessionWorkTarget: NewSessionWorkTarget =
    workspaceGitAvailable === false ? "local" : newSessionWorkTarget;
  const activeSessionNeedsParallelAdoption =
    activeSession ? needsParallelAdoption(activeSession) : false;

  useEffect(() => {
    setLastTurnReviewFilesOverride(null);
  }, [selectedThread]);

  useLayoutEffect(() => {
    setPromptScope(composerPromptScope);
  }, [composerPromptScope, setPromptScope]);

  const sessionWorkspaceOptions = useMemo(
    () => workspaceOptionsFromCwds(sessionWorkspaceCwds),
    [sessionWorkspaceCwds]
  );
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
        ...sessionWorkspaceOptions
      ]),
    [agentServer, sessionWorkspaceOptions, workspaceOptions]
  );
  const selectedWorkspace =
    allWorkspaceOptions.find((option) => option.id === selectedWorkspaceId) ??
    allWorkspaceOptions[0];
  const currentCwd = activeSession
    ? activeSession.cwd ?? sessionWorkspaceCwd(activeSession) ?? selectedWorkspace?.cwd
    : selectedWorkspace?.cwd;

  useEffect(() => {
    reviewBranchRefsRequestIdRef.current += 1;
    setReviewBranchRefs([]);
    setReviewBranchRefsError(null);
    setCurrentBranchRef(null);
    setUncommittedCount(0);
    setSelectedComposerBranchRef(null);
    setWorkspaceGitAvailable(null);
    setReviewBranchComparison(null);
  }, [currentCwd]);

  useEffect(() => {
    reviewRequestIdRef.current += 1;
    setReviewDiff(null);
    setReviewLoading(false);
    setReviewError(null);
    setSelectedReviewPath(null);
    setWorkspaceFiles([]);
    setWorkspaceFilesError(null);
    filePreviewRequestIdRef.current += 1;
    setFilePreviewPath(null);
    setFilePreviewTabs([]);
    setFilePreviewHistory({ paths: [], index: -1 });
    setFilePreview(null);
    setFilePreviewError(null);
    setFilePreviewLoading(false);
  }, [currentCwd, selectedThread]);

  useEffect(() => {
    if (!inspectorOpen || inspectorTab !== "review") {
      return;
    }

    void loadReviewDiff({
      scope: reviewScope,
      fallbackFiles:
        reviewScope === "last-turn"
          ? activeSessionLastTurnReviewFiles ?? undefined
          : undefined,
      ignoreCachedGitAvailability: true
    });
  }, [currentCwd, inspectorOpen, inspectorTab, selectedThread]);

  useEffect(() => {
    if (workspaceGitAvailable === false) {
      setNewSessionWorkTarget("local");
    }
  }, [workspaceGitAvailable]);

  useEffect(() => {
    if (!agentClient || !currentCwd) {
      return;
    }

    void loadReviewBranches();
  }, [agentClient, currentCwd]);

  useEffect(() => {
    if (
      !filePreviewTabOpen ||
      !currentCwd ||
      workspaceFiles.length > 0 ||
      workspaceFilesLoading
    ) {
      return;
    }

    void loadWorkspaceFiles(currentCwd);
  }, [filePreviewTabOpen, currentCwd, workspaceFiles.length, workspaceFilesLoading]);

  const workspaceName =
    selectedWorkspace?.label ??
    agentServer?.workspaceName ??
    (currentCwd ? basename(currentCwd) : "Workspace");
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
  const newSessionPending = !activeSession && Boolean(pendingNewRequestId);
  const activePendingItems =
    activeSession?.pendingItems ??
    (newSessionPending && pendingNewRequestId
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
    activeSessionRunning || newSessionPending ? "stop" : "send";
  const shouldShowConversation = Boolean(activeSession);
  const showThreadTabs = shouldShowConversation && threadViewMode === "tabs";
  const newSessionPageActive =
    appRouteFromPathname(location.pathname).kind === "new";

  // New sessions use the workspace's remembered provider. If the workspace has
  // no preference yet, keep the original Compose-first default.
  const previousSelectedThreadRef = useRef(selectedThread);
  const previousNewSessionWorkspaceIdRef = useRef<string | undefined>(
    undefined
  );
  useEffect(() => {
    const workspaceId = selectedWorkspace?.id ?? currentCwd;
    const enteredNewSession =
      previousSelectedThreadRef.current && !selectedThread;
    const workspaceChangedOnNewSession =
      !selectedThread &&
      workspaceId !== previousNewSessionWorkspaceIdRef.current;

    if (enteredNewSession || workspaceChangedOnNewSession) {
      setProvider(workspaceDefaultProvider(workspaceId));
    }

    previousSelectedThreadRef.current = selectedThread;

    if (!selectedThread) {
      previousNewSessionWorkspaceIdRef.current = workspaceId;
    }
  }, [currentCwd, selectedThread, selectedWorkspace?.id, setProvider]);

  const setComposerProvider = useCallback(
    (nextProvider: SessionProvider) => {
      setProvider(nextProvider);

      if (newSessionPageActive) {
        setWorkspaceDefaultProvider(
          selectedWorkspace?.id ?? currentCwd,
          nextProvider
        );
      }
    },
    [
      currentCwd,
      newSessionPageActive,
      selectedWorkspace?.id,
      setProvider,
      setWorkspaceDefaultProvider
    ]
  );

  // Once workspace options are available (either from persisted store or from
  // loaded sessions), ensure a workspace is selected. We treat a selection as
  // valid only if it actually exists in the current options list — this covers
  // both the fresh-install case (selectedWorkspaceId is "") and the stale case
  // (selectedWorkspaceId points to a workspace that's no longer present).
  useEffect(() => {
    if (!allWorkspaceOptions[0]) {
      return;
    }

    const hasValidSelection = allWorkspaceOptions.some(
      (opt) => opt.id === selectedWorkspaceId
    );

    if (!hasValidSelection) {
      setSelectedWorkspaceId(allWorkspaceOptions[0].id);
    }
  }, [allWorkspaceOptions, selectedWorkspaceId, setSelectedWorkspaceId]);

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
      if (processedAgentEventsRef.current.has(event.id)) {
        return;
      }

      processedAgentEventsRef.current.add(event.id);

      if (processedAgentEventsRef.current.size > 2_000) {
        const oldest = processedAgentEventsRef.current.values().next().value;

        if (oldest) {
          processedAgentEventsRef.current.delete(oldest);
        }
      }

      applySessionStoreAgentEvent(event);

      if (event.type === "sessions.snapshot") {
        setSessionsLoading(false);
        return;
      }

      if (event.type === "session.started") {
        setSessionsLoading(false);

        if (
          expectingNewSessionRef.current ||
          useSessionStore.getState().pendingNewRequestId
        ) {
          expectingNewSessionRef.current = false;
          pendingNewSessionRequestRef.current = null;
          setPendingNewRequestId(null);
          setSelectedThread(event.session.id);
          setActiveNav("New session");
          navigate(sessionRoute(event.session.id));
        }
        return;
      }

      if (event.type === "session.updated") {
        setSessionsLoading(false);
        return;
      }

      if (event.type === "error") {
        setSessionsLoading(false);
        const pendingRequest = pendingNewSessionRequestRef.current;
        const isPendingNewSession =
          expectingNewSessionRef.current &&
          (!event.requestId ||
            event.requestId === pendingRequest?.requestId ||
            event.requestId === useSessionStore.getState().pendingNewRequestId);

        // Execution errors are transient — surface them as a notification, never
        // as an item in the conversation transcript. Errors on a live session
        // already carry a provider-labeled message from the runtime, so toast it
        // as-is. A failed *new* session start has no session yet: toast it
        // (labeled from the pending request) and restore the prompt so the
        // user's input isn't lost to a dead-end error session.
        if (isPendingNewSession && !event.sessionId) {
          expectingNewSessionRef.current = false;
          pendingNewSessionRequestRef.current = null;
          setPendingNewRequestId(null);

          if (pendingRequest) {
            pushAppError(
              `${providerLabel(pendingRequest.provider)} failed: ${
                event.message || "the agent stopped before starting."
              }`
            );
            setPrompt(pendingRequest.prompt);
          } else {
            pushAppError(event.message || "The agent failed to start.");
          }
        } else {
          pushAppError(event.message || "The agent stopped unexpectedly.");
        }

        return;
      }

      if (
        event.type === "turn.completed" &&
        (selectedThread === event.sessionId ||
          useSessionStore.getState().selectedThread === event.sessionId)
      ) {
        setPendingNewRequestId(null);
      }
    },
    [
      applySessionStoreAgentEvent,
      navigate,
      pendingNewRequestId,
      selectedThread,
      setActiveNav,
      setPendingNewRequestId,
      setSessions,
      setSelectedThread,
      setSessionsLoading
    ]
  );

  useEffect(() => {
    if (!agentClient || !agentServer?.wsUrl) {
      return undefined;
    }

    const eventSocket = agentClient.openEventSocket({
      onEvent: applyAgentEvent,
      onMalformedEvent: (error) => {
        console.warn("Ignoring malformed agent event", error);
      },
      onClose: () => {
        if (socketRef.current === eventSocket) {
          socketRef.current = null;
        }
        setSessionsLoading(false);
      }
    });
    socketRef.current = eventSocket;

    return () => {
      if (socketRef.current === eventSocket) {
        socketRef.current = null;
      }
      eventSocket.close();
    };
  }, [agentClient, agentServer?.wsUrl, applyAgentEvent]);

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
    const session = useSessionStore.getState().sessions[threadId];

    setSelectedThread(threadId);
    setActiveNav("New session");

    if (options.updateRoute !== false) {
      navigateAppRoute(sessionRoute(threadId));
    }

    if (!session) {
      ensureSessionLoaded(threadId);
      return;
    }

    ensureSessionLoaded(threadId);

    const nextProvider = composerProviderForSession(session, provider);
    setProvider(nextProvider);

    const sessionWorkspace = sessionWorkspaceCwd(session);

    if (sessionWorkspace) {
      setSelectedWorkspaceId(sessionWorkspace);
    }
  }

  function ensureSessionLoaded(threadId: string) {
    const session = useSessionStore.getState().sessions[threadId];

    if (!session || session.contentLoaded || loadingSessionIdsRef.current.has(threadId)) {
      return;
    }

    loadingSessionIdsRef.current.add(threadId);
    setLoadingSessionIds((current) => new Set(current).add(threadId));
    const load = agentClient
      ? agentClient.loadSession<SessionContent>(threadId)
      : window.composer?.loadLocalSession?.(threadId) ?? Promise.resolve(null);

    void load
      .then((loadedSession) => {
        if (!loadedSession) {
          return;
        }

        upsertSession(loadedSession);

        if (useSessionStore.getState().selectedThread !== threadId) {
          return;
        }

        setProvider(composerProviderForSession(loadedSession, provider));
        const sessionWorkspace = sessionWorkspaceCwd(loadedSession);

        if (sessionWorkspace) {
          setSelectedWorkspaceId(sessionWorkspace);
        }
      })
      .catch((error) => {
        console.warn(`Could not load session ${threadId}`, error);
      })
      .finally(() => {
        loadingSessionIdsRef.current.delete(threadId);
        setLoadingSessionIds((current) => {
          const next = new Set(current);
          next.delete(threadId);
          return next;
        });
      });
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
    // Back/forward availability tracks the history index against the furthest
    // index reached. A PUSH after going back truncates forward history, so it
    // resets the max; every other action (BACK/FORWARD/GO/REPLACE) keeps it.
    // Subscribing to TanStack's history delivers the index and action together,
    // so this is race-free (unlike reading a separately-tracked nav type).
    const applyAvailability = (index: number) => {
      setNavigationAvailability({
        canGoBack: index > 0,
        canGoForward: index < maxRouterHistoryIndexRef.current
      });
    };

    const initialIndex = router.history.location.state.__TSR_index ?? 0;
    maxRouterHistoryIndexRef.current = Math.max(
      maxRouterHistoryIndexRef.current,
      initialIndex
    );
    applyAvailability(initialIndex);

    return router.history.subscribe(({ action, location: historyLocation }) => {
      const index = historyLocation.state.__TSR_index ?? 0;

      if (action.type === "PUSH") {
        maxRouterHistoryIndexRef.current = index;
      } else {
        maxRouterHistoryIndexRef.current = Math.max(
          maxRouterHistoryIndexRef.current,
          index
        );
      }

      applyAvailability(index);
    });
  }, [router]);

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

    if (pendingNewRequestId || expectingNewSessionRef.current) {
      return;
    }

    setSelectedThread("");
    setActiveNav("New session");
    // Deps must NOT include any selectedThread-derived value. This effect syncs
    // route -> state and reads the session map via getState(); if it re-ran when
    // selectedThread was cleared, it would fire mid-navigation (while pathname is
    // still the old /sessions/X during the router transition) and re-select that
    // thread via the route.kind === "session" branch, bouncing the user off /new.
  }, [location.pathname, pendingNewRequestId]);

  useEffect(() => {
    const route = appRouteFromPathname(location.pathname);

    if (route.kind !== "new" || pendingNewRequestId || !selectedThread) {
      return;
    }

    if (!selectedThreadLoaded) {
      return;
    }

    setActiveNav("New session");
    navigateAppRoute(sessionRoute(selectedThread), { replace: true });
  }, [location.pathname, pendingNewRequestId, selectedThread, selectedThreadLoaded]);

  function setClampedSidebarWidth(value: number) {
    setSidebarWidth(clampSidebarWidth(value));
  }

  function setClampedReviewContentWidth(value: number) {
    setReviewContentWidth(clampReviewContentWidth(value));
  }

  function startSidebarResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSidebarResizing(true);

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      setClampedSidebarWidth(moveEvent.clientX);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSidebarResizing(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function resizeSidebarWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    setClampedSidebarWidth(
      sidebarWidth + (event.key === "ArrowRight" ? 24 : -24)
    );
  }

  function startInspectorResize(event: PointerEvent<HTMLDivElement>) {
    if (inspectorFullscreen) {
      return;
    }

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
    if (inspectorFullscreen) {
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    setClampedReviewContentWidth(
      reviewContentWidth + (event.key === "ArrowLeft" ? 24 : -24)
    );
  }

  async function submitPrompt() {
    const body = useComposerStore.getState().prompt.trim();
    const promptWithComments = formatPromptWithReviewComments(
      body,
      reviewCommentAttachments
    );

    // A non-empty submit while a run is active (submitMode === "stop") is a
    // queued follow-up: the runtime parks it behind the active turn. Only an
    // empty prompt is rejected. (The textarea gates Enter so this is reached
    // only with real text; the footer button still maps to Stop while running.)
    if (!promptWithComments) {
      return;
    }

    const requestId = createId();
    const sessionId = activeSession?.id;
    const requestProvider = activeProvider;

    if (!sessionId) {
      setWorkspaceDefaultProvider(
        selectedWorkspace?.id ?? currentCwd,
        requestProvider
      );
    }

    if (!agentClient) {
      createOfflineSession(promptWithComments, requestProvider);
      return;
    }

    if (!sessionId) {
      expectingNewSessionRef.current = true;
      pendingNewSessionRequestRef.current = {
        requestId,
        prompt: promptWithComments,
        provider: requestProvider
      };
      setPendingNewRequestId(requestId);
    }

    // Snapshot the Files for the attachments being submitted before clearing,
    // so the encode (below) is unaffected by the object-URL revocation and ref
    // cleanup that clearComposer triggers.
    const submittingAttachments = imageAttachments.map((attachment) => ({
      attachment,
      file: imageAttachmentFilesRef.current.get(attachment.id)
    }));

    for (const attachment of imageAttachments) {
      imageAttachmentFilesRef.current.delete(attachment.id);
    }

    // Clear the composer immediately for a responsive UI, then perform the
    // deferred (expensive) base64 encode from the captured Files.
    clearComposer();

    const submittedImageAttachments = await Promise.all(
      submittingAttachments.map(async ({ attachment, file }) => {
        const dataUrl =
          attachment.dataUrl ??
          (file ? await readFileAsDataUrl(file) : undefined);

        return {
          name: attachment.name,
          mediaType: attachment.mediaType,
          dataUrl,
          path: attachment.path
        };
      })
    );

    try {
      await agentClient.chat({
        requestId,
        sessionId,
        provider: requestProvider,
        prompt: promptWithComments,
        cwd: currentCwd,
        workTarget: sessionId ? undefined : resolvedNewSessionWorkTarget,
        branch:
          sessionId || workspaceGitAvailable === false
            ? undefined
            : selectedComposerBranchRef ?? currentBranchRef ?? undefined,
        permissionMode: permission,
        intelligence: activeIntelligence,
        model: activeModel,
        composeAgents:
          requestProvider === "meta"
            ? {
                codex: {
                  model: modelByProvider.codex,
                  intelligence: intelligenceByProvider.codex
                },
                claude: {
                  model: modelByProvider.claude,
                  intelligence: intelligenceByProvider.claude
                }
              }
            : undefined,
        imageAttachments: submittedImageAttachments
      }, applyAgentEvent);
    } catch (error) {
      if (!sessionId) {
        expectingNewSessionRef.current = false;
        pendingNewSessionRequestRef.current = null;
        setPendingNewRequestId(null);
      }

      const message = error instanceof Error ? error.message : String(error);
      setSessions((current) =>
        appendErrorMessage(current, sessionId, promptWithComments, requestProvider, message)
      );
    }
  }

  async function stopActiveRun() {
    if (!agentClient) {
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
      await agentClient.interrupt(body);
    } catch (error) {
      console.warn("Could not stop active run", error);
    }
  }

  async function archiveThread(sessionId: string) {
    const session = useSessionStore.getState().sessions[sessionId];

    if (!session) {
      return;
    }

    try {
      const snapshot = agentClient
        ? await agentClient.updateSessionVisibility(sessionId, "archive")
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

  async function renameThread(sessionId: string, title: string) {
    const trimmed = title.trim();

    if (!trimmed) {
      return;
    }

    try {
      const snapshot = agentClient
        ? await agentClient.renameSession(sessionId, trimmed)
        : await window.composer?.renameSession?.({
            sessionId,
            title: trimmed
          });

      if (snapshot) {
        setSessionSnapshot(snapshot);
      }
    } catch (error) {
      pushActionError("Failed to rename chat", error);
    }
  }

  function openSessionInNewWindow(sessionId: string) {
    void window.composer?.openSessionWindow?.(sessionId);
  }

  async function copyToClipboard(text: string, confirmation: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushAppToast({ message: confirmation, tone: "info" });
    } catch (error) {
      pushActionError("Failed to copy", error);
    }
  }

  async function adoptParallelThread(provider: DelegateSessionProvider) {
    if (!activeSession || !agentClient) {
      return;
    }

    try {
      const snapshot = await agentClient.adoptParallelThread(activeSession.id, provider);

      if (snapshot) {
        setSessionSnapshot(snapshot);
      }

      setSelectedThread(activeSession.id);
      setProvider(provider);
      setWorkspaceDefaultProvider(activeSession.cwd ?? currentCwd, provider);
      navigateAppRoute(sessionRoute(activeSession.id), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Could not adopt parallel thread", error);
      setSessions((current) =>
        appendErrorMessage(
          current,
          activeSession.id,
          `Continue with ${provider}`,
          provider,
          `Could not continue with this thread: ${message}`
        )
      );
    }
  }

  function resolveApproval(approvalId: string, decision: ApprovalDecision) {
    socketRef.current?.resolveApproval(approvalId, decision);
    removeApproval(approvalId);
  }

  function answerQuestion(questionId: string, answers: QuestionAnswer[]) {
    // The runtime broadcasts question.resolved (clearing pendingQuestion); no
    // optimistic local mutation needed for a loopback server.
    socketRef.current?.resolveQuestion(questionId, answers);
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

  function addImageAttachments(files: File[]) {
    const attachments = files.map((file) => {
      const id = createId();
      imageAttachmentFilesRef.current.set(id, file);

      return fileToAttachment(id, file);
    });
    addComposerImageAttachments(attachments);
  }

  function removeImageAttachment(id: string) {
    imageAttachmentFilesRef.current.delete(id);
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

  function createWorkspace(query: string) {
    setCreateProjectInitialName(query.trim());
    setCreateProjectError(null);
    setCreateProjectModalOpen(true);
  }

  async function submitCreateWorkspace(projectName: string) {
    setCreateProjectLoading(true);
    setCreateProjectError(null);

    try {
      const response = await window.composer?.createProject?.({
        name: projectName,
        baseCwd: selectedWorkspace?.cwd ?? currentCwd
      });

      if (!response) {
        throw new Error("Project creation is unavailable.");
      }

      const option = {
        id: response.cwd,
        label: response.workspaceName,
        cwd: response.cwd,
        detail: response.cwd
      };

      setWorkspaceOptions((current) => mergeWorkspaceOptions([...current, option]));
      setSelectedWorkspaceId(option.id);
      setSelectedThread("");
      setActiveNav("New session");
      setCreateProjectModalOpen(false);
      navigateAppRoute("/new");
    } catch (error) {
      setCreateProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreateProjectLoading(false);
    }
  }

  async function useExistingWorkspaceFolder() {
    const response = await window.composer?.selectProjectFolder?.();

    if (!response) {
      return;
    }

    const option = {
      id: response.cwd,
      label: response.workspaceName,
      cwd: response.cwd,
      detail: response.cwd
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
    const nextScope: ReviewDiffScope = files?.length ? "last-turn" : reviewScope;
    const nextLastTurnFiles = files?.length ? files : lastTurnReviewFiles;

    setInspectorOpen(true);
    setInspectorTab("review");
    setReviewScope(nextScope);

    if (files?.length) {
      setLastTurnReviewFilesOverride(files);
      setReviewDiff(reviewDiffFromFiles(files, currentCwd));
    }

    if (filePath) {
      setSelectedReviewPath(filePath);
    }

    await loadReviewDiff({
      scope: nextScope,
      filePath,
      fallbackFiles: nextScope === "last-turn" ? nextLastTurnFiles ?? undefined : undefined
    });
  }

  async function loadReviewDiff({
    scope = reviewScope,
    filePath,
    fallbackFiles,
    branchComparison,
    ignoreCachedGitAvailability = false
  }: {
    scope?: ReviewDiffScope;
    filePath?: string;
    fallbackFiles?: ReviewDiffFile[];
    branchComparison?: ReviewBranchComparison;
    ignoreCachedGitAvailability?: boolean;
  } = {}) {
    const cwd = currentCwd;
    const requestId = reviewRequestIdRef.current + 1;
    reviewRequestIdRef.current = requestId;
    const requestedBranchComparison =
      scope === "branch" ? branchComparison ?? reviewBranchComparison ?? undefined : undefined;
    const scopedFallbackFiles =
      scope === "last-turn"
        ? fallbackFiles ?? lastTurnReviewFiles ?? undefined
        : fallbackFiles;

    if (scope === "last-turn") {
      setReviewLoading(false);
      setReviewError(
        scopedFallbackFiles?.length
          ? null
          : "No last-turn changes are available for this thread."
      );
      const resolvedDiff = scopedFallbackFiles?.length
        ? reviewDiffFromFiles(scopedFallbackFiles, cwd)
        : null;

      setReviewDiff(resolvedDiff);
      setSelectedReviewPath((current) => {
        if (filePath) {
          return resolvedDiff?.files.find((file) => file.path === filePath)?.path ??
            resolvedDiff?.files[0]?.path ??
            filePath;
        }

        if (current && resolvedDiff?.files.some((file) => file.path === current)) {
          return current;
        }

        return null;
      });
      return;
    }

    if (workspaceGitAvailable === false && !ignoreCachedGitAvailability) {
      setReviewLoading(false);
      setReviewError(null);
      setReviewBranchComparison(null);
      setReviewDiff(cwd ? emptyReviewDiff(cwd, false) : null);
      setSelectedReviewPath(null);
      return;
    }

    if (!agentClient || !cwd) {
      setReviewDiff(scopedFallbackFiles ? reviewDiffFromFiles(scopedFallbackFiles, cwd) : null);
      setReviewError(
        scopedFallbackFiles
          ? null
          : "Review is available after the agent server connects."
      );
      setReviewLoading(false);
      return;
    }

    setReviewLoading(true);
    setReviewError(null);

    try {
      const nextDiff = await agentClient.loadReviewDiff({
        cwd,
        scope,
        filePath,
        filePaths: scopedFallbackFiles?.map((file) => file.path),
        branchHeadRef: requestedBranchComparison?.headRef,
        branchBaseRef: requestedBranchComparison?.baseRef
      });

      if (reviewRequestIdRef.current !== requestId) {
        return;
      }

      const resolvedDiff =
        nextDiff.files.length > 0 || !scopedFallbackFiles
          ? nextDiff
          : reviewDiffFromFiles(scopedFallbackFiles, cwd);
      setReviewDiff(resolvedDiff);
      setWorkspaceGitAvailable(nextDiff.gitAvailable === false ? false : true);
      if (scope === "branch" && resolvedDiff.comparison) {
        setReviewBranchComparison(resolvedDiff.comparison);
      }
      setSelectedReviewPath((current) => {
        if (filePath) {
          return resolvedDiff.files.find((file) => file.path === filePath)?.path ??
            resolvedDiff.files[0]?.path ??
            filePath;
        }

        if (current && resolvedDiff.files.some((file) => file.path === current)) {
          return current;
        }

        return null;
      });
    } catch (error) {
      if (reviewRequestIdRef.current !== requestId) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      if (isNonGitReviewError(message)) {
        setReviewError(null);
        setWorkspaceGitAvailable(false);
        setReviewBranchComparison(null);
        setReviewDiff(emptyReviewDiff(cwd, false));
        setSelectedReviewPath(null);
      } else {
        setReviewError(message);
        setReviewDiff(scopedFallbackFiles ? reviewDiffFromFiles(scopedFallbackFiles, cwd) : null);
      }
    } finally {
      if (reviewRequestIdRef.current === requestId) {
        setReviewLoading(false);
      }
    }
  }

  function applyReviewBranchData(data: ReviewBranchList) {
    setReviewBranchRefs(data.branches);
    setCurrentBranchRef(resolveCurrentBranchRef(data));
    setUncommittedCount(
      data.gitAvailable === false ? 0 : data.uncommittedCount ?? 0
    );
    setSelectedComposerBranchRef((current) =>
      resolveSelectedBranchRef(current, data)
    );
    setWorkspaceGitAvailable(data.gitAvailable !== false);
    setReviewBranchComparison((current) =>
      resolveBranchComparison(current, data)
    );
  }

  async function loadReviewBranches() {
    const requestId = ++reviewBranchRefsRequestIdRef.current;
    const cwd = currentCwd;

    if (!agentClient || !cwd) {
      if (reviewBranchRefsRequestIdRef.current !== requestId) {
        return;
      }

      setReviewBranchRefs([]);
      setCurrentBranchRef(null);
      setSelectedComposerBranchRef(null);
      setWorkspaceGitAvailable(null);
      setReviewBranchRefsError("Branches are available after the agent server connects.");
      setReviewBranchRefsLoading(false);
      return;
    }

    // Render any cached branches for this workspace immediately and refresh in
    // the background, so opening the dropdown never blocks on git/server I/O.
    const cached = reviewBranchRefsCacheRef.current.get(cwd);

    if (cached) {
      applyReviewBranchData(cached);
      setReviewBranchRefsError(null);
      setReviewBranchRefsLoading(false);
    } else {
      setReviewBranchRefsLoading(true);
      setReviewBranchRefsError(null);
    }

    try {
      const data = await agentClient.loadReviewBranches(cwd);

      if (reviewBranchRefsRequestIdRef.current !== requestId) {
        return;
      }

      reviewBranchRefsCacheRef.current.set(cwd, data);
      applyReviewBranchData(data);
      setReviewBranchRefsError(null);
    } catch (error) {
      if (reviewBranchRefsRequestIdRef.current !== requestId) {
        return;
      }

      // Keep showing cached branches if the background refresh failed.
      if (cached) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      setReviewBranchRefs([]);
      setCurrentBranchRef(null);
      setSelectedComposerBranchRef(null);
      setReviewBranchComparison(null);

      if (isNonGitReviewError(message)) {
        setWorkspaceGitAvailable(false);
        setReviewBranchRefsError(null);
      } else {
        setWorkspaceGitAvailable(false);
        setReviewBranchRefsError(message);
      }
    } finally {
      if (reviewBranchRefsRequestIdRef.current === requestId) {
        setReviewBranchRefsLoading(false);
      }
    }
  }

  async function selectComposerBranch(option: PromptComposerFooterOption) {
    const cwd = currentCwd;
    const previousSelected = selectedComposerBranchRef;
    const previousCurrent = currentBranchRef;

    // Block switching away from a branch with uncommitted changes.
    const blockedReason = blockedBranchSwitchReason(
      option.id,
      currentBranchRef,
      uncommittedCount
    );

    if (blockedReason) {
      pushAppError(blockedReason);
      return;
    }

    // Reflect the choice immediately so the footer feels responsive.
    setSelectedComposerBranchRef(option.id);
    setWorkspaceGitAvailable(true);
    setReviewBranchRefsError(null);

    // Without a connected agent/workspace there is nothing to switch yet; the
    // selection is applied when the session is created.
    if (!agentClient || !cwd || option.id === previousCurrent) {
      reviewBranchRefsRequestIdRef.current += 1;
      setReviewBranchRefsLoading(false);
      return;
    }

    // Switch the workspace to the chosen branch right away, surfacing any git
    // failure (e.g. the branch is checked out in another worktree).
    const requestId = ++reviewBranchRefsRequestIdRef.current;
    setReviewBranchRefsLoading(true);

    try {
      const data = await agentClient.checkoutBranch(cwd, option.id);

      if (reviewBranchRefsRequestIdRef.current !== requestId) {
        return;
      }

      reviewBranchRefsCacheRef.current.set(cwd, data);
      applyReviewBranchData(data);
    } catch (error) {
      if (reviewBranchRefsRequestIdRef.current !== requestId) {
        return;
      }

      // Revert the optimistic selection and surface the failure as a toast.
      setSelectedComposerBranchRef(previousSelected ?? previousCurrent ?? null);
      pushActionError("Failed to switch branch", error);
    } finally {
      if (reviewBranchRefsRequestIdRef.current === requestId) {
        setReviewBranchRefsLoading(false);
      }
    }
  }

  function showInspector(next: boolean) {
    if (!next) {
      setInspectorFullscreen(false);
      setInspectorOpen(false);
      return;
    }

    void openReview();
  }

  function selectReviewScope(scope: ReviewDiffScope) {
    setInspectorTab("review");
    setReviewScope(scope);
    setSelectedReviewPath(null);
    if (scope === "branch" && workspaceGitAvailable !== false) {
      void loadReviewBranches();
    }
    void loadReviewDiff({
      scope,
      fallbackFiles: scope === "last-turn" ? lastTurnReviewFiles ?? undefined : undefined
    });
  }

  function selectBranchComparison(branchComparison: ReviewBranchComparison) {
    setReviewBranchComparison(branchComparison);
    setSelectedReviewPath(null);
    void loadReviewDiff({ scope: "branch", branchComparison });
  }

  async function loadWorkspaceFiles(cwd = currentCwd) {
    if (!cwd) {
      setWorkspaceFiles([]);
      return;
    }

    const requestId = workspaceFilesRequestIdRef.current + 1;
    workspaceFilesRequestIdRef.current = requestId;
    setWorkspaceFilesLoading(true);
    setWorkspaceFilesError(null);

    try {
      if (!window.composer?.listWorkspaceFiles) {
        throw new Error("Workspace files are available in the desktop app.");
      }

      const files = await window.composer.listWorkspaceFiles(cwd);

      if (workspaceFilesRequestIdRef.current !== requestId) {
        return;
      }

      setWorkspaceFiles(files);
    } catch (error) {
      if (workspaceFilesRequestIdRef.current !== requestId) {
        return;
      }

      setWorkspaceFilesError(error instanceof Error ? error.message : String(error));
    } finally {
      if (workspaceFilesRequestIdRef.current === requestId) {
        setWorkspaceFilesLoading(false);
      }
    }
  }

  async function openFile(
    filePath: string,
    options: { recordHistory?: boolean } = {}
  ) {
    const recordHistory = options.recordHistory ?? true;

    setInspectorOpen(true);
    setFilePreviewTabOpen(true);
    setInspectorTab("file-preview");
    setFilePreviewTabs((current) =>
      current.includes(filePath) ? current : [...current, filePath]
    );

    if (recordHistory) {
      setFilePreviewHistory((current) => {
        if (current.paths[current.index] === filePath) {
          return current;
        }

        const nextPaths = current.paths
          .slice(0, current.index + 1)
          .filter((path) => path !== filePath);
        nextPaths.push(filePath);

        return {
          paths: nextPaths,
          index: nextPaths.length - 1
        };
      });
    }

    if (filePreview?.path === filePath && !filePreviewError) {
      setFilePreviewPath(filePath);
      return;
    }

    const requestId = filePreviewRequestIdRef.current + 1;
    filePreviewRequestIdRef.current = requestId;
    setFilePreviewPath(filePath);
    setFilePreviewError(null);
    setFilePreviewLoading(true);

    if (!workspaceFiles.length && !workspaceFilesLoading) {
      void loadWorkspaceFiles();
    }

    try {
      if (!window.composer?.readTextFile) {
        throw new Error("File preview is available in the desktop app.");
      }

      const nextPreview = await window.composer.readTextFile(filePath);

      if (filePreviewRequestIdRef.current !== requestId) {
        return;
      }

      setFilePreview(nextPreview);
    } catch (error) {
      if (filePreviewRequestIdRef.current !== requestId) {
        return;
      }

      setFilePreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      if (filePreviewRequestIdRef.current === requestId) {
        setFilePreviewLoading(false);
      }
    }
  }

  function navigateFilePreviewHistory(direction: -1 | 1) {
    const nextIndex = filePreviewHistory.index + direction;
    const nextPath = filePreviewHistory.paths[nextIndex];

    if (!nextPath) {
      return;
    }

    setFilePreviewHistory((current) => ({
      ...current,
      index: Math.max(0, Math.min(nextIndex, current.paths.length - 1))
    }));
    void openFile(nextPath, { recordHistory: false });
  }

  function selectInspectorTab(tab: InspectorPanelTab) {
    setInspectorOpen(true);
    setInspectorTab(tab);
    if (tab === "file-preview") {
      setFilePreviewTabOpen(true);
    }
  }

  function addFilePreviewTab() {
    setInspectorOpen(true);
    setFilePreviewTabOpen(true);
    setInspectorTab("file-preview");
    void loadWorkspaceFiles();
  }

  function closeFilePreviewTab(pathToClose = filePreviewPath ?? undefined) {
    if (!pathToClose) {
      closeAllFilePreviewTabs();
      return;
    }

    const nextTabs = filePreviewTabs.filter((path) => path !== pathToClose);
    const closingActiveFile = filePreviewPath === pathToClose;
    const closedTabIndex = filePreviewTabs.indexOf(pathToClose);
    const nextActivePath = closingActiveFile
      ? nextTabs[Math.min(Math.max(closedTabIndex, 0), nextTabs.length - 1)]
      : filePreviewPath;

    setFilePreviewTabs(nextTabs);
    setFilePreviewHistory((current) => {
      const paths = current.paths.filter((path) => path !== pathToClose);
      const index = nextActivePath ? paths.indexOf(nextActivePath) : -1;

      return {
        paths,
        index: index >= 0 ? index : Math.min(current.index, paths.length - 1)
      };
    });

    if (nextTabs.length === 0 || !nextActivePath) {
      closeAllFilePreviewTabs();
      return;
    }

    if (closingActiveFile) {
      void openFile(nextActivePath, { recordHistory: false });
    }
  }

  function closeAllFilePreviewTabs() {
    filePreviewRequestIdRef.current += 1;
    setInspectorTab("review");
    setFilePreviewTabOpen(false);
    setFilePreviewPath(null);
    setFilePreviewTabs([]);
    setFilePreviewHistory({ paths: [], index: -1 });
    setFilePreview(null);
    setFilePreviewError(null);
    setFilePreviewLoading(false);
  }

  // Stable handler identities so memoized children (Composer/Sidebar/etc.) can
  // bail out of re-rendering. Each wrapper always calls the latest closure, so
  // behavior is identical to calling the function declaration directly.
  const onSubmitStable = useStableCallback(() => void submitPrompt());
  const onStopStable = useStableCallback(() => void stopActiveRun());
  const onSteerQueuedStable = useStableCallback((queuedId: string) => {
    if (activeSession && agentClient) {
      void agentClient
        .steer(activeSession.id, queuedId)
        .catch((error) => console.warn("Could not steer queued message", error));
    }
  });
  const onCancelQueuedStable = useStableCallback((queuedId: string) => {
    if (activeSession && agentClient) {
      void agentClient
        .cancelQueuedMessage(activeSession.id, queuedId)
        .then((snapshot) => {
          if (snapshot) {
            setSessionSnapshot(snapshot);
          }
        })
        .catch((error) => console.warn("Could not cancel queued message", error));
    }
  });
  const onReorderQueuedStable = useStableCallback((orderedIds: string[]) => {
    if (activeSession && agentClient) {
      void agentClient
        .reorderQueue(activeSession.id, orderedIds)
        .then((snapshot) => {
          if (snapshot) {
            setSessionSnapshot(snapshot);
          }
        })
        .catch((error) => console.warn("Could not reorder queue", error));
    }
  });
  // Unqueue a message back into the composer for editing: pop it from the queue
  // and load its text into the draft (appending if a draft is already in flight).
  const onEditQueuedStable = useStableCallback((queuedId: string, body: string) => {
    if (!activeSession || !agentClient) {
      return;
    }
    setPrompt((current) =>
      current.trim().length > 0 ? `${current}\n\n${body}` : body
    );
    void agentClient
      .cancelQueuedMessage(activeSession.id, queuedId)
      .then((snapshot) => {
        if (snapshot) {
          setSessionSnapshot(snapshot);
        }
      })
      .catch((error) => console.warn("Could not unqueue message", error));
  });
  const onAddImageAttachmentsStable = useStableCallback((files: File[]) =>
    addImageAttachments(files)
  );
  const onRemoveImageAttachmentStable = useStableCallback((id: string) =>
    removeImageAttachment(id)
  );
  const onRemoveReviewCommentAttachmentStable = useStableCallback(
    (id: string) => removeReviewCommentAttachment(id)
  );
  const onResolveApprovalStable = useStableCallback(
    (approvalId: string, decision: ApprovalDecision) =>
      resolveApproval(approvalId, decision)
  );
  const onAnswerQuestionStable = useStableCallback(
    (questionId: string, answers: QuestionAnswer[]) =>
      answerQuestion(questionId, answers)
  );
  const selectComposerBranchStable = useStableCallback(
    (option: PromptComposerFooterOption) => void selectComposerBranch(option)
  );
  const loadReviewBranchesStable = useStableCallback(
    () => void loadReviewBranches()
  );
  const setNewSessionWorkTargetLocal = useStableCallback(() =>
    setNewSessionWorkTarget("local")
  );
  const setNewSessionWorkTargetWorktree = useStableCallback(() =>
    setNewSessionWorkTarget("worktree")
  );
  const onAdoptParallelThreadStable = useStableCallback(
    (delegateProvider: DelegateSessionProvider) =>
      void adoptParallelThread(delegateProvider)
  );
  const onOpenFileStable = useStableCallback(
    (filePath: string, options?: { recordHistory?: boolean }) =>
      void openFile(filePath, options ?? {})
  );
  const onReviewChangesStable = useStableCallback(
    (request?: { filePath?: string; files?: ReviewDiffFile[] }) =>
      void openReview(request ?? {})
  );

  const parallelAdoption = useMemo(
    () => ({
      required: activeSessionNeedsParallelAdoption,
      selectedProvider: activeSession?.parallelAdoptedProvider,
      onAdopt: onAdoptParallelThreadStable
    }),
    [
      activeSession?.parallelAdoptedProvider,
      activeSessionNeedsParallelAdoption,
      onAdoptParallelThreadStable
    ]
  );

  const branchFooterOptions = useMemo<PromptComposerFooterOption[]>(
    () =>
      reviewBranchRefs
        .filter((branch) => branch.kind === "local")
        .map((branch) => ({
          id: branch.name,
          label: branch.name,
          detail:
            branch.name === currentBranchRef
              ? describeUncommitted(uncommittedCount)
              : undefined
        })),
    [reviewBranchRefs, currentBranchRef, uncommittedCount]
  );
  const branchFooterLabel =
    workspaceGitAvailable === false
      ? "No branch"
      : selectedComposerBranchRef ?? currentBranchRef ?? "Branch";
  const sessionBranchFooterItem = useMemo<PromptComposerFooterItem>(
    () => ({
      icon: GitBranch,
      optionIcon: GitBranch,
      label: branchFooterLabel,
      options: branchFooterOptions,
      selectedOptionId:
        selectedComposerBranchRef ?? currentBranchRef ?? undefined,
      searchPlaceholder: "Search branches",
      showOptionDetails: true,
      emptyLabel:
        workspaceGitAvailable === false
          ? "This folder is not a git repository"
          : "No local branches found",
      loading: reviewBranchRefsLoading && workspaceGitAvailable !== false,
      error:
        workspaceGitAvailable === false
          ? "This folder is not a git repository."
          : reviewBranchRefsError,
      menuPlacement: "up",
      onSelect: selectComposerBranchStable,
      onOpen: loadReviewBranchesStable
    }),
    [
      branchFooterLabel,
      branchFooterOptions,
      currentBranchRef,
      loadReviewBranchesStable,
      reviewBranchRefsError,
      reviewBranchRefsLoading,
      selectComposerBranchStable,
      selectedComposerBranchRef,
      workspaceGitAvailable
    ]
  );
  const newSessionBranchFooterItem = useMemo<PromptComposerFooterItem>(
    () => ({
      ...sessionBranchFooterItem,
      menuPlacement: "down"
    }),
    [sessionBranchFooterItem]
  );
  const newSessionWorkTargetFooterItem = useMemo<PromptComposerFooterItem>(
    () => ({
      icon:
        resolvedNewSessionWorkTarget === "worktree"
          ? GitPullRequestCreateArrow
          : Laptop,
      label:
        resolvedNewSessionWorkTarget === "worktree"
          ? "New worktree"
          : "Work locally",
      menuTitle: "Start in",
      menuPlacement: "down",
      menuItems: [
        {
          icon: Laptop,
          label: "Work locally",
          checked: resolvedNewSessionWorkTarget === "local",
          onSelect: setNewSessionWorkTargetLocal
        },
        {
          icon: GitPullRequestCreateArrow,
          label: "New worktree",
          checked: resolvedNewSessionWorkTarget === "worktree",
          disabled: workspaceGitAvailable === false,
          onSelect: setNewSessionWorkTargetWorktree
        }
      ]
    }),
    [
      resolvedNewSessionWorkTarget,
      setNewSessionWorkTargetLocal,
      setNewSessionWorkTargetWorktree,
      workspaceGitAvailable
    ]
  );

  const composerApprovals = useMemo(
    () =>
      approvals.filter((approval) =>
        activeSession ? approval.sessionId === activeSession.id : true
      ),
    [approvals, activeSession]
  );

  const composerControls = useMemo<PromptComposerControls>(
    () => ({
      permission,
      setPermission,
      model: activeModel,
      setModel: setActiveModel,
      composeAgentModels: {
        codex: modelByProvider.codex,
        claude: modelByProvider.claude
      },
      setComposeAgentModel: setModelForProvider,
      intelligence: activeIntelligence,
      setIntelligence: setActiveIntelligence,
      composeAgentIntelligence: {
        codex: intelligenceByProvider.codex,
        claude: intelligenceByProvider.claude
      },
      setComposeAgentIntelligence: setIntelligenceForProvider,
      permissionOpen,
      setPermissionOpen,
      intelligenceOpen,
      setIntelligenceOpen,
      permissionMenuId: "composer-permission-menu",
      intelligenceMenuId: "composer-intelligence-menu",
      provider: activeProvider,
      setProvider: setComposerProvider,
      // value/setValue intentionally omitted: Composer reads the draft text
      // from useComposerStore itself so keystrokes don't re-render App.
      onSubmit: onSubmitStable,
      onStop: onStopStable,
      submitMode,
      // The empty-prompt portion of the disabled check is evaluated inside
      // Composer (which subscribes to the prompt). App only contributes the
      // parts that don't depend on per-keystroke prompt text.
      submitDisabled: submitMode === "send" && activeSessionNeedsParallelAdoption,
      disabled: sessionsLoading,
      requireNonEmptyPrompt:
        submitMode === "send" && reviewCommentAttachments.length === 0,
      imageAttachments,
      reviewCommentAttachments,
      onAddImageAttachments: onAddImageAttachmentsStable,
      onRemoveImageAttachment: onRemoveImageAttachmentStable,
      onRemoveReviewCommentAttachment: onRemoveReviewCommentAttachmentStable,
      approvals: composerApprovals,
      onResolveApproval: onResolveApprovalStable,
      queuedMessages: activeSessionQueuedMessages,
      onSteerQueued: onSteerQueuedStable,
      onCancelQueued: onCancelQueuedStable,
      onReorderQueued: onReorderQueuedStable,
      onEditQueued: onEditQueuedStable,
      pendingQuestion: activeSession?.pendingQuestion,
      onAnswerQuestion: onAnswerQuestionStable,
      branchFooterItem: sessionBranchFooterItem
    }),
    [
      activeIntelligence,
      activeModel,
      activeProvider,
      activeSession?.pendingQuestion,
      activeSessionNeedsParallelAdoption,
      activeSessionQueuedMessages,
      composerApprovals,
      onAnswerQuestionStable,
      onCancelQueuedStable,
      onEditQueuedStable,
      onReorderQueuedStable,
      onSteerQueuedStable,
      imageAttachments,
      intelligenceByProvider.claude,
      intelligenceByProvider.codex,
      intelligenceOpen,
      modelByProvider.claude,
      modelByProvider.codex,
      onAddImageAttachmentsStable,
      onRemoveImageAttachmentStable,
      onRemoveReviewCommentAttachmentStable,
      onResolveApprovalStable,
      onStopStable,
      onSubmitStable,
      permission,
      permissionOpen,
      reviewCommentAttachments,
      sessionBranchFooterItem,
      setActiveIntelligence,
      setActiveModel,
      setIntelligenceForProvider,
      setIntelligenceOpen,
      setModelForProvider,
      setPermission,
      setPermissionOpen,
      setComposerProvider,
      sessionsLoading,
      submitMode
    ]
  );

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
      className={cn(
        "relative grid h-screen min-h-0 overflow-hidden text-app-text motion-reduce:transition-none",
        // Glass on: the shell is transparent so the native window vibrancy shows
        // through the sidebar column; <main> below re-asserts the opaque surface
        // so only the sidebar reads as glass. Off: the shell carries the surface.
        liquidGlass ? "bg-transparent" : "bg-app-shell",
        sidebarResizing
          ? "transition-none"
          : "transition-[grid-template-columns] duration-[220ms] ease-in-out"
      )}
      style={
        {
          gridTemplateColumns: sidebarOpen
            ? "var(--sidebar-width) minmax(0, 1fr)"
            : "0 minmax(0, 1fr)",
          "--sidebar-width": `${sidebarWidth}px`,
          "--review-content-width": `${reviewContentWidth}px`
        } as CSSProperties
      }
    >
      <Sidebar
        open={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        projects={projects}
        activeNav={activeNav}
        newSessionActive={newSessionPageActive}
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

      <div
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={minSidebarWidth}
        aria-valuemax={maxSidebarWidth}
        aria-valuenow={sidebarWidth}
        tabIndex={sidebarOpen ? 0 : -1}
        className={cn(
          "app-no-drag group/sidebar-resize absolute inset-y-0 z-30 w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70 motion-reduce:transition-none max-[900px]:hidden",
          sidebarResizing
            ? "transition-none"
            : "transition-[left,opacity] duration-[220ms] ease-in-out",
          !sidebarOpen && "pointer-events-none opacity-0"
        )}
        style={{ left: sidebarOpen ? "var(--sidebar-width)" : 0 }}
        onPointerDown={startSidebarResize}
        onKeyDown={resizeSidebarWithKeyboard}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-app-line-strong transition-colors group-hover/sidebar-resize:bg-app-accent/55" />
      </div>

      <main
        className={cn(
          "relative grid min-h-0 min-w-0 overflow-hidden motion-reduce:transition-none",
          // Opaque content surface — re-established here so the transparent shell
          // (glass mode) only reveals vibrancy under the sidebar, not the content.
          liquidGlass && "bg-app-shell",
          inspectorResizing
            ? "transition-none"
            : "transition-[grid-template-columns] duration-[220ms] ease-in-out",
          !inspectorOpen && !inspectorResizing && "duration-150"
        )}
        style={{
          gridTemplateColumns: inspectorOpen
            ? inspectorFullscreen
              ? "0 minmax(0, 1fr)"
              : "minmax(0, 1fr) var(--review-content-width)"
            : "minmax(0, 1fr) 0"
        }}
      >
        <section
          className={cn(
            "grid min-h-0 min-w-0 grid-rows-[44px_minmax(0,1fr)] overflow-hidden",
            inspectorFullscreen && "invisible pointer-events-none"
          )}
          aria-hidden={inspectorFullscreen}
        >
          {!inspectorFullscreen && (
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
                      {activeSession ? (
                        <ConversationTitleMenu
                          title={activeSession.title ?? workspaceName}
                          onRename={(value) =>
                            void renameThread(activeSession.id, value)
                          }
                          onArchive={() => void archiveThread(activeSession.id)}
                          onCopyTranscript={() =>
                            void copyToClipboard(
                              conversationToMarkdown(activeSession),
                              "Copied transcript"
                            )
                          }
                          onCopyTitle={() =>
                            void copyToClipboard(
                              activeSession.title ?? workspaceName,
                              "Copied title"
                            )
                          }
                          onOpenInNewWindow={
                            window.composer?.openSessionWindow
                              ? () => openSessionInNewWindow(activeSession.id)
                              : undefined
                          }
                        />
                      ) : (
                        <span className="max-w-[220px] truncate">
                          {workspaceName}
                        </span>
                      )}
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
          )}

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
                transcriptLoading={
                  !activeSession.contentLoaded &&
                  loadingSessionIds.has(activeSession.id)
                }
                composer={composerControls}
                parallelAdoption={parallelAdoption}
                handoffSummaries={activeSession.handoffSummaries}
                onOpenFile={onOpenFileStable}
                onReviewChanges={onReviewChangesStable}
              />
            ) : (
              <NewSessionPage
                workspaceName={workspaceName}
                composer={composerControls}
                workspaceOptions={allWorkspaceOptions}
                selectedWorkspaceId={selectedWorkspace?.id}
                workTargetFooterItem={newSessionWorkTargetFooterItem}
                branchFooterItem={newSessionBranchFooterItem}
                onWorkspaceSelect={(option) => {
                  setSelectedWorkspaceId(option.id);
                  setSelectedThread("");
                  setActiveNav("New session");
                  navigateAppRoute("/new");
                }}
                onWorkspaceCreate={createWorkspace}
                onWorkspaceUseExistingFolder={useExistingWorkspaceFolder}
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
            (!inspectorOpen || inspectorFullscreen) && "pointer-events-none opacity-0"
          )}
          style={{ right: inspectorOpen ? "var(--review-content-width)" : 0 }}
          onPointerDown={startInspectorResize}
          onKeyDown={resizeInspectorWithKeyboard}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-app-line-strong transition-colors group-hover/resize:bg-app-accent/55" />
        </div>

        {inspectorFullscreen && !sidebarOpen && (
          <AppChrome
            className="pointer-events-auto absolute left-0 top-0 z-40 h-11 w-[210px] [--app-titlebar-control-left-inset:84px]"
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
            centerSlot={<span aria-hidden="true" />}
            rightSlot={<span aria-hidden="true" />}
          />
        )}

        <ReviewPanel
          open={inspectorOpen}
          present={inspectorOpen}
          activeTab={inspectorTab}
          review={reviewDiff}
          reviewScope={reviewScope}
          lastTurnAvailable={Boolean(lastTurnReviewFiles?.length)}
          reviewLoading={reviewLoading}
          reviewError={reviewError}
          branchRefs={reviewBranchRefs}
          branchRefsLoading={reviewBranchRefsLoading}
          branchRefsError={reviewBranchRefsError}
          branchComparison={reviewBranchComparison}
          reviewComments={reviewCommentAttachments}
          selectedReviewPath={selectedReviewPath}
          filePreviewTabOpen={filePreviewTabOpen}
          filePreviewPath={filePreviewPath}
          filePreview={filePreview}
          filePreviewError={filePreviewError}
          filePreviewLoading={filePreviewLoading}
          filePreviewTabs={filePreviewTabs}
          canNavigateFilePreviewBack={filePreviewHistory.index > 0}
          canNavigateFilePreviewForward={
            filePreviewHistory.index >= 0 &&
            filePreviewHistory.index < filePreviewHistory.paths.length - 1
          }
          workspaceCwd={currentCwd}
          workspaceName={workspaceName}
          workspaceFiles={workspaceFiles}
          workspaceFilesLoading={workspaceFilesLoading}
          workspaceFilesError={workspaceFilesError}
          fullscreen={inspectorFullscreen}
          reserveTitlebarControls={inspectorFullscreen && !sidebarOpen}
          onTabChange={selectInspectorTab}
          onAddFilePreviewTab={addFilePreviewTab}
          onCloseFilePreviewTab={closeFilePreviewTab}
          onNavigateFilePreviewHistory={navigateFilePreviewHistory}
          onOpenFile={openFile}
          onReviewScopeChange={selectReviewScope}
          onBranchComparisonChange={selectBranchComparison}
          onAddReviewComment={addReviewCommentAttachment}
          onRefreshReview={() => void loadReviewDiff({ scope: reviewScope })}
          onToggleFullscreen={() => setInspectorFullscreen((value) => !value)}
          onClose={() => {
            setInspectorFullscreen(false);
            setInspectorOpen(false);
          }}
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
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
      <CreateProjectModal
        open={createProjectModalOpen}
        initialName={createProjectInitialName}
        loading={createProjectLoading}
        error={createProjectError}
        onClose={() => {
          if (!createProjectLoading) {
            setCreateProjectModalOpen(false);
          }
        }}
        onSubmit={(projectName) => void submitCreateWorkspace(projectName)}
      />
    </div>
  );
}

function CreateProjectModal({
  open,
  initialName,
  loading,
  error,
  onClose,
  onSubmit
}: {
  open: boolean;
  initialName: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (projectName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [projectName, setProjectName] = useState(initialName);
  const canCreate = projectName.trim().length > 0 && !loading;

  useEffect(() => {
    if (!open) {
      return;
    }

    setProjectName(initialName);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [initialName, loading, onClose, open]);

  if (!open) {
    return null;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate) {
      return;
    }

    onSubmit(projectName.trim());
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-app-bg/72 px-4 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <form
        aria-label="Create project"
        aria-modal="true"
        className="relative w-full max-w-[420px] rounded-[18px] border border-app-line bg-app-panel-2 p-5 text-app-text shadow-[0_28px_90px_color-mix(in_srgb,var(--color-app-bg)_55%,transparent)]"
        role="dialog"
        onSubmit={submit}
      >
        <button
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg text-app-dim transition-colors hover:bg-app-text/[0.08] hover:text-app-text disabled:cursor-not-allowed disabled:opacity-45"
          type="button"
          aria-label="Close create project"
          disabled={loading}
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <h2 className="pr-8 text-[20px] font-semibold tracking-tight">
          Create project
        </h2>
        <p className="mt-1 text-[14px] leading-5 text-app-dim">
          Name the project folder Composer should create.
        </p>

        <label className="mt-5 grid gap-2 text-[13px] font-medium text-app-muted">
          Project name
          <input
            ref={inputRef}
            className="h-11 rounded-xl border border-app-line bg-app-bg/35 px-3 text-[14px] font-normal text-app-text outline-none placeholder:text-app-dim focus:border-[color:color-mix(in_srgb,var(--color-app-orange)_58%,transparent)]"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="my-new-project"
            disabled={loading}
          />
        </label>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-[14px] text-app-muted transition-colors hover:bg-app-text/[0.08] hover:text-app-text disabled:cursor-not-allowed disabled:opacity-45"
            type="button"
            disabled={loading}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-lg bg-app-text px-4 text-[14px] font-medium text-app-bg transition-colors hover:bg-app-text/90 disabled:cursor-not-allowed disabled:opacity-45"
            type="submit"
            disabled={!canCreate}
          >
            {loading ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FeedbackModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [includeLogs, setIncludeLogs] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [sent, setSent] = useState(false);
  const canSend = message.trim().length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    setSent(false);
    const frame = requestAnimationFrame(() => textareaRef.current?.focus());

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  function submitFeedback() {
    if (!canSend) {
      return;
    }

    console.info("[feedback]", {
      message,
      includeLogs,
      attachments: files.map((file) => file.name)
    });
    setSent(true);
    setMessage("");
    setIncludeLogs(false);
    setFiles([]);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-app-bg/72 px-4 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-label="Feedback"
        aria-modal="true"
        className="relative w-full max-w-[620px] rounded-[18px] border border-app-line bg-app-panel-2 p-6 text-app-text shadow-[0_28px_90px_color-mix(in_srgb,var(--color-app-bg)_55%,transparent)]"
        role="dialog"
      >
        <button
          className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-lg text-app-dim transition-colors hover:bg-app-text/[0.08] hover:text-app-text"
          type="button"
          aria-label="Close feedback"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <div className="pointer-events-none absolute inset-x-0 top-4 -z-0 flex justify-center overflow-hidden opacity-[0.045]">
          <div className="font-mono text-[86px] font-semibold uppercase tracking-[0.08em]">
            Composer
          </div>
        </div>

        <div className="relative z-10">
          <h2 className="text-[22px] font-semibold tracking-tight">Feedback</h2>
          <p className="mt-1 text-[14px] text-app-dim">
            You can also reach us at atemjohn@stanford.edu
          </p>

          <label className="mt-6 grid gap-2 text-[14px] font-medium text-app-muted">
            Message
            <textarea
              ref={textareaRef}
              className="min-h-[150px] resize-none rounded-xl border border-app-line bg-app-bg/30 p-3 text-[14px] font-normal leading-6 text-app-text outline-none placeholder:text-app-dim focus:border-[color:color-mix(in_srgb,var(--color-app-orange)_58%,transparent)]"
              placeholder="Tell us about your experience, bugs you've found, or features you'd like to see..."
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setSent(false);
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submitFeedback();
                }
              }}
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-app-dim">
            <label className="flex min-w-0 items-center gap-2">
              <input
                className="size-4 rounded border-app-line bg-app-bg accent-app-accent"
                type="checkbox"
                checked={includeLogs}
                onChange={(event) => setIncludeLogs(event.target.checked)}
              />
              <span>Include recent app logs (may include personal data)</span>
            </label>
            <button
              className="text-app-muted transition-colors hover:text-app-text"
              type="button"
            >
              View
            </button>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  setFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
              <button
                className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] text-app-muted transition-colors hover:bg-app-text/[0.08] hover:text-app-text"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={15} />
                Attach images
              </button>
              {files.length > 0 && (
                <span className="max-w-[220px] truncate text-[13px] text-app-dim">
                  {files.map((file) => file.name).join(", ")}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {sent && (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-app-muted">
                  <Check size={14} />
                  Feedback noted
                </span>
              )}
              <button
                className="inline-flex h-9 items-center justify-center rounded-lg bg-app-text px-4 text-[14px] font-medium text-app-bg transition-colors hover:bg-app-text/90 disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                disabled={!canSend}
                onClick={submitFeedback}
              >
                Send feedback ⌘↵
              </button>
            </div>
          </div>
        </div>
      </section>
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
    isCompareAgentsModel(session.model) &&
    // Only offer adoption once the parallel run has stopped (completed or
    // interrupted) — not mid-stream — matching the CLI's gate.
    session.runtimeStatus !== "running" &&
    Boolean(session.providerSessions?.codex?.sessionId) &&
    Boolean(session.providerSessions?.claude?.sessionId) &&
    !session.parallelAdoptedProvider
  );
}

function isCompareAgentsModel(model?: string) {
  return model === "Compare agents" || model === "Codex + Claude parallel";
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

const emptyConversationItems: ConversationItem[] = [];
const emptyQueuedMessages: QueuedUserMessage[] = [];

// Distinct, order-preserving list of session cwds. Used (shallow-compared) to
// derive workspace options without depending on the whole sessions map.
function collectSessionWorkspaceCwds(
  sessions: Record<string, SessionContent>
): string[] {
  const seen = new Set<string>();
  const cwds: string[] = [];

  for (const session of Object.values(sessions)) {
    if (session.cwd && !seen.has(session.cwd)) {
      seen.add(session.cwd);
      cwds.push(session.cwd);
    }
  }

  return cwds;
}

function workspaceOptionsFromCwds(cwds: string[]) {
  return cwds.map((cwd) => ({
    id: cwd,
    label: basename(cwd),
    cwd,
    detail: cwd
  }));
}

function sessionComposerPromptScope(sessionId: string) {
  return `session:${sessionId}`;
}

function collectRunningSessionIds(
  sessions: Record<string, SessionContent>
): Set<string> {
  const ids = new Set<string>();

  for (const session of Object.values(sessions)) {
    if (isSessionRunning(session)) {
      ids.add(session.id);
    }
  }

  return ids;
}

function latestReviewFilesFromItems(items: ConversationItem[]): ReviewDiffFile[] | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item.type === "tool_group") {
      for (let detailIndex = item.details.length - 1; detailIndex >= 0; detailIndex -= 1) {
        const reviewFiles = item.details[detailIndex].reviewFiles;

        if (reviewFiles?.length) {
          return reviewFiles;
        }
      }
      continue;
    }

    if (item.type === "assistant_message") {
      const attachments = item.attachments ?? [];

      for (let attachmentIndex = attachments.length - 1; attachmentIndex >= 0; attachmentIndex -= 1) {
        const attachment = attachments[attachmentIndex];

        if (attachment.type === "file_change_summary" && attachment.files.length) {
          return attachment.files.map(fileChangeRowToReviewFile);
        }
      }
      continue;
    }

    if (item.type === "file_change_summary" && item.files.length) {
      return item.files.map(fileChangeRowToReviewFile);
    }

    if (item.type === "parallel_thread_group") {
      for (let columnIndex = item.columns.length - 1; columnIndex >= 0; columnIndex -= 1) {
        const reviewFiles = latestReviewFilesFromItems(item.columns[columnIndex].items);

        if (reviewFiles?.length) {
          return reviewFiles;
        }
      }
    }
  }

  return null;
}

function fileChangeRowToReviewFile(file: FileChangeRow): ReviewDiffFile {
  return {
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    hunks: []
  };
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

function emptyReviewDiff(cwd: string, gitAvailable: boolean): ReviewDiff {
  return {
    cwd,
    generatedAt: new Date().toISOString(),
    files: [],
    additions: 0,
    deletions: 0,
    raw: "",
    gitAvailable
  };
}

function isNonGitReviewError(message: string) {
  return (
    /not a git repository|not a git repo|outside work tree|not a git worktree/i.test(
      message
    ) ||
    /git diff --no-index/i.test(message) ||
    /unknown option [`']cached[`']/i.test(message)
  );
}

function appendErrorMessage(
  sessions: Record<string, SessionContent>,
  sessionId: string | undefined,
  prompt: string,
  provider: SessionProvider,
  error: string,
  errorSessionId?: string
): Record<string, SessionContent> {
  if (!sessionId || !sessions[sessionId]) {
    const id = errorSessionId ?? `${provider}-error-${createId()}`;

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
      flattenProjectThreads(project.threads).some(
        (thread) => thread.id === selectedThread
      )
    ) ??
    projects[0];

  const tabs = workspaceProject
    ? flattenProjectThreads(workspaceProject.threads)
        .filter((thread) => threadMatchesProviderFilter(thread, providerFilter))
        .map((thread) => threadToTab(workspaceProject, thread, runningSessionIds))
    : [];

  if (!selectedThread || tabs.some((thread) => thread.id === selectedThread)) {
    return tabs;
  }

  const activeThread = projects
    .flatMap((project) =>
      flattenProjectThreads(project.threads)
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

function flattenProjectThreads(threads: ProjectThread[]): ProjectThread[] {
  return threads.flatMap((thread) => [
    thread,
    ...flattenProjectThreads(thread.children ?? [])
  ]);
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

// Serialize a conversation to a portable Markdown transcript for the "Copy"
// menu. Messages become headed sections; tool groups and parallel threads are
// summarized so the copy stays readable rather than dumping raw tool detail.
function conversationItemsToMarkdown(
  items: ConversationItem[],
  lines: string[]
) {
  for (const item of items) {
    if (item.type === "user_message") {
      lines.push("## You", "", item.body.trim(), "");
    } else if (item.type === "assistant_message") {
      const author = item.provider ? providerLabel(item.provider) : "Assistant";
      lines.push(`## ${author}`, "", item.body.trim(), "");
    } else if (item.type === "tool_group") {
      lines.push(`> 🔧 ${item.summary}`, "");
    } else if (item.type === "parallel_thread_group") {
      for (const column of item.columns) {
        lines.push(`### ${column.title}`, "");
        conversationItemsToMarkdown(column.items, lines);
      }
    }
  }
}

function conversationToMarkdown(session: SessionContent): string {
  const lines: string[] = [`# ${session.title}`, ""];
  conversationItemsToMarkdown(session.items, lines);
  return `${lines.join("\n").trim()}\n`;
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

function fileToAttachment(id: string, file: File): ComposerImageAttachment {
  // Cheap, synchronous preview via an object URL. The expensive base64 encode
  // is deferred to submit time (see readFileAsDataUrl).
  return {
    id,
    name: file.name,
    mediaType: file.type || "image/png",
    previewUrl: URL.createObjectURL(file)
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ""));
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

// Returns a referentially-stable function that always invokes the latest
// version of `callback`. Lets us pass handlers to memoized children without
// re-deriving exhaustive dependency lists for each (which would risk stale
// closures and behavior changes).
function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result {
  const callbackRef = useRef(callback);

  useInsertionEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args: Args) => callbackRef.current(...args), []);
}
