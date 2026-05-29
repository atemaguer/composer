import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createRuntimeProviders } from "./provider-factories.js";
import {
  noopRuntimePersistence,
  type RuntimePersistence,
  type RuntimeSessionVisibilityAction
} from "./runtime-persistence.js";
import {
  checkoutSessionBranch,
  createSessionWorktree,
  type SessionWorktree
} from "./session-worktrees.js";
import {
  isRuntimeProviderId,
  providerModelDisplayLabel,
  providerStatusLabel
} from "@composer/client";
import type {
  AgentSettings,
  AgentImageAttachment,
  ApprovalDecision,
  ApprovalRequest,
  ConversationItem,
  DelegateSessionProvider,
  LiveAgentEvent,
  Project,
  ProjectThread,
  SessionContent,
  SessionCompactionSummary,
  SessionProvider,
  SessionSnapshot,
  ToolDetail
} from "@composer/client";

export type EventSink = (event: LiveAgentEvent) => void;

type RunRequest = {
  sessionId: string;
  provider?: SessionProvider;
  prompt: string;
  cwd?: string;
  settings: AgentSettings;
  imageAttachments?: AgentImageAttachment[];
  requestId?: string;
};

type CreateRequest = {
  provider: SessionProvider;
  prompt: string;
  cwd: string;
  settings: AgentSettings;
  imageAttachments?: AgentImageAttachment[];
  requestId?: string;
  workTarget?: {
    mode: "local" | "worktree";
    branch?: string;
  };
};

type ProviderRunRequest = RunRequest & {
  session: SessionContent;
  contextPrompt?: string;
  askApproval: (approval: Omit<ApprovalRequest, "id">) => Promise<ApprovalDecision>;
  emit: EventSink;
  phase?: "plan" | "execute";
};

type ProviderCompactRequest = {
  sessionId: string;
  session: SessionContent;
  settings: AgentSettings;
  reason: string;
  emit: EventSink;
};

export interface AgentProvider {
  run(request: ProviderRunRequest): Promise<void>;
  compact?(request: ProviderCompactRequest): Promise<SessionCompactionSummary | undefined>;
  interrupt(sessionId: string): Promise<void>;
  dispose(): Promise<void> | void;
}

type ApprovalResolver = (decision: ApprovalDecision) => void;
type RuntimeSessionProvider = SessionProvider;

export type AgentRuntimeOptions = {
  persistence?: RuntimePersistence;
  providers?: Partial<Record<RuntimeSessionProvider, AgentProvider>>;
  loadSessionContent?: (
    sessionId: string
  ) => SessionContent | undefined | Promise<SessionContent | undefined>;
  loadSessionList?: () => SessionSnapshot | Promise<SessionSnapshot>;
  localSessionPollIntervalMs?: number;
};

type RestoredRuntimeSessions = {
  sessions: Record<string, SessionContent>;
  staleSessions: SessionContent[];
};

function restoreRuntimeSessions(
  sessions: Record<string, SessionContent>
): RestoredRuntimeSessions {
  const staleSessions: SessionContent[] = [];
  const restored = Object.fromEntries(
    Object.entries(sessions).map(([id, session]) => {
      const normalized = restoreRuntimeSession(session);

      if (normalized !== session) {
        staleSessions.push(normalized);
      }

      return [id, normalized];
    })
  );

  return { sessions: restored, staleSessions };
}

function restoreRuntimeSession(session: SessionContent): SessionContent {
  const pendingItems = session.pendingItems ?? [];
  const runtimeStatus = session.runtimeStatus ?? "idle";
  const hasStaleRuntimeState =
    pendingItems.length > 0 ||
    runtimeStatus === "running" ||
    runtimeStatus === "awaiting_approval";

  if (!hasStaleRuntimeState) {
    return {
      ...session,
      items: session.items ?? [],
      providerSessions: session.providerSessions ?? {},
      pendingItems,
      runtimeStatus,
      contentLoaded: session.contentLoaded ?? true
    };
  }

  return {
    ...session,
    items: session.items ?? [],
    providerSessions: session.providerSessions ?? {},
    pendingItems: [],
    runtimeStatus:
      runtimeStatus === "running" || runtimeStatus === "awaiting_approval"
        ? "idle"
        : runtimeStatus,
    contentLoaded: session.contentLoaded ?? true
  };
}

export class AgentRuntime {
  private sessions: Record<string, SessionContent>;
  private readonly loadSessionContentFromStore?: (
    sessionId: string
  ) => SessionContent | undefined | Promise<SessionContent | undefined>;
  private readonly loadSessionListFromStore?: () =>
    | SessionSnapshot
    | Promise<SessionSnapshot>;
  private readonly localSessionPollIntervalMs: number;
  private broadcastListeners = new Set<EventSink>();
  private approvals = new Map<string, ApprovalResolver>();
  private providers: Record<RuntimeSessionProvider, AgentProvider>;
  private activeRuns = new Map<string, Promise<void>>();
  private activeRunProviders = new Map<string, RuntimeSessionProvider>();
  private requestSessions = new Map<string, string>();
  private interruptedRequestIds = new Set<string>();
  private interruptedSessions = new Set<string>();
  private localSessionMonitor?: ReturnType<typeof setInterval>;
  private localSessionMonitorRunning = false;
  private monitoredParentSessionIds = new Set<string>();
  private localSessionFingerprints = new Map<string, string>();
  private localSubagentSourceFingerprints = new Map<string, string>();
  private persistence: RuntimePersistence;

  constructor(snapshot: SessionSnapshot, options: AgentRuntimeOptions = {}) {
    const restored = restoreRuntimeSessions(snapshot.sessions);

    this.sessions = restored.sessions;
    this.persistence = options.persistence ?? noopRuntimePersistence;
    this.loadSessionContentFromStore = options.loadSessionContent;
    this.loadSessionListFromStore = options.loadSessionList;
    this.localSessionPollIntervalMs = options.localSessionPollIntervalMs ?? 1_000;
    this.providers = createRuntimeProviders({ persistence: this.persistence });
    Object.assign(this.providers, options.providers);

    for (const session of restored.staleSessions) {
      try {
        this.persistence.upsertSession(session);
      } catch (error) {
        console.warn("Could not persist restored session state", error);
      }
    }
  }

  snapshot(): SessionSnapshot {
    return {
      sessions: this.sessions,
      projects: buildProjects(this.sessions)
    };
  }

  async loadSessionContent(sessionId: string) {
    const current = this.sessions[sessionId];

    if (current?.contentLoaded) {
      return current;
    }

    const loaded = await this.loadSessionContentFromStore?.(sessionId);

    if (!loaded) {
      return current;
    }

    const restored = restoreRuntimeSession({
      ...loaded,
      runtimeStatus: current?.runtimeStatus ?? loaded.runtimeStatus,
      pendingItems: current?.pendingItems?.length
        ? current.pendingItems
        : loaded.pendingItems,
      contentLoaded: true
    });
    this.sessions[restored.id] = restored;

    return restored;
  }

  onBroadcast(listener: EventSink) {
    this.broadcastListeners.add(listener);
    return () => this.broadcastListeners.delete(listener);
  }

  async createSession(request: CreateRequest, sink: EventSink) {
    if (!isRuntimeProvider(request.provider)) {
      throw new Error(`Unsupported live provider: ${request.provider}`);
    }

    const id = `${request.provider}-live-${randomUUID()}`;
    const displayCwd = displayWorkspaceCwd(request.cwd);
    const session: SessionContent = {
      id,
      provider: request.provider,
      renderMode: request.provider === "meta" ? "hybrid" : "single",
      providerSessions: {},
      contextVersion: 0,
      runtimeStatus: "running",
      title: titleFromPrompt(request.prompt),
      cwd: request.cwd,
      displayCwd,
      model: providerModel(request.provider, request.settings.model),
      updatedAt: new Date().toISOString(),
      items: [
        {
          id: `${id}-user-0`,
          type: "user_message",
          body: request.prompt,
          timestamp: formatTime(new Date())
        },
        ...attachmentItems(id, request.imageAttachments)
      ],
      pendingItems: [
        {
          id: `${id}-pending`,
          type: "running_tool",
          label: `Starting ${providerLabel(request.provider)}`,
          status: "running"
        }
      ]
    };

    this.sessions[id] = session;
    this.persistence.upsertSession(session);
    if (request.requestId) {
      this.requestSessions.set(request.requestId, id);
    }
    this.emitToSink(sink, { id: randomUUID(), type: "session.started", session });

    let workspace: Awaited<ReturnType<typeof prepareSessionWorkspace>>;

    try {
      workspace = await prepareSessionWorkspace(request.cwd, id, request.workTarget);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitToSink(sink, {
        id: randomUUID(),
        type: "error",
        sessionId: id,
        requestId: request.requestId,
        message
      });
      this.emitToSink(sink, {
        id: randomUUID(),
        type: "turn.completed",
        sessionId: id,
        status: "error"
      });
      return;
    }

    session.cwd = workspace.cwd;
    session.worktreePath = workspace.worktree?.cwd;
    session.worktreeBranch = workspace.worktree?.branch;
    session.originalCwd = workspace.worktree?.originalCwd;
    session.originalBranch = workspace.worktree?.originalBranch;
    session.originalHead = workspace.worktree?.originalHead;
    session.updatedAt = new Date().toISOString();
    this.emitToSink(sink, { id: randomUUID(), type: "session.updated", session });

    this.startProviderRun(request.provider, {
      sessionId: id,
      session,
      prompt: request.prompt,
      settings: request.settings,
      imageAttachments: request.imageAttachments,
      askApproval: (approval) => this.askApproval(approval, sink),
      emit: (event) => this.emitToSink(sink, event)
    });
    this.applyPendingRequestInterrupt(request.requestId, id);
  }

  async sendMessage(request: RunRequest, sink: EventSink) {
    const session = await this.loadSessionContent(request.sessionId);

    if (!session) {
      throw new Error(`Unknown session ${request.sessionId}`);
    }

    if (requiresParallelAdoption(session) && !session.parallelAdoptedProvider) {
      throw new Error("Choose the Codex or Claude parallel thread to adopt before sending another message.");
    }

    const requestedProvider = request.provider ?? session.lastProvider ?? session.provider;
    const provider =
      session.parallelAdoptedProvider && requestedProvider === "meta"
        ? session.parallelAdoptedProvider
        : requestedProvider;

    if (!isRuntimeProvider(provider)) {
      throw new Error(`Unsupported live provider: ${provider}`);
    }

    if (request.requestId) {
      this.requestSessions.set(request.requestId, request.sessionId);
    }
    session.runtimeStatus = "running";
    session.updatedAt = new Date().toISOString();
    if (!isAbsoluteCwd(session.cwd) && isAbsoluteCwd(request.cwd)) {
      session.cwd = request.cwd;
    }
    session.model = providerModel(provider, request.settings.model);
    session.items.push({
      id: `${session.id}-user-${session.items.length}`,
      type: "user_message",
      body: request.prompt,
      timestamp: formatTime(new Date())
    });
    session.items.push(...attachmentItems(session.id, request.imageAttachments));
    session.pendingItems = [
      {
        id: `${session.id}-pending`,
        type: "running_tool",
        label: `Running ${providerLabel(provider)}`,
        status: "running"
      }
    ];
    this.persistence.upsertSession(session);
    this.emitToSink(sink, { id: randomUUID(), type: "session.updated", session });

    this.startProviderRun(provider, {
      ...request,
      session,
      askApproval: (approval) => this.askApproval(approval, sink),
      emit: (event) => this.emitToSink(sink, event)
    });
    this.applyPendingRequestInterrupt(request.requestId, request.sessionId);
  }

  async interrupt(sessionId: string) {
    const session = this.sessions[sessionId];

    if (!session) {
      return;
    }

    this.interruptedSessions.add(sessionId);
    const provider = this.activeRunProviders.get(sessionId) ?? session.lastProvider ?? session.provider;

    if (isRuntimeProvider(provider)) {
      await this.providers[provider].interrupt(sessionId);
    }

    this.apply({
      id: randomUUID(),
      type: "turn.completed",
      sessionId,
      status: "idle"
    });
  }

  async interruptRequest(requestId: string) {
    const sessionId = this.requestSessions.get(requestId);

    if (!sessionId) {
      this.interruptedRequestIds.add(requestId);
      return;
    }

    await this.interrupt(sessionId);
  }

  updateSessionVisibility(sessionId: string, action: RuntimeSessionVisibilityAction) {
    const session = this.sessions[sessionId];

    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    void this.persistence.updateSessionVisibility(session, action);
    delete this.sessions[sessionId];

    const snapshot = this.snapshot();
    this.broadcast({
      id: randomUUID(),
      type: "sessions.snapshot",
      snapshot
    });

    return snapshot;
  }

  async adoptParallelThread(sessionId: string, provider: DelegateSessionProvider) {
    // The live in-memory session is authoritative for an active run: it carries
    // both delegates' providerSessions from writeParallelProviderSessions. Capture
    // its id before loadSessionContent rebuilds the session from persistence (which
    // can lose the parallel provider ids), and use it as a fallback.
    const liveSession = this.sessions[sessionId];
    const liveProviderSessionId = liveSession
      ? parallelProviderSessionId(liveSession, provider)
      : undefined;

    const session = (await this.loadSessionContent(sessionId)) ?? liveSession;

    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    const providerSessionId =
      parallelProviderSessionId(session, provider) ?? liveProviderSessionId;

    if (!providerSessionId) {
      throw new Error(`${providerLabel(provider)} is not available to adopt for this session.`);
    }

    session.parallelAdoptedProvider = provider;
    session.provider = provider;
    session.lastProvider = provider;
    session.renderMode = "single";
    session.model = providerModel(provider);
    session.updatedAt = new Date().toISOString();
    this.persistence.upsertSession(session);

    const adoptedProviderState = session.providerSessions?.[provider] ?? {};
    const providerSessions: SessionContent["providerSessions"] = {
      [provider]: {
        ...adoptedProviderState,
        sessionId: providerSessionId
      }
    };
    session.providerSessions = providerSessions;
    session.cwd = providerSessions[provider]?.cwd ?? session.cwd;
    session.providerSessionId = providerSessionId;
    session.items = adoptedParallelItems(session.items, provider);
    session.pendingItems = [];
    this.persistence.adoptParallelProvider({
      composerSessionId: session.id,
      provider,
      providerSessionId,
      activeCwd: session.cwd
    });
    this.persistence.upsertSession(session);

    this.broadcast({
      id: randomUUID(),
      type: "session.updated",
      session
    });

    return this.snapshot();
  }

  resolveApproval(id: string, decision: ApprovalDecision) {
    const resolver = this.approvals.get(id);

    if (!resolver) {
      return;
    }

    this.approvals.delete(id);
    resolver(decision);
  }

  async dispose() {
    if (this.localSessionMonitor) {
      clearInterval(this.localSessionMonitor);
      this.localSessionMonitor = undefined;
    }
    await Promise.all(Object.values(this.providers).map((provider) => provider.dispose()));
  }

  private startProviderRun(
    provider: RuntimeSessionProvider,
    request: ProviderRunRequest
  ) {
    const parentSession = request.session;
    const previousProvider = parentSession.lastProvider;
    this.interruptedSessions.delete(request.sessionId);
    this.activeRunProviders.set(request.sessionId, provider);
    this.startLocalSessionMonitor(request.sessionId);

    const run = (async () => {
      const contextPrompt = await this.compactPreviousProviderForHandoff(
        parentSession,
        previousProvider,
        provider,
        request
      );

      adoptWorktreeForProviderRun(parentSession, previousProvider, provider);

      const providerSession = sessionForProvider(parentSession, provider);
      const contextVersion = (parentSession.contextVersion ?? 0) + 1;

      parentSession.contextVersion = contextVersion;
      parentSession.lastProvider = provider;
      parentSession.model = providerModel(provider, request.settings.model);
      this.activeRunProviders.set(request.sessionId, provider);

      if (this.interruptedSessions.has(request.sessionId)) {
        return;
      }

      await this.providers[provider].run({
        ...request,
        contextPrompt,
        session: providerSession,
        emit: (event) => request.emit(stampToolEventProvider(event, provider))
      });

      syncProviderState(parentSession, provider, providerSession, this.persistence);
      this.apply({
        id: randomUUID(),
        type: "session.updated",
        session: parentSession
      });
    })()
      .then(() => {
        // Provider state has already been synced inside the async run block.
      })
      .catch((error) => {
        this.apply({
          id: randomUUID(),
          type: "error",
          sessionId: request.sessionId,
          message: error instanceof Error ? error.message : String(error)
        });
        this.apply({
          id: randomUUID(),
          type: "turn.completed",
          sessionId: request.sessionId,
          status: "error"
        });
      })
      .finally(() => {
        if (this.activeRuns.get(request.sessionId) === run) {
          this.activeRuns.delete(request.sessionId);
        }
        this.interruptedSessions.delete(request.sessionId);
        this.stopLocalSessionMonitorIfIdle();
      });

    this.activeRuns.set(request.sessionId, run);
  }

  private applyPendingRequestInterrupt(requestId: string | undefined, sessionId: string) {
    if (!requestId || !this.interruptedRequestIds.has(requestId)) {
      return;
    }

    this.interruptedRequestIds.delete(requestId);
    void this.interrupt(sessionId);
  }

  private async compactPreviousProviderForHandoff(
    session: SessionContent,
    previousProvider: SessionProvider | undefined,
    nextProvider: RuntimeSessionProvider,
    request: ProviderRunRequest
  ): Promise<string | undefined> {
    if (
      !previousProvider ||
      previousProvider === nextProvider ||
      !isRuntimeProvider(previousProvider)
    ) {
      return undefined;
    }

    const provider = this.providers[previousProvider];

    if (!provider.compact) {
      return undefined;
    }

    const providerSession = sessionForProvider(session, previousProvider);

    if (!providerSession.providerSessionId) {
      return undefined;
    }

    this.activeRunProviders.set(request.sessionId, previousProvider);
    let compaction: SessionCompactionSummary | undefined;

    try {
      compaction = await provider.compact({
        sessionId: request.sessionId,
        session: providerSession,
        settings: request.settings,
        reason: `handoff from ${providerLabel(previousProvider)} to ${providerLabel(nextProvider)}`,
        emit: (event) => request.emit(stampToolEventProvider(event, previousProvider))
      });
    } catch (error) {
      const toolId = `${request.sessionId}-handoff-compact-skipped-${Date.now()}`;
      request.emit(stampToolEventProvider({
        id: randomUUID(),
        type: "tool.started",
        sessionId: request.sessionId,
        toolId,
        label: "Handoff compaction skipped",
        detail: {
          id: `${toolId}-detail`,
          label: "Native provider compaction failed",
          kind: "summary",
          tone: "error",
          action: "other",
          args: {
            provider: previousProvider,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }, previousProvider));
      request.emit(stampToolEventProvider({
        id: randomUUID(),
        type: "tool.completed",
        sessionId: request.sessionId,
        toolId
      }, previousProvider));
    }

    syncProviderState(session, previousProvider, providerSession, this.persistence);
    this.apply({
      id: randomUUID(),
      type: "session.updated",
      session
    });

    return compaction
      ? nativeHandoffContext(previousProvider, nextProvider, compaction)
      : undefined;
  }

  private async askApproval(
    approval: Omit<ApprovalRequest, "id">,
    sink: EventSink
  ): Promise<ApprovalDecision> {
    const id = `${approval.provider}-${randomUUID()}`;
    const request = { ...approval, id };

    this.emitToSink(sink, {
      id: randomUUID(),
      type: "approval.requested",
      approval: request
    });

    return new Promise((resolve) => {
      this.approvals.set(id, resolve);
    });
  }

  private emitToSink(sink: EventSink, event: LiveAgentEvent) {
    this.apply(event);

    try {
      sink(event);
    } catch {
      // Provider work is owned by the runtime, not by a single HTTP stream.
    }
  }

  private apply(event: LiveAgentEvent) {
    if (event.type === "session.started" || event.type === "session.updated") {
      this.sessions[event.session.id] = event.session;
      this.persistence.upsertSession(event.session);
      this.broadcast(event);
      return;
    }

    if (event.type === "approval.requested") {
      const session = this.sessions[event.approval.sessionId];

      if (session) {
        applySessionEvent(session, event);
        this.persistence.upsertSession(session);
        this.broadcast({
          id: randomUUID(),
          type: "session.updated",
          session
        });
      }

      this.broadcast(event);
      return;
    }

    if ("sessionId" in event && event.sessionId) {
      const session = this.sessions[event.sessionId];

      if (!session) {
        return;
      }

      applySessionEvent(session, event);
      if (event.type === "turn.completed") {
        completeProviderTurn(session, this.activeRunProviders.get(event.sessionId));
        this.activeRunProviders.delete(event.sessionId);
      }
      if (shouldPersistRuntimeEvent(event)) {
        this.persistence.upsertSession(session);
      }
      this.broadcast(event);
      return;
    }

    this.broadcast(event);
  }

  private startLocalSessionMonitor(parentSessionId: string) {
    if (!this.loadSessionListFromStore || !this.loadSessionContentFromStore) {
      return;
    }

    this.monitoredParentSessionIds.add(parentSessionId);
    void this.refreshLocalSubagentSessions();

    if (this.localSessionMonitor) {
      return;
    }

    this.localSessionMonitor = setInterval(() => {
      void this.refreshLocalSubagentSessions();
    }, this.localSessionPollIntervalMs);
  }

  private stopLocalSessionMonitorIfIdle() {
    if (this.activeRuns.size > 0) {
      return;
    }

    void this.refreshLocalSubagentSessions({ markIdle: true });

    if (this.localSessionMonitor) {
      clearInterval(this.localSessionMonitor);
      this.localSessionMonitor = undefined;
    }

    this.monitoredParentSessionIds.clear();
    this.localSubagentSourceFingerprints.clear();
  }

  private async refreshLocalSubagentSessions(options: { markIdle?: boolean } = {}) {
    if (
      this.localSessionMonitorRunning ||
      !this.loadSessionListFromStore ||
      !this.loadSessionContentFromStore ||
      this.monitoredParentSessionIds.size === 0
    ) {
      return;
    }

    this.localSessionMonitorRunning = true;

    try {
      const snapshot = await this.loadSessionListFromStore();

      for (const metadata of Object.values(snapshot.sessions)) {
        if (!metadata.subagent || !metadata.parentSessionId) {
          continue;
        }

        const parentSessionId = this.resolveMonitoredParentSessionId(
          metadata.parentSessionId
        );

        if (!parentSessionId) {
          continue;
        }

        const current = this.sessions[metadata.id];
        const loaded =
          !current || current.contentLoaded
            ? await this.loadSessionContentFromStore(metadata.id)
            : undefined;
        const source = loaded ?? metadata;
        const sourceFingerprint = localSessionSourceFingerprint(source);
        const previousSourceFingerprint =
          this.localSubagentSourceFingerprints.get(metadata.id);
        const sourceChanged =
          previousSourceFingerprint !== undefined &&
          previousSourceFingerprint !== sourceFingerprint;
        const running =
          options.markIdle !== true &&
          (isRuntimeSessionRunning(source) || sourceChanged);
        const session = normalizeLocalSubagentSession(
          source,
          parentSessionId,
          running
        );
        const fingerprint = localSessionFingerprint(session);

        this.localSubagentSourceFingerprints.set(metadata.id, sourceFingerprint);

        if (this.localSessionFingerprints.get(session.id) === fingerprint) {
          continue;
        }

        this.localSessionFingerprints.set(session.id, fingerprint);
        this.sessions[session.id] = session;
        this.broadcast({
          id: randomUUID(),
          type: "session.updated",
          session
        });
      }
    } catch (error) {
      console.warn("Could not refresh local subagent sessions", error);
    } finally {
      this.localSessionMonitorRunning = false;
    }
  }

  private resolveMonitoredParentSessionId(candidateParentId: string) {
    if (this.monitoredParentSessionIds.has(candidateParentId)) {
      return candidateParentId;
    }

    for (const parentSessionId of this.monitoredParentSessionIds) {
      const parent = this.sessions[parentSessionId];

      if (!parent) {
        continue;
      }

      for (const provider of ["codex", "claude"] as const) {
        const providerSessionId =
          parent.providerSessions?.[provider]?.sessionId ??
          (parent.provider === provider ? parent.providerSessionId : undefined);

        if (providerSessionId && candidateParentId === `${provider}-${providerSessionId}`) {
          return parentSessionId;
        }
      }
    }

    return undefined;
  }

  private broadcast(event: LiveAgentEvent) {
    for (const listener of this.broadcastListeners) {
      listener(event);
    }
  }
}

function shouldPersistRuntimeEvent(event: LiveAgentEvent) {
  return event.type !== "message.delta" && event.type !== "tool.delta";
}

function normalizeLocalSubagentSession(
  session: SessionContent,
  parentSessionId: string,
  running: boolean
): SessionContent {
  return {
    ...session,
    parentSessionId,
    items: session.items ?? [],
    providerSessions: session.providerSessions ?? {},
    pendingItems: running
      ? session.pendingItems?.length
        ? session.pendingItems
        : [
            {
              id: `${session.id}-local-subagent-running`,
              type: "running_tool",
              label: `${subagentRuntimeLabel(session)} is running`,
              status: "running"
            }
          ]
      : [],
    runtimeStatus: running
      ? "running"
      : session.runtimeStatus === "error"
        ? "error"
        : "idle",
    contentLoaded: session.contentLoaded ?? true
  };
}

function isRuntimeSessionRunning(session: SessionContent) {
  return Boolean(
    session.pendingItems?.length ||
      session.runtimeStatus === "running" ||
      session.runtimeStatus === "awaiting_approval"
  );
}

function subagentRuntimeLabel(session: SessionContent) {
  const label =
    session.subagent?.nickname ??
    session.subagent?.type ??
    session.subagent?.role;

  return label ? `${formatToolName(label)} subagent` : "Subagent";
}

function formatToolName(name: string) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function localSessionFingerprint(session: SessionContent) {
  const lastItem = session.items[session.items.length - 1];
  const lastPending = session.pendingItems[session.pendingItems.length - 1];

  return JSON.stringify({
    updatedAt: session.updatedAt,
    runtimeStatus: session.runtimeStatus,
    contentLoaded: session.contentLoaded,
    itemCount: session.items.length,
    pendingCount: session.pendingItems.length,
    lastItem,
    lastPending
  });
}

function localSessionSourceFingerprint(session: SessionContent) {
  const lastItem = session.items[session.items.length - 1];

  return JSON.stringify({
    updatedAt: session.updatedAt,
    contentLoaded: session.contentLoaded,
    itemCount: session.items.length,
    lastItem
  });
}

function applySessionEvent(session: SessionContent, event: LiveAgentEvent) {
  session.updatedAt = new Date().toISOString();

  if (event.type === "turn.started") {
    session.runtimeStatus = "running";
    session.pendingItems = [
      {
        id: `${session.id}-${event.turnId}-pending`,
        type: "running_tool",
        label: event.label ?? "Agent is working",
        status: "running"
      }
    ];
    return;
  }

  if (event.type === "message.delta") {
    const existing = session.items.find(
      (item) => item.type === "assistant_message" && item.id === event.messageId
    );

    if (existing?.type === "assistant_message") {
      existing.body += event.delta;
      existing.provider = event.provider ?? existing.provider;
      existing.layoutGroupId = event.layoutGroupId ?? existing.layoutGroupId;
      existing.layoutTitle = event.layoutTitle ?? existing.layoutTitle;
    } else {
      session.items.push({
        id: event.messageId,
        type: "assistant_message",
        body: event.delta,
        provider: event.provider,
        layoutGroupId: event.layoutGroupId,
        layoutTitle: event.layoutTitle
      });
    }
    return;
  }

  if (event.type === "message.completed") {
    const existing = session.items.find(
      (item) => item.type === "assistant_message" && item.id === event.messageId
    );

    if (existing?.type === "assistant_message" && event.body) {
      existing.body = event.body;
      existing.provider = event.provider ?? existing.provider;
      existing.layoutGroupId = event.layoutGroupId ?? existing.layoutGroupId;
      existing.layoutTitle = event.layoutTitle ?? existing.layoutTitle;
    }
    return;
  }

  if (event.type === "tool.started") {
    session.items.push({
      id: event.toolId,
      type: "tool_group",
      summary: event.label,
      details: [
        {
          ...(event.detail ?? toolDetail(event.toolId, event.label)),
          status: "running"
        }
      ],
      provider: event.provider,
      layoutGroupId: event.layoutGroupId,
      layoutTitle: event.layoutTitle,
      defaultOpen: false,
      status: "running"
    });
    return;
  }

  if (event.type === "tool.delta") {
    const tool = session.items.find(
      (item) => item.type === "tool_group" && item.id === event.toolId
    );

    if (tool?.type !== "tool_group") {
      return;
    }

    const output =
      tool.details.find((detail) => detail.kind === "output") ??
      toolDetail(`${event.toolId}-output`, "Output returned", "output");

    output.output = `${output.output ?? ""}${event.delta}`;
    output.label = output.output.trim().split("\n").at(-1) || "Output returned";
    output.status = "running";

    if (!tool.details.includes(output)) {
      tool.details.push(output);
    }
    return;
  }

  if (event.type === "tool.completed") {
    const tool = session.items.find(
      (item) => item.type === "tool_group" && item.id === event.toolId
    );

    if (tool?.type === "tool_group") {
      tool.status = event.detail?.status ?? "completed";
      tool.details = tool.details.map((detail) => ({
        ...detail,
        status: detail.status === "running" ? "completed" : detail.status
      }));
      if (event.detail) {
        tool.details.push(event.detail);
      }
    }
    return;
  }

  if (event.type === "approval.requested") {
    session.runtimeStatus = "awaiting_approval";
    session.pendingItems = [
      {
        id: `${event.approval.id}-pending`,
        type: "running_tool",
        label: event.approval.title,
        status: "running"
      }
    ];
    return;
  }

  if (event.type === "error") {
    session.runtimeStatus = "error";
    session.pendingItems = [];
    settleRunningToolGroups(session.items);
    appendErrorNotice(session, event.message);
    return;
  }

  if (event.type === "turn.completed") {
    session.runtimeStatus = event.status;
    session.pendingItems = [];
    settleRunningToolGroups(session.items);
  }
}

// Once a turn ends, nothing is running. Some providers (notably Claude) don't
// always emit a tool.completed for every tool.started, which would otherwise
// leave the tool group's status stuck at "running" and shimmering forever.
function settleRunningToolGroups(items: ConversationItem[]) {
  for (const item of items) {
    if (item.type !== "tool_group" || item.status !== "running") {
      continue;
    }

    item.status = "completed";
    item.details = item.details.map((detail) =>
      detail.status === "running" ? { ...detail, status: "completed" } : detail
    );
  }
}

function appendErrorNotice(session: SessionContent, message: string) {
  const label = `${providerLabel(session.lastProvider ?? session.provider)} failed: ${formatErrorMessage(message)}`;
  const lastItem = session.items.at(-1);

  if (lastItem?.type === "notice" && lastItem.label === label) {
    return;
  }

  session.items.push({
    id: `${session.id}-error-${Date.now()}`,
    type: "notice",
    label
  });
}

function formatErrorMessage(message: string) {
  const trimmed = message.trim();

  if (!trimmed) {
    return "The agent stopped before returning a response.";
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const nestedMessage =
        typeof record.message === "string"
          ? record.message
          : typeof record.error === "string"
            ? record.error
            : undefined;

      if (nestedMessage) {
        return nestedMessage;
      }
    }
  } catch {
    // Plain-text errors are expected from several provider CLIs.
  }

  return trimmed;
}

async function prepareSessionWorkspace(
  cwd: string,
  sessionId: string,
  workTarget?: CreateRequest["workTarget"]
) {
  if (workTarget?.mode === "worktree") {
    const worktree = await createSessionWorktree({
      baseCwd: cwd,
      baseBranch: workTarget.branch,
      sessionId
    });

    return {
      cwd: worktree.cwd,
      worktree
    };
  }

  await checkoutSessionBranch(cwd, workTarget?.branch);

  return {
    cwd,
    worktree: undefined as SessionWorktree | undefined
  };
}

function toolDetail(
  id: string,
  label: string,
  kind: "call" | "output" = "call"
): ToolDetail {
  return {
    id,
    label,
    kind,
    tone: kind === "output" ? "output" : "default",
    action: "other"
  };
}

function sessionForProvider(
  session: SessionContent,
  provider: RuntimeSessionProvider
): SessionContent {
  const providerState = session.providerSessions?.[provider];
  const legacySessionId =
    session.provider === provider ? session.providerSessionId : undefined;

  return {
    ...session,
    id: `${provider}-live-shared-${safeSessionId(session.id)}`,
    provider,
    renderMode: "single",
    parentSessionId: session.id,
    providerSessionId: providerState?.sessionId ?? legacySessionId,
    cwd: providerState?.cwd ?? session.cwd,
    model: providerModel(provider),
    pendingItems: []
  };
}

function requiresParallelAdoption(session: SessionContent) {
  return (
    session.provider === "meta" &&
    session.renderMode === "hybrid" &&
    isCompareAgentsModel(session.model) &&
    Boolean(parallelProviderSessionId(session, "codex")) &&
    Boolean(parallelProviderSessionId(session, "claude"))
  );
}

function isCompareAgentsModel(model?: string) {
  return model === "Compare agents" || model === "Codex + Claude parallel";
}

function adoptWorktreeForProviderRun(
  session: SessionContent,
  previousProvider: SessionProvider | undefined,
  nextProvider: RuntimeSessionProvider
) {
  if (nextProvider === "meta") {
    return;
  }

  const providerSessions = { ...(session.providerSessions ?? {}) };
  const nextState = providerSessions[nextProvider] ?? {};

  if (
    previousProvider &&
    previousProvider !== nextProvider &&
    isRuntimeProvider(previousProvider)
  ) {
    const activeCwd = providerSessions[previousProvider]?.cwd ?? session.cwd;

    if (activeCwd) {
      providerSessions[nextProvider] = {
        ...nextState,
        cwd: activeCwd
      };
      session.providerSessions = providerSessions;
      session.cwd = activeCwd;
    }

    return;
  }

  if (nextState.cwd) {
    session.cwd = nextState.cwd;
  }
}

function parallelProviderSessionId(
  session: SessionContent,
  provider: DelegateSessionProvider
) {
  const providerSessionId = session.providerSessions?.[provider]?.sessionId;

  if (providerSessionId) {
    return providerSessionId;
  }

  if (!session.providerSessionId) {
    return undefined;
  }

  try {
    const record = JSON.parse(session.providerSessionId) as Record<string, unknown>;
    const value = record[provider];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function adoptedParallelItems(
  items: ConversationItem[],
  provider: DelegateSessionProvider
): ConversationItem[] {
  return items.flatMap((item): ConversationItem[] => {
    if (item.type === "parallel_thread_group") {
      const column = item.columns.find((candidate) => candidate.provider === provider);

      return column ? adoptedParallelColumnItems(column.items) : [];
    }

    if (item.type === "user_message" || item.type === "attachment_group") {
      return [item];
    }

    if (item.type !== "assistant_message" && item.type !== "tool_group") {
      return [];
    }

    if (item.layoutGroupId && item.provider !== provider) {
      return [];
    }

    if (item.type === "assistant_message") {
      if (isParallelDelegateHeader(item)) {
        return [];
      }

      if (!item.layoutGroupId && item.provider !== provider) {
        return [];
      }

      const { provider: _provider, layoutGroupId: _layoutGroupId, layoutTitle: _layoutTitle, ...rest } = item;
      return [rest];
    }

    if (isParallelDelegateToolWrapper(item)) {
      return [];
    }

    if (!item.layoutGroupId && item.provider !== provider) {
      return [];
    }

    const { provider: _provider, layoutGroupId: _layoutGroupId, layoutTitle: _layoutTitle, ...rest } = item;
    return [rest];
  });
}

function adoptedParallelColumnItems(items: ConversationItem[]): ConversationItem[] {
  return items.flatMap((item): ConversationItem[] => {
    if (item.type === "parallel_thread_group") {
      return [];
    }

    if (item.type === "assistant_message") {
      if (isParallelDelegateHeader(item)) {
        return [];
      }

      const { provider: _provider, layoutGroupId: _layoutGroupId, layoutTitle: _layoutTitle, ...rest } = item;
      return [rest];
    }

    if (item.type === "tool_group") {
      if (isParallelDelegateToolWrapper(item)) {
        return [];
      }

      const { provider: _provider, layoutGroupId: _layoutGroupId, layoutTitle: _layoutTitle, ...rest } = item;
      return [rest];
    }

    return [item];
  });
}

function isParallelDelegateHeader(
  item: Extract<ConversationItem, { type: "assistant_message" }>
) {
  return /^\s*\*\*(?:Codex|Claude) parallel delegate\*\*\s*$/i.test(item.body);
}

function isParallelDelegateToolWrapper(
  item: Extract<ConversationItem, { type: "tool_group" }>
) {
  const text = [
    item.summary,
    ...item.details.flatMap((detail) => [
      detail.label,
      detail.toolName
    ])
  ].filter(Boolean).join(" ");

  return item.details.some((detail) => detail.toolName === "meta_supervisor") ||
    /(?:codex|claude) parallel delegate started/i.test(text) ||
    /\buser message\b/i.test(text);
}

function syncProviderState(
  session: SessionContent,
  provider: RuntimeSessionProvider,
  providerSession: SessionContent,
  persistence: RuntimePersistence
) {
  const providerSessions = {
    ...(session.providerSessions ?? {}),
    ...(providerSession.providerSessions ?? {})
  };
  const current = providerSessions[provider] ?? {};

  providerSessions[provider] = {
    ...current,
    sessionId: providerSession.providerSessionId ?? current.sessionId,
    cwd: providerSession.cwd ?? current.cwd,
    worktreePath: providerSession.worktreePath ?? session.worktreePath ?? current.worktreePath,
    worktreeBranch: providerSession.worktreeBranch ?? session.worktreeBranch ?? current.worktreeBranch,
    originalCwd: providerSession.originalCwd ?? session.originalCwd ?? current.originalCwd,
    originalBranch: providerSession.originalBranch ?? session.originalBranch ?? current.originalBranch,
    originalHead: providerSession.originalHead ?? session.originalHead ?? current.originalHead
  };

  if (
    session.id !== providerSession.id &&
    (provider === "codex" || provider === "claude") &&
    providerSession.providerSessionId
  ) {
    persistence.upsertProviderSessions([
      {
        composerSessionId: session.id,
        provider,
        providerSessionId: providerSession.providerSessionId,
        mode: "handoff",
        role: "handoff",
        lifecycle: "handoff",
        cwd: providerSession.cwd,
        worktreePath: providerSession.worktreePath ?? session.worktreePath,
        worktreeBranch: providerSession.worktreeBranch ?? session.worktreeBranch,
        originalCwd: providerSession.originalCwd ?? session.originalCwd,
        originalBranch: providerSession.originalBranch ?? session.originalBranch,
        originalHead: providerSession.originalHead ?? session.originalHead
      }
    ]);
  }

  session.providerSessions = providerSessions;

  session.compactionSummaries = mergeById(
    session.compactionSummaries ?? [],
    providerSession.compactionSummaries ?? []
  ).slice(-12);

  if (session.provider === provider && providerSession.providerSessionId) {
    session.providerSessionId = providerSession.providerSessionId;
  }

  if (providerSession.parallelAdoptedProvider) {
    session.parallelAdoptedProvider = providerSession.parallelAdoptedProvider;
  }
}

function completeProviderTurn(
  session: SessionContent,
  provider?: RuntimeSessionProvider
) {
  const resolvedProvider = provider ?? session.lastProvider;

  if (!resolvedProvider || !isRuntimeProvider(resolvedProvider)) {
    return;
  }

  const contextVersion = session.contextVersion ?? 0;
  const providerSessions = { ...(session.providerSessions ?? {}) };
  const state = providerSessions[resolvedProvider] ?? {};
  providerSessions[resolvedProvider] = {
    ...state,
    lastContextVersion: contextVersion
  };
  session.providerSessions = providerSessions;
}

function nativeHandoffContext(
  previousProvider: RuntimeSessionProvider,
  nextProvider: RuntimeSessionProvider,
  compaction: SessionCompactionSummary
) {
  const tokenRange =
    compaction.preTokens !== undefined
      ? ` (${compaction.preTokens}${compaction.postTokens !== undefined ? ` -> ${compaction.postTokens}` : ""} tokens)`
      : "";
  const lines = [
    "Composer provider handoff context. This is attached only because the active provider changed.",
    `Provider switch: ${providerLabel(previousProvider)} -> ${providerLabel(nextProvider)}.`,
    `Native compaction: ${providerLabel(compaction.provider)} ${compaction.trigger ?? "unknown"} compact at context v${compaction.contextVersion}${tokenRange}.`,
    "",
    compaction.summary
  ].filter((line): line is string => typeof line === "string");

  return lines.join("\n");
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 2_000
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((item) => [item.id, item]));

  for (const item of incoming) {
    byId.set(item.id, item);
  }

  return [...byId.values()];
}

function buildProjects(sessions: Record<string, SessionContent>): Project[] {
  const byWorkspace = new Map<string, SessionContent[]>();

  for (const session of Object.values(sessions)) {
    const cwd = normalizeCwd(workspaceCwdForSession(session));
    const key = cwd ?? "unknown-workspace";

    byWorkspace.set(key, [...(byWorkspace.get(key) ?? []), session]);
  }

  return [...byWorkspace.entries()]
    .map(([key, workspaceSessions]) => {
      const cwd = key === "unknown-workspace" ? undefined : key;
      const sortedSessions = workspaceSessions.sort(
        (a, b) => sessionTimestamp(b) - sessionTimestamp(a)
      );

      return {
        id: key,
        name: cwd ? path.basename(cwd) : "Unknown workspace",
        cwd,
        threads: sessionsToThreadTree(sortedSessions)
      };
    })
    .sort((a, b) => latestProjectTimestamp(b, sessions) - latestProjectTimestamp(a, sessions));
}

function sessionsToThreadTree(sessions: SessionContent[]): ProjectThread[] {
  type ThreadNode = { session: SessionContent; children: ThreadNode[] };
  const sortedSessions = [...sessions].sort(
    (a, b) => sessionTimestamp(b) - sessionTimestamp(a)
  );
  const nodes = new Map<string, ThreadNode>();

  for (const session of sortedSessions) {
    nodes.set(session.id, { session, children: [] });
  }

  const roots: ThreadNode[] = [];

  for (const session of sortedSessions) {
    const node = nodes.get(session.id);

    if (!node) {
      continue;
    }

    const parent = session.parentSessionId
      ? nodes.get(session.parentSessionId)
      : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const nodeToThread = (node: ThreadNode): ProjectThread => ({
    id: node.session.id,
    name: node.session.title,
    age: relativeAge(node.session.updatedAt),
    provider: node.session.provider,
    model: node.session.model,
    cwd: workspaceCwdForSession(node.session),
    parentSessionId: node.session.parentSessionId,
    subagent: node.session.subagent,
    children: node.children.map(nodeToThread)
  });

  return roots.map(nodeToThread);
}

function workspaceCwdForSession(session: SessionContent) {
  return displayWorkspaceCwd(session.displayCwd ?? session.cwd);
}

function displayWorkspaceCwd(cwd?: string) {
  if (!cwd) {
    return undefined;
  }

  const normalized = path.resolve(cwd);
  const claudeWorktreeMarker = `${path.sep}.claude${path.sep}worktrees${path.sep}`;
  const claudeIndex = normalized.indexOf(claudeWorktreeMarker);

  if (claudeIndex > 0) {
    return normalized.slice(0, claudeIndex);
  }

  const gitCommonDir = runGit(normalized, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  ]);
  const gitWorktreeMarker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
  const gitWorktreeIndex = gitCommonDir?.indexOf(gitWorktreeMarker) ?? -1;

  if (gitWorktreeIndex > 0) {
    return gitCommonDir?.slice(0, gitWorktreeIndex);
  }

  return normalized;
}

function isRuntimeProvider(
  provider: SessionProvider
): provider is RuntimeSessionProvider {
  return isRuntimeProviderId(provider);
}

function providerLabel(provider: SessionProvider) {
  return providerStatusLabel(provider);
}

function stampToolEventProvider(
  event: LiveAgentEvent,
  provider: RuntimeSessionProvider
): LiveAgentEvent {
  if (
    event.type === "tool.started" ||
    event.type === "tool.delta" ||
    event.type === "tool.completed"
  ) {
    return { ...event, provider: event.provider ?? provider };
  }

  return event;
}

function providerModel(provider: SessionProvider, model?: string) {
  return providerModelDisplayLabel(provider, model);
}

function titleFromPrompt(prompt: string) {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  return trimmed.length > 52 ? `${trimmed.slice(0, 49)}...` : trimmed || "New session";
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function attachmentItems(
  sessionId: string,
  attachments: AgentImageAttachment[] = []
): SessionContent["items"] {
  const items = attachments
    .filter((attachment) => attachment.dataUrl || attachment.path)
    .map((attachment, index) => ({
      id: `${sessionId}-attachment-${Date.now()}-${index}`,
      type: "attachment_group" as const,
      attachments: [
        {
          id: `${sessionId}-attachment-file-${Date.now()}-${index}`,
          type: "file" as const,
          filename: attachment.name,
          mediaType: attachment.mediaType,
          url: attachment.dataUrl ?? (attachment.path ? `file://${attachment.path}` : undefined)
        }
      ]
    }));

  return items;
}

function relativeAge(timestamp?: string) {
  if (!timestamp) {
    return "";
  }

  const deltaMs = Date.now() - new Date(timestamp).getTime();

  if (!Number.isFinite(deltaMs)) {
    return "";
  }

  const minutes = Math.max(0, Math.floor(deltaMs / 60_000));

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function normalizeCwd(value?: string) {
  return value ? path.resolve(value) : undefined;
}

function sessionTimestamp(session?: Pick<SessionContent, "updatedAt">) {
  const timestamp = Date.parse(session?.updatedAt ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function latestProjectTimestamp(
  project: Project,
  sessions: Record<string, SessionContent>
) {
  return Math.max(
    0,
    ...flattenThreads(project.threads).map((thread) =>
      sessionTimestamp(sessions[thread.id])
    )
  );
}

function flattenThreads(threads: ProjectThread[]): ProjectThread[] {
  return threads.flatMap((thread) => [
    thread,
    ...flattenThreads(thread.children ?? [])
  ]);
}

export function providerSessionId(session: SessionContent) {
  return (
    session.providerSessions?.[session.provider]?.sessionId ??
    session.providerSessionId ??
    session.id
      .replace(/^codex-live-/, "")
      .replace(/^claude-live-/, "")
      .replace(/^meta-live-/, "")
      .replace(/^codex-/, "")
      .replace(/^claude-/, "")
      .replace(/^meta-/, "")
  );
}

export function defaultCwd(session: SessionContent) {
  return isAbsoluteCwd(session.cwd) ? session.cwd : process.cwd();
}

function isAbsoluteCwd(value: string | undefined): value is string {
  return Boolean(value && path.isAbsolute(value));
}

function safeSessionId(sessionId: string) {
  return sessionId.replace(/[^A-Za-z0-9_-]/g, "-");
}
