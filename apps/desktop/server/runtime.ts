import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  updateLocalSessionVisibility,
  type LocalSessionAction
} from "../electron/session-loader.js";
import { ClaudeProvider } from "./providers/claude.js";
import { CodexProvider } from "./providers/codex.js";
import { MetaProvider } from "./providers/meta.js";
import type {
  AgentSettings,
  AgentImageAttachment,
  ApprovalDecision,
  ApprovalRequest,
  LiveAgentEvent,
  Project,
  SessionContent,
  SessionHandoffSummary,
  SessionProvider,
  SessionSnapshot,
  ToolDetail
} from "../src/types.js";

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
};

type ProviderRunRequest = RunRequest & {
  session: SessionContent;
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
  compact?(request: ProviderCompactRequest): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  dispose(): Promise<void> | void;
}

type ApprovalResolver = (decision: ApprovalDecision) => void;
type RuntimeSessionProvider = SessionProvider;

export class AgentRuntime {
  private sessions: Record<string, SessionContent>;
  private broadcastListeners = new Set<EventSink>();
  private approvals = new Map<string, ApprovalResolver>();
  private providers: Record<RuntimeSessionProvider, AgentProvider>;
  private activeRuns = new Map<string, Promise<void>>();
  private activeRunProviders = new Map<string, RuntimeSessionProvider>();
  private requestSessions = new Map<string, string>();
  private interruptedRequestIds = new Set<string>();
  private interruptedSessions = new Set<string>();

  constructor(snapshot: SessionSnapshot) {
    this.sessions = { ...snapshot.sessions };
    this.providers = {
      meta: new MetaProvider(),
      codex: new CodexProvider(),
      claude: new ClaudeProvider()
    };
  }

  snapshot(): SessionSnapshot {
    return {
      sessions: this.sessions,
      projects: buildProjects(this.sessions)
    };
  }

  onBroadcast(listener: EventSink) {
    this.broadcastListeners.add(listener);
    return () => this.broadcastListeners.delete(listener);
  }

  createSession(request: CreateRequest, sink: EventSink) {
    if (!isRuntimeProvider(request.provider)) {
      throw new Error(`Unsupported live provider: ${request.provider}`);
    }

    const id = `${request.provider}-live-${randomUUID()}`;
    const session: SessionContent = {
      id,
      provider: request.provider,
      providerSessions: {},
      contextVersion: 0,
      runtimeStatus: "running",
      title: titleFromPrompt(request.prompt),
      cwd: request.cwd,
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
    if (request.requestId) {
      this.requestSessions.set(request.requestId, id);
    }
    this.emitToSink(sink, { id: randomUUID(), type: "session.started", session });
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

  sendMessage(request: RunRequest, sink: EventSink) {
    const session = this.sessions[request.sessionId];

    if (!session) {
      throw new Error(`Unknown session ${request.sessionId}`);
    }

    const provider = request.provider ?? session.lastProvider ?? session.provider;

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

  updateSessionVisibility(sessionId: string, action: LocalSessionAction) {
    const session = this.sessions[sessionId];

    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    updateLocalSessionVisibility(session, action);
    delete this.sessions[sessionId];

    const snapshot = this.snapshot();
    this.broadcast({
      id: randomUUID(),
      type: "sessions.snapshot",
      snapshot
    });

    return snapshot;
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

    const run = (async () => {
      await this.compactPreviousProviderForHandoff(
        parentSession,
        previousProvider,
        provider,
        request
      );

      const providerSession = sessionForProvider(parentSession, provider);
      const contextVersion = (parentSession.contextVersion ?? 0) + 1;
      const prompt = coherentPrompt({
        session: parentSession,
        provider,
        previousProvider,
        prompt: request.prompt,
        contextVersion
      });

      parentSession.contextVersion = contextVersion;
      parentSession.lastProvider = provider;
      parentSession.model = providerModel(provider, request.settings.model);
      this.activeRunProviders.set(request.sessionId, provider);

      if (this.interruptedSessions.has(request.sessionId)) {
        return;
      }

      await this.providers[provider].run({
          ...request,
          prompt,
          session: providerSession
        });

      syncProviderState(parentSession, provider, providerSession);
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
  ) {
    if (
      !previousProvider ||
      previousProvider === nextProvider ||
      !isRuntimeProvider(previousProvider)
    ) {
      return;
    }

    const provider = this.providers[previousProvider];

    if (!provider.compact) {
      return;
    }

    const providerSession = sessionForProvider(session, previousProvider);

    if (!providerSession.providerSessionId) {
      return;
    }

    this.activeRunProviders.set(request.sessionId, previousProvider);

    try {
      await provider.compact({
        sessionId: request.sessionId,
        session: providerSession,
        settings: request.settings,
        reason: `handoff from ${providerLabel(previousProvider)} to ${providerLabel(nextProvider)}`,
        emit: request.emit
      });
    } catch (error) {
      const toolId = `${request.sessionId}-handoff-compact-skipped-${Date.now()}`;
      request.emit({
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
      });
      request.emit({
        id: randomUUID(),
        type: "tool.completed",
        sessionId: request.sessionId,
        toolId
      });
    }

    syncProviderState(session, previousProvider, providerSession);
    this.apply({
      id: randomUUID(),
      type: "session.updated",
      session
    });
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
      this.broadcast(event);
      return;
    }

    if (event.type === "approval.requested") {
      const session = this.sessions[event.approval.sessionId];

      if (session) {
        applySessionEvent(session, event);
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
      this.broadcast({
        id: randomUUID(),
        type: "session.updated",
        session
      });
      return;
    }

    this.broadcast(event);
  }

  private broadcast(event: LiveAgentEvent) {
    for (const listener of this.broadcastListeners) {
      listener(event);
    }
  }
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
    } else {
      session.items.push({
        id: event.messageId,
        type: "assistant_message",
        body: event.delta
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
    }
    return;
  }

  if (event.type === "tool.started") {
    session.items.push({
      id: event.toolId,
      type: "tool_group",
      summary: event.label,
      details: event.detail ? [event.detail] : [toolDetail(event.toolId, event.label)],
      defaultOpen: false
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

    if (!tool.details.includes(output)) {
      tool.details.push(output);
    }
    return;
  }

  if (event.type === "tool.completed" && event.detail) {
    const tool = session.items.find(
      (item) => item.type === "tool_group" && item.id === event.toolId
    );

    if (tool?.type === "tool_group") {
      tool.details.push(event.detail);
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
    appendErrorNotice(session, event.message);
    return;
  }

  if (event.type === "turn.completed") {
    session.runtimeStatus = event.status;
    session.pendingItems = [];
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
    providerSessionId: providerState?.sessionId ?? legacySessionId,
    model: providerModel(provider),
    pendingItems: []
  };
}

function syncProviderState(
  session: SessionContent,
  provider: RuntimeSessionProvider,
  providerSession: SessionContent
) {
  const providerSessions = {
    ...(session.providerSessions ?? {}),
    ...(providerSession.providerSessions ?? {})
  };
  const current = providerSessions[provider] ?? {};

  providerSessions[provider] = {
    ...current,
    sessionId: providerSession.providerSessionId ?? current.sessionId
  };

  session.providerSessions = providerSessions;

  session.compactionSummaries = mergeById(
    session.compactionSummaries ?? [],
    providerSession.compactionSummaries ?? []
  ).slice(-12);

  if (session.provider === provider && providerSession.providerSessionId) {
    session.providerSessionId = providerSession.providerSessionId;
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
  const handoffExists = session.handoffSummaries?.some(
    (summary) =>
      summary.provider === resolvedProvider &&
      summary.contextVersion === contextVersion
  );

  if (!handoffExists) {
    const summary = buildHandoffSummary(session, resolvedProvider, contextVersion);
    session.handoffSummaries = [
      ...(session.handoffSummaries ?? []),
      summary
    ].slice(-12);
  }

  const providerSessions = { ...(session.providerSessions ?? {}) };
  const state = providerSessions[resolvedProvider] ?? {};
  providerSessions[resolvedProvider] = {
    ...state,
    lastContextVersion: contextVersion
  };
  session.providerSessions = providerSessions;
}

function coherentPrompt({
  session,
  provider,
  previousProvider,
  prompt,
  contextVersion
}: {
  session: SessionContent;
  provider: RuntimeSessionProvider;
  previousProvider?: SessionProvider;
  prompt: string;
  contextVersion: number;
}) {
  const providerState = session.providerSessions?.[provider];
  const staleProviderContext =
    providerState?.lastContextVersion !== undefined &&
    providerState.lastContextVersion < (session.contextVersion ?? 0);
  const lines = [
    "Composer context packet. Treat this packet as authoritative when it conflicts with older provider-local memory. Do not quote it back unless it is directly useful.",
    `Context version: ${contextVersion}`,
    `Session title: ${session.title}`,
    `Current delegate: ${providerLabel(provider)}`,
    previousProvider && previousProvider !== provider
      ? `Provider switch: previous turn used ${providerLabel(previousProvider)}; this turn uses ${providerLabel(provider)}.`
      : `Provider continuity: this turn uses ${providerLabel(provider)}.`,
    staleProviderContext
      ? `Provider-local memory may be stale; it last saw context version ${providerState?.lastContextVersion}.`
      : undefined,
    "",
    "Session rules:",
    "- The Composer transcript, current workspace, and this context packet are the source of truth.",
    "- Preserve unresolved decisions and assumptions from previous handoffs.",
    "- Inspect files or command output again when the workspace state matters.",
    "- End with a concise handoff summary covering changes, verification, risks, and next owner when relevant.",
    "",
    "Recent user requests:",
    recentUserRequests(session),
    "",
    "Recent provider handoffs:",
    recentHandoffs(session),
    "",
    "Native provider compactions:",
    recentCompactions(session),
    "",
    "Workspace snapshot:",
    workspaceSnapshot(session),
    "",
    "User request:",
    prompt
  ].filter((line): line is string => typeof line === "string");

  return lines.join("\n");
}

function recentUserRequests(session: SessionContent) {
  const requests = session.items
    .filter((item) => item.type === "user_message")
    .slice(-4)
    .map((item) => `- ${truncateText(item.body, 700)}`);

  return requests.length > 0 ? requests.join("\n") : "- None recorded";
}

function recentHandoffs(session: SessionContent) {
  const summaries = (session.handoffSummaries ?? [])
    .slice(-5)
    .map((summary) => [
      `- ${providerLabel(summary.provider)} at context v${summary.contextVersion}: ${truncateText(summary.summary, 500)}`,
      summary.filesChanged.length > 0
        ? `  Files: ${summary.filesChanged.slice(0, 8).join(", ")}`
        : undefined,
      summary.commandsRun.length > 0
        ? `  Commands: ${summary.commandsRun.slice(0, 6).join(" | ")}`
        : undefined,
      summary.testsRun.length > 0
        ? `  Verification: ${summary.testsRun.slice(0, 4).join(" | ")}`
        : undefined
    ].filter((line): line is string => Boolean(line)).join("\n"));

  return summaries.length > 0 ? summaries.join("\n") : "- No previous handoffs";
}

function recentCompactions(session: SessionContent) {
  const summaries = (session.compactionSummaries ?? [])
    .slice(-4)
    .map((summary) => {
      const tokenRange =
        summary.preTokens !== undefined
          ? ` (${summary.preTokens}${summary.postTokens !== undefined ? ` -> ${summary.postTokens}` : ""} tokens)`
          : "";
      return `- ${providerLabel(summary.provider)} ${summary.trigger ?? "unknown"} compact at context v${summary.contextVersion}${tokenRange}: ${truncateText(summary.summary, 500)}`;
    });

  return summaries.length > 0 ? summaries.join("\n") : "- No native compactions recorded";
}

function workspaceSnapshot(session: SessionContent) {
  const cwd = defaultCwd(session);
  const status = runGit(cwd, ["status", "--short"]);
  const diffStat = runGit(cwd, ["diff", "--stat", "--", "."]);
  const lines = [`- CWD: ${cwd}`];

  if (status === null) {
    lines.push("- Git status: unavailable or not a git repository");
  } else {
    lines.push(`- Git status: ${status || "clean"}`);
  }

  if (diffStat) {
    lines.push(`- Diff stat: ${diffStat}`);
  }

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

function buildHandoffSummary(
  session: SessionContent,
  provider: RuntimeSessionProvider,
  contextVersion: number
): SessionHandoffSummary {
  const turnItems = latestTurnItems(session);
  const assistantText = turnItems
    .filter((item) => item.type === "assistant_message")
    .map((item) => item.body.trim())
    .filter(Boolean)
    .at(-1);
  const commandsRun = uniqueStrings(extractCommands(turnItems)).slice(0, 12);
  const filesChanged = uniqueStrings(extractFiles(turnItems)).slice(0, 16);

  return {
    id: `${session.id}-handoff-${contextVersion}-${provider}`,
    provider,
    contextVersion,
    createdAt: new Date().toISOString(),
    summary: assistantText
      ? truncateText(assistantText, 1_000)
      : `${providerLabel(provider)} completed a turn with no assistant summary text.`,
    filesChanged,
    commandsRun,
    testsRun: commandsRun.filter(commandLooksLikeVerification)
  };
}

function latestTurnItems(session: SessionContent): SessionContent["items"] {
  let startIndex = session.items.length > 0 ? session.items.length - 1 : 0;

  for (let index = session.items.length - 1; index >= 0; index -= 1) {
    if (session.items[index]?.type === "user_message") {
      startIndex = index;
      break;
    }
  }

  return session.items.slice(startIndex);
}

function extractCommands(items: SessionContent["items"]) {
  return items.flatMap((item) => {
    if (item.type !== "tool_group") {
      return [];
    }

    return item.details
      .map((detail) => detail.command)
      .filter((command): command is string => Boolean(command));
  });
}

function extractFiles(items: SessionContent["items"]) {
  return items.flatMap((item) => {
    if (item.type === "file_change_summary") {
      return item.files.map((file) => file.path);
    }

    if (item.type !== "tool_group") {
      return [];
    }

    return item.details.flatMap((detail) => [
      detail.path,
      detail.args?.path,
      detail.args?.file,
      detail.args?.filePath
    ]).filter((value): value is string => Boolean(value));
  });
}

function commandLooksLikeVerification(command: string) {
  return /\b(build|check|jest|lint|playwright|test|tsc|typecheck|vitest)\b/i.test(command);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((item) => [item.id, item]));

  for (const item of incoming) {
    byId.set(item.id, item);
  }

  return [...byId.values()];
}

function truncateText(value: string, limit: number) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
}

function buildProjects(sessions: Record<string, SessionContent>): Project[] {
  const byWorkspace = new Map<string, SessionContent[]>();

  for (const session of Object.values(sessions)) {
    const cwd = normalizeCwd(session.cwd);
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
        threads: sortedSessions.map((session) => ({
          id: session.id,
          name: session.title,
          age: relativeAge(session.updatedAt),
          provider: session.provider,
          model: session.model,
          cwd: session.cwd
        }))
      };
    })
    .sort((a, b) => latestProjectTimestamp(b, sessions) - latestProjectTimestamp(a, sessions));
}

function isRuntimeProvider(
  provider: SessionProvider
): provider is RuntimeSessionProvider {
  return provider === "codex" || provider === "claude" || provider === "meta";
}

function providerLabel(provider: SessionProvider) {
  if (provider === "meta") {
    return "Hybrid agent";
  }

  return provider === "codex" ? "Codex" : "Claude";
}

function providerModel(provider: SessionProvider, model?: string) {
  if (provider === "meta" && model === "meta-claude-opus-codex-mini") {
    return "Opus plan -> GPT-5.4 Mini";
  }

  if (model) {
    return model;
  }

  if (provider === "meta") {
    return "Hybrid supervisor";
  }

  return provider === "codex" ? "Codex" : "Claude Code";
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
    ...project.threads.map((thread) => sessionTimestamp(sessions[thread.id]))
  );
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
