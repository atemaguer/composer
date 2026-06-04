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
  applyLiveSessionEvent,
  canDelegateProvider,
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
  QueuedUserMessage,
  SessionContent,
  SessionCompactionSummary,
  SessionProvider,
  SessionSnapshot
} from "@composer/client";

export type EventSink = (event: LiveAgentEvent) => void;

// Sink for queue-drained runs: their events flow over the WebSocket broadcast
// (emitToSink always calls apply()), so the per-request HTTP sink is a noop.
const noopSink: EventSink = () => {};

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
  // Optional native "steer": inject input into the in-flight turn without
  // starting a new one (Codex `turn/steer`). Providers without a steer
  // primitive (Claude) omit this; the runtime falls back to interrupt-and-run.
  steer?(
    sessionId: string,
    input: { prompt: string; imageAttachments?: AgentImageAttachment[] }
  ): Promise<boolean>;
  dispose(): Promise<void> | void;
}

// A user message parked while a run is active. Captures everything needed to
// dispatch it as its own run when the queue drains.
type QueuedMessage = {
  id: string;
  provider: RuntimeSessionProvider;
  request: RunRequest;
};

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
  // FIFO of user messages queued per session while a run is active.
  private messageQueue = new Map<string, QueuedMessage[]>();
  // The turnId of the in-flight turn per session, tracked from turn.started.
  // Used to recognize the authoritative turn.completed and ignore the stale
  // duplicate completions that interrupt produces, so the queue drains once.
  private activeTurnId = new Map<string, string>();
  // Recently-settled turnIds per session (bounded). A turn.completed whose
  // turnId is already here is a stale duplicate and is dropped.
  private settledTurnIds = new Map<string, Set<string>>();
  private requestSessions = new Map<string, string>();
  private interruptedRequestIds = new Set<string>();
  private interruptedSessions = new Set<string>();
  private localSessionMonitor?: ReturnType<typeof setInterval>;
  private localSessionMonitorRunning = false;
  private monitoredParentSessionIds = new Set<string>();
  private localSessionFingerprints = new Map<string, string>();
  private localSubagentSourceFingerprints = new Map<string, string>();
  // Last on-disk freshness signal (transcript mtime, surfaced as updatedAt by
  // the list walk) seen for each monitored subagent. Lets each poll tick skip
  // the expensive full-transcript re-read when the file has not changed.
  private localSubagentSourceMtimes = new Map<string, string>();
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

  /**
   * Populate the session list from the local store and push it to connected
   * clients. Callers construct the runtime with an empty snapshot so the server
   * can start listening immediately — scanning local transcripts (~/.claude,
   * ~/.codex) can take seconds on machines with lots of history and must not
   * block the READY signal / first paint. Sessions created or loaded while the
   * scan was in flight are never clobbered.
   */
  async hydrateSessionListFromStore() {
    if (!this.loadSessionListFromStore) {
      return;
    }

    let snapshot: SessionSnapshot;

    try {
      snapshot = await this.loadSessionListFromStore();
    } catch (error) {
      console.warn("Could not hydrate session list from store", error);
      return;
    }

    const restored = restoreRuntimeSessions(snapshot.sessions);
    let added = false;

    for (const [id, session] of Object.entries(restored.sessions)) {
      if (this.sessions[id]) {
        continue;
      }

      this.sessions[id] = session;
      added = true;
    }

    for (const session of restored.staleSessions) {
      if (this.sessions[session.id] !== session) {
        continue;
      }

      try {
        this.persistence.upsertSession(session);
      } catch (error) {
        console.warn("Could not persist restored session state", error);
      }
    }

    if (!added) {
      return;
    }

    this.broadcast({
      id: randomUUID(),
      type: "sessions.snapshot",
      snapshot: this.snapshot()
    });
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
    // The session was just broadcast in full via `session.started`; only
    // workspace metadata changed here, so emit a targeted patch. The runtime
    // keeps the same in-memory object and persistence runs via `apply`.
    this.emitToSink(sink, {
      id: randomUUID(),
      type: "session.patch",
      sessionId: session.id,
      cwd: session.cwd,
      worktreePath: session.worktreePath,
      worktreeBranch: session.worktreeBranch,
      updatedAt: session.updatedAt
    });

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

    // A run is already in flight — park this message in the session's FIFO and
    // drain it when the current turn completes (or is steered).
    if (this.isSessionBusy(request.sessionId)) {
      this.enqueueMessage(session, provider, request, sink);
      return;
    }

    this.dispatchUserMessageRun(session, provider, request, sink);
    this.applyPendingRequestInterrupt(request.requestId, request.sessionId);
  }

  private isSessionBusy(sessionId: string): boolean {
    if (this.activeRunProviders.has(sessionId)) {
      return true;
    }

    const status = this.sessions[sessionId]?.runtimeStatus;
    return status === "running" || status === "awaiting_approval";
  }

  // Append the user message to the timeline, flip the session to running, and
  // start the provider run. Shared by the immediate path (sendMessage) and the
  // queue-drain path (drainQueue, which passes a noop sink so events flow over
  // the broadcast rather than the long-since-returned HTTP request).
  private dispatchUserMessageRun(
    session: SessionContent,
    provider: RuntimeSessionProvider,
    request: RunRequest,
    sink: EventSink
  ) {
    session.runtimeStatus = "running";
    session.updatedAt = new Date().toISOString();
    if (!isAbsoluteCwd(session.cwd) && isAbsoluteCwd(request.cwd)) {
      session.cwd = request.cwd;
    }
    session.model = providerModel(provider, request.settings.model);
    const appendedItems: ConversationItem[] = [
      {
        id: `${session.id}-user-${session.items.length}`,
        type: "user_message",
        body: request.prompt,
        timestamp: formatTime(new Date())
      },
      ...attachmentItems(session.id, request.imageAttachments)
    ];
    session.items.push(...appendedItems);
    session.pendingItems = [
      {
        id: `${session.id}-pending`,
        type: "running_tool",
        label: `Running ${providerLabel(provider)}`,
        status: "running"
      }
    ];
    this.persistence.upsertSession(session);
    // Only the just-sent user message (plus attachments) and the running-status
    // metadata changed; the running pending item is derived by consumers from
    // runtimeStatus, so a patch with appendedItems faithfully captures this.
    // queuedMessages reflects the post-drain queue (a drained message was
    // removed before dispatch).
    this.emitToSink(sink, {
      id: randomUUID(),
      type: "session.patch",
      sessionId: session.id,
      runtimeStatus: session.runtimeStatus,
      updatedAt: session.updatedAt,
      cwd: session.cwd,
      model: session.model,
      appendedItems,
      queuedMessages: session.queuedMessages ?? []
    });

    this.startProviderRun(provider, {
      ...request,
      session,
      askApproval: (approval) => this.askApproval(approval, sink),
      emit: (event) => this.emitToSink(sink, event)
    });
  }

  private enqueueMessage(
    session: SessionContent,
    provider: RuntimeSessionProvider,
    request: RunRequest,
    sink: EventSink
  ) {
    const queuedId = `${session.id}-queued-${randomUUID()}`;
    const list = this.messageQueue.get(session.id) ?? [];
    list.push({ id: queuedId, provider, request });
    this.messageQueue.set(session.id, list);

    const queued: QueuedUserMessage = {
      id: queuedId,
      body: request.prompt,
      provider,
      imageAttachments: request.imageAttachments,
      createdAt: new Date().toISOString()
    };
    session.queuedMessages = [...(session.queuedMessages ?? []), queued];
    session.updatedAt = new Date().toISOString();
    this.persistence.upsertSession(session);
    this.emitToSink(sink, {
      id: randomUUID(),
      type: "session.patch",
      sessionId: session.id,
      updatedAt: session.updatedAt,
      queuedMessages: session.queuedMessages
    });
  }

  // Dispatch the next queued message as its own run. Called when a turn
  // completes (natural completion or steer-by-interrupt). Guards against
  // double-dispatch if a run is somehow still active.
  private drainQueue(sessionId: string) {
    if (this.activeRunProviders.has(sessionId)) {
      return;
    }

    const list = this.messageQueue.get(sessionId);
    if (!list || list.length === 0) {
      return;
    }

    const next = list.shift() as QueuedMessage;
    if (list.length === 0) {
      this.messageQueue.delete(sessionId);
    } else {
      this.messageQueue.set(sessionId, list);
    }

    const session = this.sessions[sessionId];
    if (!session) {
      return;
    }

    session.queuedMessages = (session.queuedMessages ?? []).filter(
      (message) => message.id !== next.id
    );

    this.dispatchUserMessageRun(session, next.provider, next.request, noopSink);
  }

  private recordSettledTurn(sessionId: string, turnId: string) {
    const set = this.settledTurnIds.get(sessionId) ?? new Set<string>();
    set.add(turnId);
    // Only recent turns matter for dedup; keep the set bounded.
    if (set.size > 32) {
      const oldest = set.values().next().value;
      if (oldest !== undefined) {
        set.delete(oldest);
      }
    }
    this.settledTurnIds.set(sessionId, set);
  }

  private forgetSessionQueueState(sessionId: string) {
    this.messageQueue.delete(sessionId);
    this.activeTurnId.delete(sessionId);
    this.settledTurnIds.delete(sessionId);
  }

  // Remove a not-yet-run queued message. No-op if it already drained.
  cancelQueuedMessage(sessionId: string, queuedId: string): SessionSnapshot {
    const list = this.messageQueue.get(sessionId);
    if (list) {
      const filtered = list.filter((message) => message.id !== queuedId);
      if (filtered.length === 0) {
        this.messageQueue.delete(sessionId);
      } else {
        this.messageQueue.set(sessionId, filtered);
      }
    }

    const session = this.sessions[sessionId];
    if (session) {
      session.queuedMessages = (session.queuedMessages ?? []).filter(
        (message) => message.id !== queuedId
      );
      session.updatedAt = new Date().toISOString();
      this.persistence.upsertSession(session);
      this.broadcast({
        id: randomUUID(),
        type: "session.patch",
        sessionId,
        updatedAt: session.updatedAt,
        queuedMessages: session.queuedMessages
      });
    }

    return this.snapshot();
  }

  // Reorder the queue to match the given id order (drag-to-prioritize). Ids not
  // present are ignored; queued messages omitted from the list keep their
  // relative order at the end (defensive against a stale client view).
  reorderQueue(sessionId: string, orderedIds: string[]): SessionSnapshot {
    const reorder = <T extends { id: string }>(items: T[]): T[] => {
      const byId = new Map(items.map((item) => [item.id, item]));
      const ordered: T[] = [];
      for (const id of orderedIds) {
        const item = byId.get(id);
        if (item) {
          ordered.push(item);
          byId.delete(id);
        }
      }
      for (const item of items) {
        if (byId.has(item.id)) {
          ordered.push(item);
        }
      }
      return ordered;
    };

    const list = this.messageQueue.get(sessionId);
    if (list) {
      this.messageQueue.set(sessionId, reorder(list));
    }

    const session = this.sessions[sessionId];
    if (session?.queuedMessages?.length) {
      session.queuedMessages = reorder(session.queuedMessages);
      session.updatedAt = new Date().toISOString();
      this.persistence.upsertSession(session);
      this.broadcast({
        id: randomUUID(),
        type: "session.patch",
        sessionId,
        updatedAt: session.updatedAt,
        queuedMessages: session.queuedMessages
      });
    }

    return this.snapshot();
  }

  // "Send now": act on a queued message immediately instead of waiting for the
  // turn to finish. Codex injects it into the running turn (turn/steer); Claude
  // (no steer primitive) interrupts the run so the queue drains into a fresh
  // turn. Targets the front of the queue by default, or a specific queued
  // message by id. No-op when nothing is queued / the id is unknown.
  async steer(sessionId: string, queuedId?: string): Promise<void> {
    const list = this.messageQueue.get(sessionId);
    if (!list || list.length === 0) {
      return;
    }

    const index = queuedId ? list.findIndex((message) => message.id === queuedId) : 0;
    if (index < 0) {
      return;
    }

    const target = list[index];
    const provider = this.activeRunProviders.get(sessionId);
    const providerImpl = provider ? this.providers[provider] : undefined;

    if (provider && providerImpl?.steer) {
      const steered = await providerImpl
        .steer(sessionId, {
          prompt: target.request.prompt,
          imageAttachments: target.request.imageAttachments
        })
        .catch(() => false);

      if (steered) {
        this.consumeSteeredMessage(sessionId, target);
        return;
      }
    }

    // No native steer (Claude) or the injection was rejected: move the target to
    // the front so the post-interrupt drain dispatches it, then interrupt the
    // current run.
    if (index > 0) {
      list.splice(index, 1);
      list.unshift(target);
      this.messageQueue.set(sessionId, list);
    }
    await this.interrupt(sessionId);
  }

  // A queued message was injected into the running turn via turn/steer: remove
  // it from the queue and surface it in the transcript as part of the turn.
  private consumeSteeredMessage(sessionId: string, queued: QueuedMessage) {
    const list = this.messageQueue.get(sessionId);
    if (list) {
      const filtered = list.filter((message) => message.id !== queued.id);
      if (filtered.length === 0) {
        this.messageQueue.delete(sessionId);
      } else {
        this.messageQueue.set(sessionId, filtered);
      }
    }

    const session = this.sessions[sessionId];
    if (!session) {
      return;
    }

    session.queuedMessages = (session.queuedMessages ?? []).filter(
      (message) => message.id !== queued.id
    );
    const appendedItems: ConversationItem[] = [
      {
        id: `${session.id}-user-${session.items.length}`,
        type: "user_message",
        body: queued.request.prompt,
        timestamp: formatTime(new Date())
      },
      ...attachmentItems(session.id, queued.request.imageAttachments)
    ];
    session.items.push(...appendedItems);
    session.updatedAt = new Date().toISOString();
    this.persistence.upsertSession(session);
    this.broadcast({
      id: randomUUID(),
      type: "session.patch",
      sessionId,
      updatedAt: session.updatedAt,
      appendedItems,
      queuedMessages: session.queuedMessages
    });
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
    this.forgetSessionQueueState(sessionId);

    this.broadcast({
      id: randomUUID(),
      type: "session.removed",
      sessionId
    });

    return this.snapshot();
  }

  renameSession(sessionId: string, title: string) {
    const session = this.sessions[sessionId];

    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    const trimmed = title.trim();

    if (!trimmed) {
      throw new Error("Session title cannot be empty");
    }

    // The registry's title column takes priority over the provider-derived
    // title (see loadLocalSessionContent), so persisting the session is enough
    // to make the rename stick across reloads.
    session.title = trimmed;
    session.updatedAt = new Date().toISOString();
    this.persistence.upsertSession(session);

    this.broadcast({
      id: randomUUID(),
      type: "session.updated",
      session
    });

    return this.snapshot();
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

  /**
   * Manually compact a session's active provider context. Mirrors the
   * provider-handoff compaction, but driven by the user (`/compact`) rather than
   * a cross-provider switch. Compaction tool events broadcast to all connected
   * clients; the resulting summary is persisted on the session.
   */
  async compactSession(
    sessionId: string,
    settings: AgentSettings
  ): Promise<SessionCompactionSummary | undefined> {
    const session =
      (await this.loadSessionContent(sessionId)) ?? this.sessions[sessionId];

    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    const provider = session.lastProvider ?? session.provider;

    if (!isRuntimeProvider(provider)) {
      throw new Error(`Session ${sessionId} has no compactable provider.`);
    }

    const impl = this.providers[provider];

    if (!impl.compact) {
      throw new Error(`${providerLabel(provider)} does not support compaction.`);
    }

    const providerSession = sessionForProvider(session, provider);
    const compaction = await impl.compact({
      sessionId,
      session: providerSession,
      settings,
      reason: "manual compaction",
      emit: (event) => this.broadcast(stampToolEventProvider(event, provider))
    });

    syncProviderState(session, provider, providerSession, this.persistence);
    this.apply({ id: randomUUID(), type: "session.updated", session });

    return compaction;
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

    if (event.type === "session.patch") {
      // Callers mutate the in-memory session in place before emitting a patch,
      // so the patch only needs to persist that already-updated session and
      // forward the delta to listeners — never re-broadcast the whole session.
      const session = this.sessions[event.sessionId];

      if (session) {
        this.persistence.upsertSession(session);
      }

      this.broadcast(event);
      return;
    }

    if (event.type === "approval.requested") {
      const session = this.sessions[event.approval.sessionId];

      if (session) {
        applyLiveSessionEvent(session, event, { immutable: false, errorNotice: "none" });
        this.persistence.upsertSession(session);
        // The desktop store derives `awaiting_approval` plus the pending item
        // directly from `approval.requested`, so the full `session.updated`
        // re-broadcast was redundant. Emit only a minimal status patch for any
        // consumer that still needs the runtimeStatus transition.
        this.broadcast({
          id: randomUUID(),
          type: "session.patch",
          sessionId: session.id,
          runtimeStatus: "awaiting_approval",
          updatedAt: session.updatedAt
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

      // Drop a stale/duplicate turn.completed: the turn already settled (e.g.
      // interrupt finalized it via a synthetic completion, then the provider's
      // real completion for that same turnId arrives after a queued message has
      // already started). Dropping it preserves the new run's running state and
      // prevents a second drain.
      if (
        event.type === "turn.completed" &&
        event.turnId !== undefined &&
        this.settledTurnIds.get(event.sessionId)?.has(event.turnId)
      ) {
        return;
      }

      applyLiveSessionEvent(session, event, { immutable: false, errorNotice: "none" });

      // Execution errors are transient failures, not transcript content. The
      // reducer (errorNotice:"none") sets status=error / settles running tools
      // but appends no notice; each surface renders the error as a notification
      // (desktop toast / CLI status line). Enrich the broadcast message with a
      // provider label + cleanup so that notification reads clearly.
      let outgoing: LiveAgentEvent = event;
      if (event.type === "error") {
        outgoing = {
          ...event,
          message: `${providerLabel(session.lastProvider ?? session.provider)} failed: ${formatErrorMessage(event.message)}`
        };
      }
      if (event.type === "turn.started") {
        this.activeTurnId.set(event.sessionId, event.turnId);
      }
      let shouldDrain = false;
      if (event.type === "turn.completed") {
        const settledTurn = event.turnId ?? this.activeTurnId.get(event.sessionId);
        if (settledTurn) {
          this.recordSettledTurn(event.sessionId, settledTurn);
        }
        this.activeTurnId.delete(event.sessionId);
        completeProviderTurn(session, this.activeRunProviders.get(event.sessionId));
        this.activeRunProviders.delete(event.sessionId);
        shouldDrain = true;
      }
      if (shouldPersistRuntimeEvent(event)) {
        this.persistence.upsertSession(session);
      }
      this.broadcast(outgoing);
      // Drain after broadcasting the completion so clients see the turn end
      // before the next queued message's events arrive.
      if (shouldDrain) {
        this.drainQueue(event.sessionId);
      }
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
    this.localSubagentSourceMtimes.clear();
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

        // mtime gate: the list walk surfaces the transcript mtime as updatedAt
        // without parsing the file. While a run is active, the vast majority of
        // poll ticks see an unchanged subagent transcript, so skip the
        // expensive full re-read/re-parse when the on-disk freshness signal is
        // unchanged and we already hold a normalized session. The final
        // markIdle pass always runs so running->idle still settles.
        const diskMtime = metadata.updatedAt;
        const previousDiskMtime = this.localSubagentSourceMtimes.get(metadata.id);
        const diskUnchanged =
          options.markIdle !== true &&
          current !== undefined &&
          diskMtime !== undefined &&
          previousDiskMtime === diskMtime;

        if (diskUnchanged) {
          continue;
        }

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
        if (diskMtime !== undefined) {
          this.localSubagentSourceMtimes.set(metadata.id, diskMtime);
        }

        if (this.localSessionFingerprints.get(session.id) === fingerprint) {
          continue;
        }

        this.localSessionFingerprints.set(session.id, fingerprint);
        const previousSession = this.sessions[session.id];
        this.sessions[session.id] = session;

        // When only the runtime status/timestamp advanced (no timeline change),
        // broadcast a lightweight patch instead of the whole session. Any change
        // to the timeline content — including an in-place body/output mutation of
        // an existing item (same id/count) — must ship a full update so the
        // client doesn't keep a stale body. We only reach this code when the
        // session fingerprint already changed, so the stringify is not per-tick.
        const timelineSignature = (target: SessionContent) =>
          JSON.stringify({
            items: target.items,
            pendingItems: target.pendingItems
          });
        const itemsUnchanged =
          previousSession !== undefined &&
          timelineSignature(previousSession) === timelineSignature(session);

        if (itemsUnchanged) {
          this.broadcast({
            id: randomUUID(),
            type: "session.patch",
            sessionId: session.id,
            runtimeStatus: session.runtimeStatus,
            updatedAt: session.updatedAt
          });
          continue;
        }

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
    canDelegateProvider(provider) &&
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
