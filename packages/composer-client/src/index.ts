export type AgentModel = string;
export type SessionProvider = "codex" | "claude" | "meta";
export type DelegateSessionProvider = Extract<SessionProvider, "codex" | "claude">;
export type PermissionMode = "Default permissions" | "Auto-review" | "Full access";
export type IntelligenceMode = "Low" | "Medium" | "High" | "Extra High";

export type AgentImageAttachment = {
  name: string;
  mediaType: string;
  dataUrl?: string;
  path?: string;
};

export type {
  AgentSessionRuntimeStatus,
  AgentSettings,
  ApprovalDecision,
  ApprovalRequest,
  CapabilityProvider,
  ComposerCapability,
  ComposerCapabilityCatalog,
  ComposerCapabilityCategory,
  ComposerCapabilityComponent,
  ComposerCapabilityKind,
  ComposerCapabilitySource,
  ComposerChatDataTypes,
  ConversationAttachment,
  ConversationItem,
  DiffRowData,
  FileChangeRow,
  FileChangeSummaryItem,
  PendingConversationItem,
  Project,
  ProjectThread,
  ProviderSessionState,
  QueuedUserMessage,
  ReviewBranchComparison,
  ReviewBranchList,
  ReviewBranchRef,
  ReviewDiff,
  ReviewDiffFile,
  ReviewDiffHunk,
  ReviewDiffLine,
  ReviewDiffScope,
  SessionCompactionSummary,
  SessionContent,
  SessionHandoffSummary,
  SessionRenderMode,
  SessionSnapshot,
  ToolDetail,
  ToolStatus
} from "./types.js";
export type { LiveAgentEvent } from "./types.js";
export {
  applyLiveSessionEvent,
  applyLiveSessionEvents,
  settleRunningToolGroups,
  toolDetail
} from "./session-reducer.js";
export type { ApplyEventOptions } from "./session-reducer.js";
import type { SessionCompactionSummary } from "./types.js";

export type BaseLiveAgentEvent = {
  id: string;
  type: string;
  [key: string]: unknown;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type WebSocketConstructor = new (
  url: string | URL,
  protocols?: string | string[]
) => WebSocket;
type JsonRecord = Record<string, unknown>;

export type ComposerClientOptions = {
  httpUrl: string;
  wsUrl?: string;
  fetch?: FetchLike;
  WebSocket?: WebSocketConstructor;
};

export type ProviderModelOption = {
  value: AgentModel;
  label: string;
  detail: string;
  efforts: IntelligenceMode[];
};

export type RuntimeProviderDefinition = {
  id: SessionProvider;
  label: string;
  statusLabel: string;
  defaultModel: AgentModel;
  defaultModelLabel: string;
  modelOptions: ProviderModelOption[];
  defaultIntelligence: IntelligenceMode;
  canDelegate: boolean;
};

const metaPlannerReviewEnabled = runtimeFeatureEnabled(
  "COMPOSER_ENABLE_META_PLANNER_REVIEW"
) || runtimeFeatureEnabled("VITE_COMPOSER_ENABLE_META_PLANNER_REVIEW");

const metaPlannerReviewOption = {
  value: "meta-planner-review",
  label: "Planner review",
  detail: "Claude plans high, Codex executes low",
  efforts: ["High"]
} satisfies ProviderModelOption;

const metaParallelInitialOption = {
  value: "meta-parallel-initial",
  label: "Compose agents",
  detail: "Run Codex and Claude side by side, then choose one to continue",
  efforts: ["High"]
} satisfies ProviderModelOption;

const providerDefinitions = [
  {
    id: "codex",
    label: "Codex",
    statusLabel: "Codex",
    defaultModel: "gpt-5.5",
    defaultModelLabel: "Codex",
    defaultIntelligence: "Medium",
    canDelegate: true,
    modelOptions: [
      {
        value: "gpt-5.5",
        label: "GPT-5.5",
        detail: "Frontier coding model",
        efforts: ["Low", "Medium", "High", "Extra High"]
      }
    ]
  },
  {
    id: "claude",
    label: "Claude",
    statusLabel: "Claude",
    defaultModel: "claude-sonnet-4-6",
    defaultModelLabel: "Claude Code",
    defaultIntelligence: "High",
    canDelegate: true,
    modelOptions: [
      {
        value: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        detail: "Balanced Claude Code model",
        efforts: ["Low", "Medium", "High"]
      },
      {
        value: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        detail: "Deep reasoning model",
        efforts: ["Low", "Medium", "High", "Extra High"]
      }
    ]
  },
  {
    id: "meta",
    label: "Compose",
    statusLabel: "Compose agent",
    defaultModel: "meta-parallel-initial",
    defaultModelLabel: "Compose supervisor",
    defaultIntelligence: "High",
    canDelegate: false,
    modelOptions: [
      ...(metaPlannerReviewEnabled ? [metaPlannerReviewOption] : []),
      metaParallelInitialOption
    ]
  }
] satisfies RuntimeProviderDefinition[];

export const runtimeProviderDefinitions = providerDefinitions;

export const runtimeProviderRegistry = Object.fromEntries(
  runtimeProviderDefinitions.map((definition) => [definition.id, definition])
) as Record<SessionProvider, RuntimeProviderDefinition>;

export const defaultModelsByProvider = Object.fromEntries(
  runtimeProviderDefinitions.map((definition) => [
    definition.id,
    definition.defaultModel
  ])
) as Record<SessionProvider, AgentModel>;

export const defaultIntelligenceByProvider = Object.fromEntries(
  runtimeProviderDefinitions.map((definition) => [
    definition.id,
    definition.defaultIntelligence
  ])
) as Record<SessionProvider, IntelligenceMode>;

export const delegateProviderIds = runtimeProviderDefinitions
  .filter((definition) => definition.canDelegate)
  .map((definition) => definition.id) as DelegateSessionProvider[];

export function providerDefinition(provider: SessionProvider) {
  return runtimeProviderRegistry[provider];
}

export function providerLabel(provider: SessionProvider) {
  return providerDefinition(provider).label;
}

export function providerStatusLabel(provider: SessionProvider) {
  return providerDefinition(provider).statusLabel;
}

export function providerModelOptions(provider: SessionProvider) {
  return providerDefinition(provider).modelOptions;
}

export function providerDefaultModel(provider: SessionProvider) {
  return providerDefinition(provider).defaultModel;
}

export function providerDefaultIntelligence(provider: SessionProvider) {
  return providerDefinition(provider).defaultIntelligence;
}

export function providerModelOption(
  provider: SessionProvider,
  value: AgentModel
) {
  const models = providerModelOptions(provider);
  return models.find((option) => option.value === value) ?? models[0];
}

export function providerModelDisplayLabel(
  provider: SessionProvider,
  model?: AgentModel
) {
  if (provider === "meta") {
    if (
      metaPlannerReviewEnabled &&
      (model === "meta-claude-opus-codex-mini" ||
        model === "meta-planner-review")
    ) {
      return "Opus plan -> GPT-5.5";
    }

    if (
      model === "meta-parallel-initial" ||
      model === "meta-planner-review" ||
      // Reconstructed parallel sessions persist these as their model string;
      // map them to the brand label so loaded sessions read "Compose agents".
      model === "Compose agents" ||
      model === "Compare agents" ||
      model === "Codex + Claude parallel"
    ) {
      return "Compose agents";
    }
  }

  return model ?? providerDefinition(provider).defaultModelLabel;
}

function runtimeFeatureEnabled(name: string) {
  const processEnv = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const viteEnv = (import.meta as {
    env?: Record<string, string | undefined>;
  }).env;
  const value = processEnv?.[name] ?? viteEnv?.[name];

  return value === "1" || value === "true";
}

export function canDelegateProvider(
  provider: SessionProvider
): provider is DelegateSessionProvider {
  return providerDefinition(provider).canDelegate;
}

export function isRuntimeProviderId(value: unknown): value is SessionProvider {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(runtimeProviderRegistry, value)
  );
}

export function parseSessionProvider(
  value: unknown,
  fallback: SessionProvider = "codex"
): SessionProvider {
  return isRuntimeProviderId(value) ? value : fallback;
}

export function parseProviderModel(
  value: unknown,
  provider: SessionProvider
): AgentModel | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const model = value.trim();
  const allowedModels = new Set([
    ...providerModelOptions(provider).map((option) => option.value),
    ...(provider === "meta" ? ["meta-claude-opus-codex-mini"] : [])
  ]);

  return allowedModels.has(model) ? model : undefined;
}

export type ComposerChatRequest = {
  requestId?: string;
  sessionId?: string;
  provider: SessionProvider;
  prompt: string;
  cwd?: string;
  workTarget?: "local" | "worktree";
  branch?: string | null;
  permissionMode: PermissionMode;
  intelligence: IntelligenceMode;
  model?: AgentModel;
  composeAgents?: Partial<
    Record<
      DelegateSessionProvider,
      {
        model?: AgentModel;
        intelligence?: IntelligenceMode;
      }
    >
  >;
  imageAttachments?: AgentImageAttachment[];
  signal?: AbortSignal;
};

export type ComposerInterruptRequest =
  | { sessionId: string; requestId?: never }
  | { requestId: string; sessionId?: never };

export type ComposerCompactRequest = {
  sessionId: string;
  provider?: SessionProvider;
  model?: AgentModel;
  permissionMode?: PermissionMode;
  intelligence?: IntelligenceMode;
};

export type ReviewDiffRequest = {
  cwd: string;
  scope: "unstaged" | "staged" | "commit" | "branch";
  filePath?: string;
  filePaths?: string[];
  branchHeadRef?: string;
  branchBaseRef?: string;
};

export type CapabilityContent = {
  path: string;
  content: string;
};

export type LoadSessionOptions = {
  /**
   * Maximum number of most-recent timeline items to fetch. Omit to load the
   * full session content. Forwarded as the `limit` query param; the server may
   * ignore it until server-side pagination is implemented.
   */
  limit?: number;
  /**
   * Opaque cursor (e.g. an item id) identifying the oldest already-loaded
   * item; the server returns history older than this cursor. Forwarded as the
   * `before` query param; the server may ignore it for now.
   */
  before?: string;
};

export type ComposerEventSocket<
  LiveEvent extends BaseLiveAgentEvent = BaseLiveAgentEvent
> = {
  close: () => void;
  interrupt: (request: ComposerInterruptRequest) => void;
  requestSnapshot: () => void;
  resolveApproval: (
    approvalId: string,
    decision: "accept" | "acceptForSession" | "decline" | "cancel"
  ) => void;
  send: (message: JsonRecord) => void;
  socket: WebSocket;
  readonly __eventType?: LiveEvent;
};

export type ComposerEventSocketOptions<
  LiveEvent extends BaseLiveAgentEvent = BaseLiveAgentEvent
> = {
  onEvent: (event: LiveEvent) => void;
  onClose?: () => void;
  onMalformedEvent?: (error: unknown) => void;
};

export class ComposerClientHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ComposerClientHttpError";
    this.status = status;
    this.body = body;
  }
}

export class ComposerClient<
  LiveEvent extends BaseLiveAgentEvent = BaseLiveAgentEvent,
  SessionSnapshot = unknown,
  ReviewDiff = unknown,
  ReviewBranchList = unknown,
  ComposerCapabilityCatalog = unknown,
  CapabilityContentResult = CapabilityContent
> {
  readonly httpUrl: string;
  readonly wsUrl?: string;
  private readonly fetcher: FetchLike;
  private readonly WebSocketCtor?: WebSocketConstructor;

  constructor(options: ComposerClientOptions) {
    this.httpUrl = options.httpUrl.replace(/\/+$/u, "");
    this.wsUrl = options.wsUrl;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
  }

  async *chatEvents(
    request: ComposerChatRequest
  ): AsyncGenerator<LiveEvent, void, void> {
    const { signal, ...payload } = request;
    const response = await this.fetcher(this.url("/api/chat"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal
    });

    await assertOk(response, "Agent request failed");

    yield* this.readLiveAgentEvents(response);
  }

  async chat(
    request: ComposerChatRequest,
    onEvent?: (event: LiveEvent) => void
  ) {
    for await (const event of this.chatEvents(request)) {
      onEvent?.(event);
    }
  }

  async interrupt(request: ComposerInterruptRequest) {
    await this.postJson("/api/interrupt", request, "Agent interrupt failed");
  }

  // "Send now": act on a queued message immediately (Codex injects it into the
  // running turn; Claude interrupts so the queue drains). Targets the front of
  // the queue by default, or a specific queued message by id.
  async steer(sessionId: string, queuedId?: string) {
    await this.postJson(
      "/api/sessions/steer",
      { sessionId, queuedId },
      "Steer failed"
    );
  }

  // Remove a not-yet-run queued message.
  async cancelQueuedMessage(
    sessionId: string,
    queuedId: string
  ): Promise<SessionSnapshot | undefined> {
    const body = await this.postJson<{ snapshot?: SessionSnapshot }>(
      "/api/sessions/queue/cancel",
      { sessionId, queuedId },
      "Cancel queued message failed"
    );

    return body.snapshot;
  }

  // Reorder the queue to the given id order (drag-to-prioritize).
  async reorderQueue(
    sessionId: string,
    orderedIds: string[]
  ): Promise<SessionSnapshot | undefined> {
    const body = await this.postJson<{ snapshot?: SessionSnapshot }>(
      "/api/sessions/queue/reorder",
      { sessionId, orderedIds },
      "Reorder queue failed"
    );

    return body.snapshot;
  }

  async compactSession(
    request: ComposerCompactRequest
  ): Promise<{ ok: boolean; compaction?: SessionCompactionSummary }> {
    return this.postJson(
      "/api/sessions/compact",
      request,
      "Session compaction failed"
    );
  }

  async updateSessionVisibility(
    sessionId: string,
    action: "archive"
  ): Promise<SessionSnapshot | undefined> {
    const body = await this.postJson<{ snapshot?: SessionSnapshot }>(
      "/api/sessions/visibility",
      { sessionId, action },
      "Session visibility update failed"
    );

    return body.snapshot;
  }

  async renameSession(
    sessionId: string,
    title: string
  ): Promise<SessionSnapshot | undefined> {
    const body = await this.postJson<{ snapshot?: SessionSnapshot }>(
      "/api/sessions/rename",
      { sessionId, title },
      "Session rename failed"
    );

    return body.snapshot;
  }

  async adoptParallelThread(
    sessionId: string,
    provider: DelegateSessionProvider
  ): Promise<SessionSnapshot | undefined> {
    const body = await this.postJson<{ snapshot?: SessionSnapshot }>(
      "/api/sessions/adopt-parallel",
      { sessionId, provider },
      "Parallel thread adoption failed"
    );

    return body.snapshot;
  }

  async loadSession<SessionContent = unknown>(
    sessionId: string,
    options?: LoadSessionOptions
  ): Promise<SessionContent | undefined> {
    // Without options this fetches the full SessionContent (no history is
    // dropped). When `limit`/`before` are supplied they are forwarded as query
    // params so the server can return only the most-recent N timeline items
    // and lazy-load older history via the `before` cursor. The server may
    // ignore these params for now (returning the full content) until
    // server-side pagination lands.
    const query = new URLSearchParams();

    if (typeof options?.limit === "number") {
      query.set("limit", String(options.limit));
    }

    if (options?.before) {
      query.set("before", options.before);
    }

    const search = query.toString();
    const response = await this.fetcher(
      this.url(
        `/api/sessions/${encodeURIComponent(sessionId)}${
          search ? `?${search}` : ""
        }`
      )
    );

    await assertOk(response, "Session load failed");
    const body = await response.json() as { session?: SessionContent };

    return body.session;
  }

  async loadReviewDiff(request: ReviewDiffRequest): Promise<ReviewDiff> {
    return this.postJson<ReviewDiff>(
      "/api/review/diff",
      request,
      "Review request failed"
    );
  }

  async loadReviewBranches(cwd: string): Promise<ReviewBranchList> {
    return this.postJson<ReviewBranchList>(
      "/api/review/branches",
      { cwd },
      "Branch request failed"
    );
  }

  async checkoutBranch(cwd: string, branch: string): Promise<ReviewBranchList> {
    return this.postJson<ReviewBranchList>(
      "/api/git/checkout-branch",
      { cwd, branch },
      "Branch checkout failed"
    );
  }

  async loadCapabilities(): Promise<ComposerCapabilityCatalog> {
    const response = await this.fetcher(this.url("/api/capabilities"));
    await assertOk(response, "Capabilities request failed");
    return response.json() as Promise<ComposerCapabilityCatalog>;
  }

  async readCapabilityContent(path: string): Promise<CapabilityContentResult> {
    const response = await this.fetcher(
      this.url(`/api/capabilities/content?path=${encodeURIComponent(path)}`)
    );

    await assertOk(response, "Capability content request failed");
    return response.json() as Promise<CapabilityContentResult>;
  }

  openEventSocket(
    options: ComposerEventSocketOptions<LiveEvent>
  ): ComposerEventSocket<LiveEvent> {
    if (!this.wsUrl) {
      throw new Error("Composer websocket URL is not configured");
    }

    const WebSocketCtor = this.WebSocketCtor;

    if (!WebSocketCtor) {
      throw new Error("WebSocket is not available in this environment");
    }

    const socket = new WebSocketCtor(this.wsUrl);
    const send = (message: JsonRecord) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(message));
      }
    };

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as unknown;

        if (isLiveAgentEvent(event)) {
          options.onEvent(event as LiveEvent);
        }
      } catch (error) {
        options.onMalformedEvent?.(error);
      }
    };

    socket.onclose = () => {
      options.onClose?.();
    };

    return {
      close: () => socket.close(),
      interrupt: (request) => send({ type: "session.interrupt", ...request }),
      requestSnapshot: () => send({ type: "session.list" }),
      resolveApproval: (approvalId, decision) =>
        send({ type: "approval.resolve", approvalId, decision }),
      send,
      socket
    };
  }

  listen(
    options: ComposerEventSocketOptions<LiveEvent>
  ): ComposerEventSocket<LiveEvent> {
    return this.openEventSocket(options);
  }

  async *readLiveAgentEvents(response: Response): AsyncGenerator<LiveEvent> {
    if (!response.body) {
      await response.text();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          buffer += decoder.decode();
          completed = true;
          yield* parseComposerStreamEvents<LiveEvent>(buffer);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lastLineBreak = buffer.lastIndexOf("\n");

        if (lastLineBreak === -1) {
          continue;
        }

        yield* parseComposerStreamEvents<LiveEvent>(
          buffer.slice(0, lastLineBreak + 1)
        );
        buffer = buffer.slice(lastLineBreak + 1);
      }
    } finally {
      if (!completed) {
        await reader.cancel().catch(() => undefined);
      }

      reader.releaseLock();
    }
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    fallbackMessage: string
  ): Promise<T> {
    const response = await this.fetcher(this.url(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    await assertOk(response, fallbackMessage);
    return response.json() as Promise<T>;
  }

  private url(path: string) {
    return `${this.httpUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }
}

export function parseComposerStreamEvents<
  LiveEvent extends BaseLiveAgentEvent = BaseLiveAgentEvent
>(chunk: string): LiveEvent[] {
  const events: LiveEvent[] = [];

  for (const line of chunk.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("data:")) {
      continue;
    }

    const payload = trimmed.slice("data:".length).trim();

    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const message = JSON.parse(payload) as unknown;
      const event = unwrapLiveAgentEvent(message);

      if (event) {
        events.push(event as LiveEvent);
      }
    } catch {
      // Ignore non-JSON stream control frames.
    }
  }

  return events;
}

function unwrapLiveAgentEvent(value: unknown): BaseLiveAgentEvent | null {
  if (isRecord(value) && value.type === "data-composer") {
    return isLiveAgentEvent(value.data) ? value.data : null;
  }

  return isLiveAgentEvent(value) ? value : null;
}

function isLiveAgentEvent(value: unknown): value is BaseLiveAgentEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string"
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

async function assertOk(response: Response, fallbackMessage: string) {
  if (response.ok) {
    return;
  }

  const { body, message } = await readErrorBody(response);
  throw new ComposerClientHttpError(
    message ?? `${fallbackMessage} with ${response.status}`,
    response.status,
    body
  );
}

async function readErrorBody(response: Response) {
  try {
    const body = await response.json() as unknown;

    if (isRecord(body)) {
      const message =
        typeof body.error === "string"
          ? body.error
          : typeof body.message === "string"
            ? body.message
            : null;

      return { body, message };
    }

    return { body, message: null };
  } catch {
    return { body: null, message: null };
  }
}
