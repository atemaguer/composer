import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  extractPatchReviewFiles,
  patchReviewLabel,
  reviewFileFromCodexChange,
  type PatchReviewFile
} from "./patch-review.js";
import {
  archiveComposerSession,
  composerDelegateProviderSessionKeys,
  providerSessionKey,
  readComposerSessionRegistry,
  type ComposerProviderSessionRecord,
  type ComposerSessionEvent,
  type ComposerSessionRegistry,
  type ComposerSessionRecord
} from "./composer-session-registry.js";

type SessionProvider = "codex" | "claude" | "meta";
type ToolStatus = "running" | "completed" | "failed" | "cancelled";

type ToolDetail = {
  id: string;
  label: string;
  tone?: "default" | "command" | "error" | "summary" | "output";
  kind?: "call" | "output" | "summary";
  toolName?: string;
  action?: "read" | "edit" | "search" | "command" | "generate" | "other";
  args?: Record<string, string>;
  command?: string;
  output?: string;
  path?: string;
  status?: ToolStatus;
  reviewFiles?: PatchReviewFile[];
};

type ConversationAttachment = {
  id: string;
  type: "file" | "source-document";
  filename?: string;
  title?: string;
  mediaType?: string;
  url?: string;
};

type ConversationItem =
  | {
      id: string;
      type: "user_message";
      body: string;
      timestamp?: string;
      sortTimestamp?: string;
      steered?: boolean;
    }
  | {
      id: string;
      type: "assistant_message";
      body: string;
      provider?: SessionProvider;
      sortTimestamp?: string;
    }
  | {
      id: string;
      type: "turn_status";
      label: string;
    }
  | {
      id: string;
      type: "tool_group";
      summary: string;
      details: ToolDetail[];
      provider?: SessionProvider;
      sortTimestamp?: string;
      defaultOpen?: boolean;
      status?: ToolStatus;
    }
  | {
      id: string;
      type: "running_tool";
      label: string;
      status: ToolStatus;
      details?: ToolDetail[];
    }
  | {
      id: string;
      type: "attachment_group";
      attachments: ConversationAttachment[];
      timestamp?: string;
    }
  | {
      id: string;
      type: "hook_event";
      label: string;
    }
  | {
      id: string;
      type: "notice";
      label: string;
    }
  | {
      id: string;
      type: "jump_marker";
      label?: string;
    }
  | {
      id: string;
      type: "parallel_thread_group";
      columns: Array<{
        provider: SessionProvider;
        title: string;
        items: ConversationItem[];
      }>;
      prompt?: string;
    };

type ProjectThread = {
  id: string;
  name: string;
  age: string;
  active?: boolean;
  provider?: SessionProvider;
  model?: string;
  cwd?: string;
  parentSessionId?: string;
  subagent?: SubagentMetadata;
  children?: ProjectThread[];
};

type SubagentMetadata = {
  id?: string;
  nickname?: string;
  role?: string;
  type?: string;
  depth?: number;
};

type SessionRenderMode = "single" | "hybrid";

type ProviderSessionState = {
  sessionId?: string;
  cwd?: string;
  lastContextVersion?: number;
};

type Project = {
  id?: string;
  name: string;
  cwd?: string;
  provider?: SessionProvider;
  threads: ProjectThread[];
};

type SessionThreadNode = {
  session: SessionContent;
  children: SessionThreadNode[];
};

type SessionContent = {
  id: string;
  provider: SessionProvider;
  providerSessionId?: string;
  renderMode?: SessionRenderMode;
  parentSessionId?: string;
  subagent?: SubagentMetadata;
  providerSessions?: Partial<Record<SessionProvider, ProviderSessionState>>;
  contextVersion?: number;
  lastProvider?: SessionProvider;
  parallelAdoptedProvider?: "codex" | "claude";
  runtimeStatus?: "idle" | "running" | "awaiting_approval" | "error";
  contentLoaded?: boolean;
  title: string;
  updatedAt?: string;
  cwd?: string;
  displayCwd?: string;
  model?: string;
  items: ConversationItem[];
  pendingItems: Extract<ConversationItem, { type: "running_tool" }>[];
};

export type SessionSnapshot = {
  projects: Project[];
  sessions: Record<string, SessionContent>;
};

type JsonRecord = Record<string, unknown>;
export type LocalSessionAction = "archive";

const MAX_SESSIONS_PER_PROVIDER = 50;
const MAX_TEXT_LENGTH = 4_000;
const MAX_DETAIL_LENGTH = 520;

export function loadLocalSessions(): SessionSnapshot {
  return loadLocalSessionSnapshot({ includeItems: true });
}

export function loadLocalSessionList(): SessionSnapshot {
  return loadLocalSessionSnapshot({ includeItems: false });
}

export function loadLocalSessionContent(sessionId: string) {
  const registry = readComposerSessionRegistry();
  const sessionRecord = registry.sessions.find((session) => session.id === sessionId);

  if (sessionRecord && sessionRecord.status !== "archived") {
    const providerRecords = activeProviderRecordsForSession(
      sessionRecord,
      registry.providerSessions.filter((record) =>
        record.composerSessionId === sessionRecord.id
      )
    );
    const nativeSessions = uniqueSessionsById(
      providerRecords
        .map((record) =>
          loadNativeProviderSession(
            record.provider,
            record.providerSessionId,
            { includeItems: true }
          )
        )
        .filter((session): session is SessionContent => Boolean(session))
    );
    const nativeByProviderSession = nativeSessionMap(nativeSessions);
    const composerSessionByProviderSession = composerSessionByProviderSessionMap(registry);

    return composerSessionFromRecord(
      sessionRecord,
      providerRecords,
      registry.events,
      nativeByProviderSession,
      composerSessionByProviderSession,
      { includeItems: true }
    ) ?? undefined;
  }

  if (sessionId.startsWith("codex-")) {
    return loadNativeProviderSession("codex", sessionId.slice("codex-".length), {
      includeItems: true
    });
  }

  if (sessionId.startsWith("claude-")) {
    return loadNativeProviderSession("claude", sessionId.slice("claude-".length), {
      includeItems: true
    });
  }

  return undefined;
}

function loadLocalSessionSnapshot(options: { includeItems: boolean }): SessionSnapshot {
  const registry = readComposerSessionRegistry();
  const delegateKeys = composerDelegateProviderSessionKeys(registry);
  const claudeSessions = loadClaudeSessions(options);
  const codexSessions = loadCodexSessions(options);
  const nativeSessions = uniqueSessionsById([...claudeSessions, ...codexSessions]);
  const composerSessions = composerSessionsFromRegistry(
    registry,
    nativeSessions,
    options
  );
  const composerSessionByProviderSession = composerSessionByProviderSessionMap(registry);
  const localSessions = nativeSessions
    .filter((session) =>
      !session.providerSessionId ||
      !delegateKeys.has(delegateSessionKey(session.provider, session.providerSessionId))
    )
    .map((session) => remapSessionParentToComposer(session, composerSessionByProviderSession));
  const allSessions = uniqueSessionsById([...composerSessions, ...localSessions]);
  const sessions = Object.fromEntries(
    allSessions.map((session) => [
      session.id,
      session
    ])
  );

  return {
    projects: groupSessionsByWorkspace(allSessions),
    sessions
  };
}

function uniqueSessionsById(sessions: SessionContent[]) {
  return [...new Map(sessions.map((session) => [session.id, session])).values()];
}

function nativeSessionMap(nativeSessions: SessionContent[]) {
  return new Map(
    nativeSessions
      .filter((session) =>
        (session.provider === "codex" || session.provider === "claude") &&
        Boolean(session.providerSessionId)
      )
      .map((session) => [
        providerSessionKey(session.provider as "codex" | "claude", session.providerSessionId!),
        session
      ])
  );
}

function composerSessionByProviderSessionMap(registry: ComposerSessionRegistry) {
  return new Map(
    registry.providerSessions.map((record) => [
      providerSessionKey(record.provider, record.providerSessionId),
      record.composerSessionId
    ])
  );
}

function remapSessionParentToComposer(
  session: SessionContent,
  composerSessionByProviderSession: Map<string, string>
) {
  const parentSessionId = remapNativeParentSessionId(
    session.parentSessionId,
    session.provider,
    composerSessionByProviderSession
  );

  return parentSessionId === session.parentSessionId
    ? session
    : { ...session, parentSessionId };
}

function delegateSessionKey(provider: SessionProvider, providerSessionId: string) {
  if (provider !== "codex" && provider !== "claude") {
    return `${provider}:${providerSessionId}`;
  }

  return `${provider}:${providerSessionId}`;
}

function composerSessionsFromRegistry(
  registry: ComposerSessionRegistry,
  nativeSessions: SessionContent[],
  options: { includeItems: boolean }
) {
  const nativeByProviderSession = nativeSessionMap(nativeSessions);
  const composerSessionByProviderSession = composerSessionByProviderSessionMap(registry);
  const sessions: SessionContent[] = [];

  for (const sessionRecord of registry.sessions) {
    if (sessionRecord.status === "archived") {
      continue;
    }

    const providerRecords = registry.providerSessions.filter((record) =>
      record.composerSessionId === sessionRecord.id
    );

    if (providerRecords.length === 0) {
      continue;
    }

    const activeRecords = activeProviderRecordsForSession(sessionRecord, providerRecords);

    if (activeRecords.length === 0) {
      continue;
    }

    const session = composerSessionFromRecord(
      sessionRecord,
      activeRecords,
      registry.events,
      nativeByProviderSession,
      composerSessionByProviderSession,
      options
    );

    if (session) {
      sessions.push(session);
    }
  }

  return sessions;
}

function activeProviderRecordsForSession(
  session: ComposerSessionRecord,
  providers: ComposerProviderSessionRecord[]
) {
  if (session.parallelAdoptedProvider) {
    return providers.filter((record) =>
      record.provider === session.parallelAdoptedProvider &&
      record.lifecycle !== "discarded"
    );
  }

  return providers.filter((record) => record.lifecycle !== "discarded");
}

function composerSessionFromRecord(
  sessionRecord: ComposerSessionRecord,
  providerRecords: ComposerProviderSessionRecord[],
  registryEvents: ComposerSessionEvent[],
  nativeByProviderSession: Map<string, SessionContent>,
  composerSessionByProviderSession: Map<string, string>,
  options: { includeItems: boolean }
): SessionContent | null {
  const renderMode = sessionRecord.renderMode ??
    (sessionRecord.hybridMode === "parallel-initial" && !sessionRecord.parallelAdoptedProvider
      ? "hybrid"
      : "single");
  const providerSessions = providerSessionsFromRecords(providerRecords);
  const nativeMatches = providerRecords
    .map((record) => nativeByProviderSession.get(
      providerSessionKey(record.provider, record.providerSessionId)
    ))
    .filter((session): session is SessionContent => Boolean(session));

  if (renderMode === "hybrid" && !sessionRecord.parallelAdoptedProvider) {
    return composerParallelSessionFromRecord(
      sessionRecord,
      providerRecords,
      nativeByProviderSession,
      providerSessions,
      options
    );
  }

  if (shouldRenderHandoffTimeline(sessionRecord, providerRecords)) {
    return composerHandoffSessionFromRecord(
      sessionRecord,
      providerRecords,
      registryEvents,
      nativeByProviderSession,
      providerSessions,
      composerSessionByProviderSession,
      options
    );
  }

  const visibleProvider = sessionRecord.parallelAdoptedProvider ??
    (sessionRecord.currentProvider === "codex" || sessionRecord.currentProvider === "claude"
      ? sessionRecord.currentProvider
      : providerRecords[0]?.provider);
  const visibleRecord = visibleProvider
    ? latestProviderRecord(providerRecords.filter((record) => record.provider === visibleProvider))
    : latestProviderRecord(providerRecords);
  const visibleNative = visibleRecord
    ? nativeByProviderSession.get(
        providerSessionKey(visibleRecord.provider, visibleRecord.providerSessionId)
      )
    : nativeMatches[0];

  if (!visibleRecord && !visibleNative) {
    return null;
  }

  const cwd =
    sessionRecord.activeCwd ??
    visibleRecord?.cwd ??
    visibleNative?.cwd ??
    sessionRecord.sourceCwd;
  const displayCwd = sessionRecord.displayCwd ?? sessionRecord.sourceCwd;

  if (
    (visibleProvider ?? visibleRecord?.provider ?? visibleNative?.provider) === "codex" &&
    (isCodexChatSessionCwd(cwd) || isCodexChatSessionCwd(displayCwd))
  ) {
    return null;
  }

  return finishSession({
    id: sessionRecord.id,
    provider: visibleProvider ?? visibleRecord?.provider ?? visibleNative?.provider ?? "meta",
    providerSessionId: visibleRecord?.providerSessionId ?? visibleNative?.providerSessionId,
    providerSessions,
    renderMode: "single",
    parentSessionId: remapNativeParentSessionId(
      visibleNative?.parentSessionId,
      visibleNative?.provider,
      composerSessionByProviderSession
    ),
    subagent: visibleNative?.subagent,
    contentLoaded: options.includeItems,
    parallelAdoptedProvider: sessionRecord.parallelAdoptedProvider,
    lastProvider: sessionRecord.lastProvider ?? visibleProvider,
    title: sessionRecord.title ?? visibleNative?.title ?? titleFromCwd(sessionRecord.sourceCwd) ?? "Composer session",
    updatedAt: latestSessionUpdatedAt(sessionRecord, nativeMatches),
    cwd,
    displayCwd,
    model: visibleNative?.model,
    items: options.includeItems ? visibleNative?.items ?? [] : []
  });
}

function shouldRenderHandoffTimeline(
  sessionRecord: ComposerSessionRecord,
  providerRecords: ComposerProviderSessionRecord[]
) {
  if (sessionRecord.parallelAdoptedProvider) {
    return false;
  }

  const providers = new Set(providerRecords.map((record) => record.provider));

  return (
    providers.size > 1 &&
    providerRecords.some((record) =>
      record.mode === "handoff" ||
      record.role === "handoff" ||
      record.lifecycle === "handoff"
    )
  );
}

function composerHandoffSessionFromRecord(
  sessionRecord: ComposerSessionRecord,
  providerRecords: ComposerProviderSessionRecord[],
  registryEvents: ComposerSessionEvent[],
  nativeByProviderSession: Map<string, SessionContent>,
  providerSessions: Partial<Record<SessionProvider, ProviderSessionState>>,
  composerSessionByProviderSession: Map<string, string>,
  options: { includeItems: boolean }
): SessionContent | null {
  const nativeMatches = providerRecords
    .map((record) => nativeByProviderSession.get(
      providerSessionKey(record.provider, record.providerSessionId)
    ))
    .filter((session): session is SessionContent => Boolean(session));
  const visibleRecord =
    latestProviderRecord(providerRecords.filter((record) =>
      record.provider === sessionRecord.currentProvider
    )) ?? latestProviderRecord(providerRecords);
  const visibleNative = visibleRecord
    ? nativeByProviderSession.get(
        providerSessionKey(visibleRecord.provider, visibleRecord.providerSessionId)
      )
    : nativeMatches[0];
  const cwd =
    sessionRecord.activeCwd ??
    visibleRecord?.cwd ??
    visibleNative?.cwd ??
    sessionRecord.sourceCwd;
  const displayCwd = sessionRecord.displayCwd ?? sessionRecord.sourceCwd;

  if (
    (visibleRecord?.provider ?? visibleNative?.provider) === "codex" &&
    (isCodexChatSessionCwd(cwd) || isCodexChatSessionCwd(displayCwd))
  ) {
    return null;
  }

  return finishSession({
    id: sessionRecord.id,
    provider: visibleRecord?.provider ?? visibleNative?.provider ?? "meta",
    providerSessionId: visibleRecord?.providerSessionId ?? visibleNative?.providerSessionId,
    providerSessions,
    renderMode: "single",
    parentSessionId: remapNativeParentSessionId(
      visibleNative?.parentSessionId,
      visibleNative?.provider,
      composerSessionByProviderSession
    ),
    subagent: visibleNative?.subagent,
    contentLoaded: options.includeItems,
    lastProvider: sessionRecord.lastProvider ?? visibleRecord?.provider,
    title: sessionRecord.title ?? visibleNative?.title ?? titleFromCwd(sessionRecord.sourceCwd) ?? "Composer session",
    updatedAt: latestSessionUpdatedAt(sessionRecord, nativeMatches),
    cwd,
    displayCwd,
    model: visibleNative?.model,
    items: options.includeItems
      ? interleavedHandoffItems(
          sessionRecord,
          providerRecords,
          registryEvents,
          nativeByProviderSession
        )
      : []
  });
}

function interleavedHandoffItems(
  sessionRecord: ComposerSessionRecord,
  providerRecords: ComposerProviderSessionRecord[],
  registryEvents: ComposerSessionEvent[],
  nativeByProviderSession: Map<string, SessionContent>
) {
  const events = providerRecords.flatMap((record) => {
    const native = nativeByProviderSession.get(
      providerSessionKey(record.provider, record.providerSessionId)
    );

    if (!native) {
      return [];
    }

    return native.items.map((item, index) => ({
      id: `${record.provider}-${record.providerSessionId}-item-${index}`,
      timestamp: itemSortTimestamp(item) ??
        record.updatedAt ??
        record.createdAt ??
        sessionRecord.updatedAt,
      order: index,
      item: stampProviderOnItem(item, record.provider)
    }));
  });
  const handoffMarkers = handoffTimelineEvents(
    sessionRecord,
    providerRecords,
    registryEvents
  ).map((event, index) => ({
    id: `${sessionRecord.id}-handoff-marker-${index}`,
    timestamp: event.timestamp,
    order: -1,
    item: handoffMarkerItem(sessionRecord.id, index, event)
  }));

  return [...events, ...handoffMarkers]
    .sort((a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
      a.order - b.order ||
      a.id.localeCompare(b.id)
    )
    .map((entry) => entry.item);
}

function handoffTimelineEvents(
  sessionRecord: ComposerSessionRecord,
  providerRecords: ComposerProviderSessionRecord[],
  registryEvents: ComposerSessionEvent[]
) {
  const providerKeys = new Set(
    providerRecords.map((record) =>
      providerSessionKey(record.provider, record.providerSessionId)
    )
  );
  const attachEvents = registryEvents
    .filter((event) =>
      event.composerSessionId === sessionRecord.id &&
      event.type === "provider_session_attached" &&
      isDelegateProvider(event.provider) &&
      event.providerSessionId &&
      providerKeys.has(providerSessionKey(event.provider, event.providerSessionId))
    )
    .map((event) => ({
      timestamp: event.timestamp,
      provider: event.provider,
      providerSessionId: event.providerSessionId,
      handoff:
        event.data?.mode === "handoff" ||
        event.data?.role === "handoff" ||
        event.data?.lifecycle === "handoff"
    }))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const events = attachEvents.filter((event, index) => {
    let previous:
      | { provider?: SessionProvider }
      | undefined;

    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const candidate = attachEvents[previousIndex];

      if (candidate.provider !== event.provider) {
        previous = candidate;
        break;
      }
    }

    return event.handoff && Boolean(previous);
  });

  if (events.length > 0) {
    return events;
  }

  const orderedRecords = [...providerRecords].sort((a, b) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );

  return orderedRecords
    .filter((record) =>
      record.createdAt !== orderedRecords[0]?.createdAt &&
      (record.mode === "handoff" ||
        record.role === "handoff" ||
        record.lifecycle === "handoff")
    )
    .map((record) => ({
      timestamp: record.createdAt,
      provider: record.provider,
      providerSessionId: record.providerSessionId
    }));
}

function handoffMarkerItem(
  sessionId: string,
  index: number,
  event: {
    timestamp: string;
    provider?: SessionProvider;
    providerSessionId?: string;
  }
): ConversationItem {
  const providerLabel = event.provider === "claude"
    ? "Claude"
    : event.provider === "codex"
      ? "Codex"
      : "provider";
  const id = `${sessionId}-handoff-${index}`;

  return {
    id,
    type: "tool_group",
    summary: `Preparing handoff context for ${providerLabel}`,
    sortTimestamp: event.timestamp,
    details: [
      {
        id: `${id}-detail`,
        label: "Preparing handoff context",
        kind: "summary",
        tone: "summary",
        action: "other",
        args: event.providerSessionId
          ? { provider: providerLabel, session: event.providerSessionId }
          : { provider: providerLabel }
      }
    ],
    defaultOpen: false,
    status: "completed"
  };
}

function stampProviderOnItem(
  item: ConversationItem,
  provider: SessionProvider
): ConversationItem {
  if (item.type === "assistant_message" || item.type === "tool_group") {
    return { ...item, provider };
  }

  return item;
}

function itemSortTimestamp(item: ConversationItem) {
  return "sortTimestamp" in item ? item.sortTimestamp : undefined;
}

function isDelegateProvider(provider: SessionProvider | undefined): provider is "codex" | "claude" {
  return provider === "codex" || provider === "claude";
}

function remapNativeParentSessionId(
  parentSessionId: string | undefined,
  provider: SessionProvider | undefined,
  composerSessionByProviderSession: Map<string, string>
) {
  if (
    !parentSessionId ||
    (provider !== "codex" && provider !== "claude") ||
    !parentSessionId.startsWith(`${provider}-`)
  ) {
    return parentSessionId;
  }

  const parentProviderSessionId = parentSessionId.slice(provider.length + 1);

  return composerSessionByProviderSession.get(
    providerSessionKey(provider, parentProviderSessionId)
  ) ?? parentSessionId;
}

function composerParallelSessionFromRecord(
  sessionRecord: ComposerSessionRecord,
  providerRecords: ComposerProviderSessionRecord[],
  nativeByProviderSession: Map<string, SessionContent>,
  providerSessions: Partial<Record<SessionProvider, ProviderSessionState>>,
  options: { includeItems: boolean }
): SessionContent | null {
  const columns: Array<{
    provider: SessionProvider;
    title: string;
    items: ConversationItem[];
  }> = [];

  for (const provider of ["codex", "claude"] as const) {
    const record = latestProviderRecord(
      providerRecords.filter((candidate) => candidate.provider === provider)
    );
    const native = record
      ? nativeByProviderSession.get(providerSessionKey(provider, record.providerSessionId))
      : undefined;

    if (!native) {
      continue;
    }

    columns.push({
      provider,
      title: `${provider === "codex" ? "Codex" : "Claude"} thread`,
      items: options.includeItems ? agentOutputItems(native.items) : []
    });
  }

  if (columns.length === 0) {
    return null;
  }

  const nativeMatches = providerRecords
    .map((record) => nativeByProviderSession.get(
      providerSessionKey(record.provider, record.providerSessionId)
    ))
    .filter((session): session is SessionContent => Boolean(session));
  const firstUser = options.includeItems
    ? nativeMatches
        .flatMap((session) => session.items)
        .find(
          (item): item is Extract<ConversationItem, { type: "user_message" }> =>
            item.type === "user_message"
        )
    : undefined;
  const items: ConversationItem[] = [
    ...(firstUser
      ? [{
          id: `${sessionRecord.id}-user-0`,
          type: "user_message" as const,
          body: firstUser.body,
          timestamp: firstUser.timestamp
        }]
      : []),
    {
      id: `${sessionRecord.id}-parallel-0`,
      type: "parallel_thread_group",
      columns,
      prompt: firstUser?.body
    }
  ];

  return finishSession({
    id: sessionRecord.id,
    provider: "meta",
    providerSessions,
    renderMode: "hybrid",
    contentLoaded: options.includeItems,
    lastProvider: sessionRecord.lastProvider,
    parallelAdoptedProvider: sessionRecord.parallelAdoptedProvider,
    title: sessionRecord.title ?? nativeMatches[0]?.title ?? titleFromCwd(sessionRecord.sourceCwd) ?? "Composer session",
    updatedAt: latestSessionUpdatedAt(sessionRecord, nativeMatches),
    cwd: sessionRecord.activeCwd ?? sessionRecord.sourceCwd,
    displayCwd: sessionRecord.displayCwd ?? sessionRecord.sourceCwd,
    model: "Codex + Claude parallel",
    items: options.includeItems ? items : []
  });
}

function providerSessionsFromRecords(records: ComposerProviderSessionRecord[]) {
  const providerSessions: Partial<Record<SessionProvider, ProviderSessionState>> = {};

  for (const record of records) {
    const current = providerSessions[record.provider];

    if (
      current?.sessionId &&
      Date.parse(record.updatedAt) < Date.parse(
        records.find((candidate) =>
          candidate.provider === record.provider &&
          candidate.providerSessionId === current.sessionId
        )?.updatedAt ?? ""
      )
    ) {
      continue;
    }

    providerSessions[record.provider] = {
      sessionId: record.providerSessionId,
      cwd: record.cwd,
      lastContextVersion: record.lastContextVersion
    };
  }

  return providerSessions;
}

function latestProviderRecord(records: ComposerProviderSessionRecord[]) {
  return [...records].sort((a, b) =>
    Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  )[0];
}

function latestSessionUpdatedAt(
  session: ComposerSessionRecord,
  nativeSessions: SessionContent[]
) {
  return [session.updatedAt, ...nativeSessions.map((native) => native.updatedAt)]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function agentOutputItems(items: ConversationItem[]) {
  return items.filter((item) =>
    item.type !== "user_message" && item.type !== "attachment_group"
  );
}

function loadCodexSessions(options: { includeItems: boolean }): SessionContent[] {
  const codexRoot = path.join(os.homedir(), ".codex");
  const index = readCodexIndex(codexRoot);
  const files = findJsonl(path.join(codexRoot, "sessions"))
    .filter((file) => !file.fullPath.endsWith("session_index.jsonl"))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const sessions: SessionContent[] = [];

  for (const file of files) {
    const parsed = parseCodexSession(file.fullPath, index, options);

    if (parsed && (!options.includeItems || parsed.items.length > 0)) {
      sessions.push(parsed);
    }
  }

  return selectSessionTree(sessions, MAX_SESSIONS_PER_PROVIDER);
}

function loadNativeProviderSession(
  provider: "codex" | "claude",
  providerSessionId: string,
  options: { includeItems: boolean }
) {
  const filePath = findSessionFile({
    id: `${provider}-${providerSessionId}`,
    provider,
    providerSessionId
  });

  if (!filePath) {
    return undefined;
  }

  if (provider === "codex") {
    return parseCodexSession(
      filePath,
      readCodexIndex(path.join(os.homedir(), ".codex")),
      options
    ) ?? undefined;
  }

  return parseClaudeSession(filePath, options) ?? undefined;
}

export function updateLocalSessionVisibility(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId">,
  action: LocalSessionAction
) {
  const archivedComposerSession = action === "archive"
    ? archiveComposerSession(session.id)
    : false;
  const filePath = findSessionFile(session);

  if (!filePath) {
    return {
      ok: true,
      changed: archivedComposerSession,
      reason: archivedComposerSession ? undefined : "No local session file found"
    };
  }

  const archivePath = archivePathForSessionFile(filePath, session.provider);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.renameSync(filePath, uniqueFilePath(archivePath));

  return { ok: true, changed: true, filePath };
}

function parseCodexSession(
  filePath: string,
  index: Map<string, { title: string; updatedAt?: string }>,
  options: { includeItems: boolean } = { includeItems: true }
): SessionContent | null {
  const includeItems = options.includeItems;
  const rows = includeItems ? readJsonl(filePath) : readJsonlPreview(filePath);
  let id = codexIdFromPath(filePath);
  let cwd: string | undefined;
  let model: string | undefined;
  let updatedAt = latestTimestamp(rows) ?? isoFromMtime(filePath);
  let title = "";
  const items: ConversationItem[] = [];
  const toolGroupsByCallId = new Map<
    string,
    { itemIndex: number; detailIndex: number }
  >();
  let toolIndex = 0;
  let firstRawUserText = "";
  let firstUserText = "";
  let parentSessionId: string | undefined;
  let subagent: SubagentMetadata | undefined;

  for (const row of rows) {
    const type = asString(row.type);
    const payload = asRecord(row.payload);
    const timestamp = asString(row.timestamp);

    if (timestamp) {
      updatedAt = timestamp;
    }

    if (type === "session_meta") {
      id = asString(payload.id) ?? id;
      cwd = asString(payload.cwd) ?? cwd;
      const subagentThread = codexSubagentThread(payload);

      if (subagentThread) {
        parentSessionId = `codex-${subagentThread.parentProviderSessionId}`;
        subagent = subagentThread.metadata;
      }
      continue;
    }

    if (type === "turn_context") {
      model = asString(payload.model) ?? model;
      cwd = asString(payload.cwd) ?? cwd;
      continue;
    }

    if (type === "event_msg") {
      const eventType = asString(payload.type);

      if (eventType === "user_message") {
        const rawBody =
          asString(payload.message) ??
          asString(payload.text) ??
          extractText(payload.content);

        if (rawBody) {
          firstRawUserText ||= rawBody;
          const parsedMessage = parseCodexUserMessage(
            rawBody,
            `${id}-user-${items.length}`,
            imageUrlsFromPayload(payload)
          );

          if (includeItems && parsedMessage.attachments.length > 0) {
            items.push({
              id: `${id}-user-attachments-${items.length}`,
              type: "attachment_group",
              attachments: parsedMessage.attachments
            });
          }

          firstUserText ||= parsedMessage.body;
          if (includeItems) {
            items.push({
              id: `${id}-user-${items.length}`,
              type: "user_message",
              body: trimText(parsedMessage.body),
              timestamp: formatTime(timestamp),
              sortTimestamp: timestamp
            });
          }
        }
      }

      if (includeItems && eventType === "patch_apply_end") {
        const callId = asString(payload.call_id);
        const changes = asRecord(payload.changes);
        const reviewFiles = Object.entries(changes)
          .map(([filePath, change]) => {
            const record = asRecord(change);

            return reviewFileFromCodexChange(filePath, {
              type: asString(record.type),
              kind: asString(record.kind),
              unified_diff: asString(record.unified_diff),
              diff: asString(record.diff),
              content: asString(record.content),
              move_path: asString(record.move_path)
            });
          });

        if (reviewFiles.length > 0) {
          const label = patchReviewLabel(reviewFiles);
          const existing = callId ? toolGroupsByCallId.get(callId) : undefined;

          if (existing) {
            const item = items[existing.itemIndex];

            if (item?.type === "tool_group") {
              const detail = item.details[existing.detailIndex];
              item.summary = label;
              item.sortTimestamp = timestamp ?? item.sortTimestamp;
              detail.label = label;
              detail.tone = "default";
              detail.toolName = "Apply Patch";
              detail.action = "edit";
              detail.command = undefined;
              detail.path = reviewFiles[0]?.path;
              detail.reviewFiles = reviewFiles;
            }

            continue;
          }

          toolIndex += 1;
          const detail: ToolDetail = {
            id: `${id}-tool-${toolIndex}-patch`,
            kind: "call",
            label,
            tone: "default",
            toolName: "Apply Patch",
            action: "edit",
            path: reviewFiles[0]?.path,
            reviewFiles
          };

          items.push({
            id: `${id}-tool-${toolIndex}`,
            type: "tool_group",
            summary: detail.label,
            details: [detail],
            sortTimestamp: timestamp,
            defaultOpen: false
          });
        }
      }

      continue;
    }

    if (type !== "response_item") {
      continue;
    }

    const payloadType = asString(payload.type);
    const role = asString(payload.role);

    if (payloadType === "message") {
      const body = extractText(payload.content);

      if (!body) {
        continue;
      }

      if (includeItems && role === "assistant") {
        items.push({
          id: `${id}-assistant-${items.length}`,
          type: "assistant_message",
          body: trimText(body),
          sortTimestamp: timestamp
        });
      }
      continue;
    }

    if (payloadType === "reasoning") {
      // Codex reasoning records are runtime/internal state. Historical
      // transcript rendering should not show them as standalone messages.
      continue;
    }

    if (
      includeItems &&
      (payloadType === "function_call" ||
        payloadType === "custom_tool_call" ||
        payloadType === "image_generation_call")
    ) {
      toolIndex += 1;
      const name = asString(payload.name) ?? "tool";
      const input = parseToolInput(payload);
      const detail = createToolCallDetail(
        `${id}-tool-${toolIndex}-call`,
        name,
        input,
        payloadType === "image_generation_call" ? "generate" : undefined
      );

      items.push({
        id: `${id}-tool-${toolIndex}`,
        type: "tool_group",
        summary: detail.label,
        details: [detail],
        sortTimestamp: timestamp,
        defaultOpen: false
      });
      const callId = asString(payload.call_id);

      if (callId) {
        toolGroupsByCallId.set(callId, {
          itemIndex: items.length - 1,
          detailIndex: 0
        });
      }
      continue;
    }

    if (
      includeItems &&
      (payloadType === "function_call_output" ||
        payloadType === "custom_tool_call_output")
    ) {
      toolIndex += 1;
      const detail = createToolOutputDetail(
        `${id}-tool-output-${toolIndex}-detail`,
        asString(payload.output) ?? ""
      );

      if (!isInformativeOutputDetail(detail)) {
        continue;
      }

      items.push({
        id: `${id}-tool-output-${toolIndex}`,
        type: "tool_group",
        summary: detail.label,
        details: [detail],
        sortTimestamp: timestamp,
        defaultOpen: false
      });
    }
  }

  const indexed = index.get(id);
  if (isBackgroundBranchNamePrompt(firstRawUserText) || isCodexChatSessionCwd(cwd)) {
    return null;
  }

  title =
    subagentTitle(subagent) ??
    indexed?.title ??
    titleFromText(firstUserText) ??
    titleFromPath(filePath);
  updatedAt = indexed?.updatedAt ?? updatedAt;

  return finishSession({
    id: `codex-${id}`,
    provider: "codex",
    providerSessionId: id,
    renderMode: "single",
    parentSessionId,
    subagent,
    contentLoaded: includeItems,
    title,
    updatedAt,
    cwd,
    model,
    items
  });
}

function loadClaudeSessions(options: { includeItems: boolean }): SessionContent[] {
  const projectsRoot = path.join(os.homedir(), ".claude", "projects");
  const files = findClaudeProjectJsonl(projectsRoot).sort(
    (a, b) => b.mtimeMs - a.mtimeMs
  );
  const sessions: SessionContent[] = [];

  for (const file of files) {
    const parsed = parseClaudeSession(file.fullPath, options);

    if (parsed && (!options.includeItems || parsed.items.length > 0)) {
      sessions.push(parsed);
    }
  }

  return selectSessionTree(sessions, MAX_SESSIONS_PER_PROVIDER);
}

function parseClaudeSession(
  filePath: string,
  options: { includeItems: boolean } = { includeItems: true }
): SessionContent | null {
  const includeItems = options.includeItems;
  const rows = includeItems ? readJsonl(filePath) : readJsonlPreview(filePath);
  const fileSessionId = path.basename(filePath, ".jsonl");
  const pathSubagent = claudeSubagentFromPath(filePath);
  let sessionId = pathSubagent?.metadata.id ?? fileSessionId;
  let parentSessionId = pathSubagent?.parentProviderSessionId
    ? `claude-${pathSubagent.parentProviderSessionId}`
    : undefined;
  let subagent = pathSubagent?.metadata;
  let cwd: string | undefined = cwdFromClaudeProjectPath(filePath);
  let model: string | undefined;
  let updatedAt = includeItems ? latestTimestamp(rows) ?? isoFromMtime(filePath) : isoFromMtime(filePath);
  let firstUserText = "";
  const items: ConversationItem[] = [];
  let toolIndex = 0;

  for (const row of rows) {
    const rowTimestamp = asString(row.timestamp);
    const rowSessionId = asString(row.sessionId);
    const rowAgentId = asString(row.agentId);
    const isSidechain = row.isSidechain === true || Boolean(subagent);

    if (isSidechain) {
      if (rowSessionId) {
        parentSessionId = `claude-${rowSessionId}`;
      }

      if (rowAgentId && !subagent?.id) {
        sessionId = rowAgentId;
      }

      const attributionAgent = asString(row.attributionAgent);
      subagent = {
        ...subagent,
        id: subagent?.id ?? rowAgentId ?? sessionId,
        type: subagent?.type ?? attributionAgent
      };
    } else {
      sessionId = rowSessionId ?? sessionId;
    }

    cwd = asString(row.cwd) ?? cwd;
    if (includeItems) {
      updatedAt = rowTimestamp ?? updatedAt;
    }

    if (row.type === "permission-mode") {
      // Claude permission mode rows are runtime metadata. They are useful for
      // execution, but noisy when replaying a conversation transcript.
      continue;
    }

    if (row.type === "user") {
      const message = asRecord(row.message);
      const content = message.content;

      if (typeof content === "string") {
        if (isHiddenHandoffTranscriptText(content)) {
          continue;
        }

        firstUserText ||= content;
        if (includeItems) {
          items.push({
            id: `${sessionId}-user-${items.length}`,
            type: "user_message",
            body: trimText(userVisiblePrompt(content)),
            timestamp: formatTime(rowTimestamp),
            sortTimestamp: rowTimestamp
          });
        }
      } else if (Array.isArray(content)) {
        const hasToolResult = content.some((part) => {
          const block = asRecord(part);
          return asString(block.type) === "tool_result";
        });

        if (!hasToolResult) {
          const userText = extractText(content);

          if (userText) {
            if (isHiddenHandoffTranscriptText(userText)) {
              continue;
            }

            firstUserText ||= userText;
            if (includeItems) {
              items.push({
                id: `${sessionId}-user-${items.length}`,
                type: "user_message",
                body: trimText(userVisiblePrompt(userText)),
                timestamp: formatTime(rowTimestamp),
                sortTimestamp: rowTimestamp
              });
            }
          }

          continue;
        }

        const resultText = extractClaudeToolResultText(content);

        if (includeItems && resultText) {
          if (isHiddenHandoffTranscriptText(resultText)) {
            continue;
          }

          toolIndex += 1;
          const detail = createToolOutputDetail(
            `${sessionId}-tool-result-${toolIndex}-detail`,
            resultText
          );

          if (!isInformativeOutputDetail(detail)) {
            continue;
          }

          items.push({
            id: `${sessionId}-tool-result-${toolIndex}`,
            type: "tool_group",
            summary: detail.label,
            details: [detail],
            sortTimestamp: rowTimestamp,
            defaultOpen: false
          });
        }
      }
      continue;
    }

    if (row.type === "assistant") {
      const message = asRecord(row.message);
      model = asString(message.model) ?? model;
      const content = message.content;

      if (!Array.isArray(content)) {
        continue;
      }

      for (const block of content) {
        const contentBlock = asRecord(block);
        const blockType = asString(contentBlock.type);

        if (blockType === "text") {
          const body = asString(contentBlock.text);

          if (body && isHiddenHandoffTranscriptText(body)) {
            continue;
          }

          if (includeItems && body) {
            items.push({
              id: `${sessionId}-assistant-${items.length}`,
              type: "assistant_message",
              body: trimText(body),
              sortTimestamp: rowTimestamp
            });
          }
        } else if (blockType === "thinking") {
          // Claude thinking blocks are internal reasoning state, not
          // user-visible assistant transcript content.
          continue;
        } else if (includeItems && blockType === "tool_use") {
          toolIndex += 1;
          const name = asString(contentBlock.name) ?? "tool";
          const input = asRecord(contentBlock.input);
          const detail = createToolCallDetail(
            `${sessionId}-tool-${toolIndex}-call`,
            name,
            input
          );

          items.push({
            id: `${sessionId}-tool-${toolIndex}`,
            type: "tool_group",
            summary: detail.label,
            details: [detail],
            sortTimestamp: rowTimestamp,
            defaultOpen: false
          });
        }
      }
      continue;
    }

    if (row.type === "attachment") {
      // Claude attachment rows are runtime metadata rather than user-visible
      // message attachments, so they are intentionally not rendered.
      continue;
    }
  }

  return finishSession({
    id: `claude-${sessionId}`,
    provider: "claude",
    providerSessionId: sessionId,
    renderMode: "single",
    parentSessionId,
    subagent,
    contentLoaded: includeItems,
    title:
      subagentTitle(subagent) ??
      titleFromText(firstUserText) ??
      titleFromCwd(cwd) ??
      titleFromPath(filePath),
    updatedAt,
    cwd,
    model,
    items
  });
}

function finishSession(session: Omit<SessionContent, "pendingItems">) {
  const hasSelfParent = session.parentSessionId === session.id;

  return {
    ...session,
    parentSessionId: hasSelfParent ? undefined : session.parentSessionId,
    subagent: hasSelfParent ? undefined : session.subagent,
    pendingItems: [],
    contentLoaded: session.contentLoaded ?? true
  } satisfies SessionContent;
}

function readCodexIndex(codexRoot: string) {
  const index = new Map<string, { title: string; updatedAt?: string }>();
  const indexPath = path.join(codexRoot, "session_index.jsonl");

  for (const row of readJsonl(indexPath)) {
    const id = asString(row.id);
    const title = asString(row.thread_name);

    if (id && title) {
      index.set(id, {
        title,
        updatedAt: asString(row.updated_at)
      });
    }
  }

  return index;
}

function codexSubagentThread(payload: JsonRecord):
  | { parentProviderSessionId: string; metadata: SubagentMetadata }
  | undefined {
  const source = asRecord(payload.source);
  const sourceSubagent = asRecord(source.subagent);
  const threadSpawn = asRecord(sourceSubagent.thread_spawn);
  const parentProviderSessionId = asString(threadSpawn.parent_thread_id);
  const threadSource = asString(payload.thread_source);

  if (!parentProviderSessionId && threadSource !== "subagent") {
    return undefined;
  }

  const metadata: SubagentMetadata = {
    id: asString(threadSpawn.agent_path) ?? asString(payload.agent_path),
    nickname:
      asString(threadSpawn.agent_nickname) ?? asString(payload.agent_nickname),
    role: asString(threadSpawn.agent_role) ?? asString(payload.agent_role),
    depth: asNumber(threadSpawn.depth) ?? asNumber(payload.depth)
  };

  return parentProviderSessionId
    ? { parentProviderSessionId, metadata }
    : undefined;
}

function claudeSubagentFromPath(filePath: string):
  | { parentProviderSessionId: string; metadata: SubagentMetadata }
  | undefined {
  const subagentsDir = `${path.sep}subagents${path.sep}`;
  const markerIndex = filePath.indexOf(subagentsDir);

  if (markerIndex === -1) {
    return undefined;
  }

  const beforeSubagents = filePath.slice(0, markerIndex);
  const parentProviderSessionId = path.basename(beforeSubagents);
  const id = path.basename(filePath, ".jsonl");

  if (!parentProviderSessionId || !id) {
    return undefined;
  }

  return {
    parentProviderSessionId,
    metadata: {
      id
    }
  };
}

function subagentTitle(subagent?: SubagentMetadata) {
  if (!subagent) {
    return undefined;
  }

  const displayName = subagent.nickname ?? subagent.type;

  if (displayName) {
    return `${displayName} subagent`;
  }

  if (subagent.role) {
    return `${formatToolName(subagent.role)} subagent`;
  }

  return "Subagent";
}

function readJsonl(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, "utf8");

    return parseJsonlLines(content.split("\n"));
  } catch {
    return [];
  }
}

function readJsonlPreview(filePath: string, maxBytes = 256 * 1024) {
  try {
    const fd = fs.openSync(filePath, "r");

    try {
      const buffer = Buffer.alloc(maxBytes);
      const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
      const chunk = buffer.subarray(0, bytesRead).toString("utf8");
      const lines = chunk.split("\n");

      if (bytesRead === maxBytes && !chunk.endsWith("\n")) {
        lines.pop();
      }

      return parseJsonlLines(lines);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

function parseJsonlLines(lines: string[]) {
  const rows: JsonRecord[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (parsed && typeof parsed === "object") {
        rows.push(parsed as JsonRecord);
      }
    } catch {
      // Individual malformed rows should not block the rest of the session.
    }
  }

  return rows;
}

function findJsonl(root: string) {
  const files: Array<{ fullPath: string; mtimeMs: number }> = [];

  function walk(dir: string, depth: number) {
    if (depth > 8) {
      return;
    }

    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push({
          fullPath,
          mtimeMs: safeMtimeMs(fullPath)
        });
      }
    }
  }

  walk(root, 0);
  return files;
}

function findClaudeProjectJsonl(projectsRoot: string) {
  const files: Array<{ fullPath: string; mtimeMs: number }> = [];

  let projectDirs: fs.Dirent[];

  try {
    projectDirs = fs.readdirSync(projectsRoot, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) {
      continue;
    }

    const dir = path.join(projectsRoot, projectDir.name);
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push({
          fullPath,
          mtimeMs: safeMtimeMs(fullPath)
        });
      } else if (entry.isDirectory()) {
        for (const file of findJsonl(fullPath)) {
          files.push(file);
        }
      }
    }
  }

  return files;
}

function findSessionFile(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId">
) {
  const providerId = providerIdForSession(session);

  if (!providerId) {
    return undefined;
  }

  if (session.provider === "codex") {
    return findJsonl(path.join(os.homedir(), ".codex", "sessions"))
      .map((file) => file.fullPath)
      .find((filePath) => codexIdFromPath(filePath) === providerId);
  }

  if (session.provider === "claude") {
    return findClaudeProjectJsonl(path.join(os.homedir(), ".claude", "projects"))
      .map((file) => file.fullPath)
      .find((filePath) => path.basename(filePath, ".jsonl") === providerId);
  }

  return undefined;
}

function providerIdForSession(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId">
) {
  return (
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

function archivePathForSessionFile(filePath: string, provider: SessionProvider) {
  if (provider === "codex") {
    const sessionsRoot = path.join(os.homedir(), ".codex", "sessions");
    const archiveRoot = path.join(os.homedir(), ".codex", "archived_sessions");
    const relativePath = path.relative(sessionsRoot, filePath);

    return path.join(archiveRoot, relativePath.startsWith("..") ? path.basename(filePath) : relativePath);
  }

  return path.join(path.dirname(filePath), ".composer-archive", path.basename(filePath));
}

function uniqueFilePath(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const extension = path.extname(filePath);
  const base = filePath.slice(0, -extension.length);

  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `${base}-${index}${extension}`;

    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not allocate archive path for ${filePath}`);
}

function sessionToThread(
  session: SessionContent,
  children: ProjectThread[] = []
): ProjectThread {
  const cwd = workspaceCwdForSession(session);

  return {
    id: session.id,
    name: session.title,
    age: relativeAge(session.updatedAt),
    provider: session.provider,
    model: session.model,
    cwd,
    parentSessionId: session.parentSessionId,
    subagent: session.subagent,
    children
  };
}

function sessionsToThreadTree(sessions: SessionContent[]): ProjectThread[] {
  const sortedSessions = [...sessions].sort(compareSessionsByUpdatedAt);
  const nodes = new Map<string, SessionThreadNode>();

  for (const session of sortedSessions) {
    nodes.set(session.id, { session, children: [] });
  }

  const roots: SessionThreadNode[] = [];

  for (const session of sortedSessions) {
    const node = nodes.get(session.id);

    if (!node) {
      continue;
    }

    const parentSessionId = session.parentSessionId === session.id
      ? undefined
      : session.parentSessionId;
    const parent = parentSessionId
      ? nodes.get(parentSessionId)
      : undefined;

    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const nodeToThread = (node: SessionThreadNode): ProjectThread =>
    sessionToThread(node.session, node.children.map(nodeToThread));

  sortThreadNodesByNewestActivity(roots);

  return roots.map(nodeToThread);
}

function selectSessionTree(sessions: SessionContent[], maxRootSessions: number) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const sortedSessions = [...sessions].sort(compareSessionsByUpdatedAt);
  const selectedRootIds = new Set<string>();

  for (const session of sortedSessions) {
    const parentSessionId = session.parentSessionId === session.id
      ? undefined
      : session.parentSessionId;
    const rootId =
      parentSessionId && byId.has(parentSessionId)
        ? parentSessionId
        : parentSessionId
          ? undefined
          : session.id;

    if (!rootId) {
      continue;
    }

    selectedRootIds.add(rootId);

    if (selectedRootIds.size >= maxRootSessions) {
      break;
    }
  }

  return sortedSessions.filter(
    (session) =>
      selectedRootIds.has(session.id) ||
      (session.parentSessionId &&
        session.parentSessionId !== session.id &&
        selectedRootIds.has(session.parentSessionId))
  );
}

function sortThreadNodesByNewestActivity(nodes: SessionThreadNode[]) {
  nodes.sort((a, b) => threadNodeTimestamp(b) - threadNodeTimestamp(a));

  for (const node of nodes) {
    sortThreadNodesByNewestActivity(node.children);
  }
}

function threadNodeTimestamp(node: SessionThreadNode): number {
  return Math.max(
    sessionTimestamp(node.session),
    0,
    ...node.children.map(threadNodeTimestamp)
  );
}

function groupSessionsByWorkspace(sessions: SessionContent[]): Project[] {
  const byWorkspace = new Map<
    string,
    { id: string; name: string; cwd?: string; sessions: SessionContent[] }
  >();

  for (const session of sessions) {
    const cwd = normalizeCwd(workspaceCwdForSession(session));
    const id = cwd ?? "unknown-workspace";
    const existing = byWorkspace.get(id);

    if (existing) {
      existing.sessions.push(session);
      continue;
    }

    byWorkspace.set(id, {
      id,
      name: cwd ? path.basename(cwd) : "Unknown workspace",
      cwd,
      sessions: [session]
    });
  }

  return [...byWorkspace.values()]
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      cwd: workspace.cwd,
      threads: sessionsToThreadTree(workspace.sessions)
    }))
    .sort((a, b) => latestThreadTimestamp(b, sessions) - latestThreadTimestamp(a, sessions));
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

  return normalized;
}

function isCodexChatSessionCwd(cwd?: string) {
  if (!cwd) {
    return false;
  }

  const relative = path.relative(
    path.join(os.homedir(), "Documents", "Codex"),
    path.resolve(cwd)
  );

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }

  const [dateSegment, slugSegment, ...rest] = relative.split(path.sep);

  return Boolean(
    dateSegment?.match(/^\d{4}-\d{2}-\d{2}$/) &&
      slugSegment &&
      rest.length === 0
  );
}

function compareSessionsByUpdatedAt(a: SessionContent, b: SessionContent) {
  return sessionTimestamp(b) - sessionTimestamp(a);
}

function latestThreadTimestamp(project: Project, sessions: SessionContent[]) {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));

  return Math.max(
    0,
    ...flattenThreads(project.threads).map((thread) =>
      sessionTimestamp(sessionById.get(thread.id))
    )
  );
}

function flattenThreads(threads: ProjectThread[]): ProjectThread[] {
  return threads.flatMap((thread) => [
    thread,
    ...flattenThreads(thread.children ?? [])
  ]);
}

function sessionTimestamp(session?: Pick<SessionContent, "updatedAt">) {
  const timestamp = Date.parse(session?.updatedAt ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeCwd(value?: string) {
  if (!value) {
    return undefined;
  }

  return path.resolve(value);
}

function cwdFromClaudeProjectPath(filePath: string) {
  const projectDir = path.basename(path.dirname(filePath));

  if (!projectDir.startsWith("-")) {
    return undefined;
  }

  return projectDir.replace(/^-/, "/").replaceAll("-", "/");
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      const block = asRecord(part);
      const text = asString(block.text) ?? asString(block.input_text);
      const toolContent = block.content;

      if (text) {
        return text;
      }

      if (Array.isArray(toolContent)) {
        return extractText(toolContent);
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function extractClaudeToolResultText(content: unknown[]) {
  return content
    .map((part) => {
      const block = asRecord(part);

      if (asString(block.type) !== "tool_result") {
        return "";
      }

      return extractText(block.content);
    })
    .filter(Boolean)
    .join("\n\n");
}

function parseToolInput(payload: JsonRecord): JsonRecord {
  const args = asString(payload.arguments) ?? asString(payload.input);

  if (!args) {
    return {};
  }

  try {
    return asRecord(JSON.parse(args));
  } catch {
    return { command: args };
  }
}

function createToolCallDetail(
  id: string,
  toolName: string,
  input: JsonRecord,
  forcedAction?: ToolDetail["action"]
): ToolDetail {
  const action = forcedAction ?? inferToolAction(toolName, input);
  const toolInputText = extractToolCommand(input) ?? asString(input.input);
  const reviewFiles = action === "edit" ? extractPatchReviewFiles(toolInputText) : [];
  const command = action === "edit" && reviewFiles.length > 0
    ? undefined
    : extractToolCommand(input);
  const pathValue = extractToolPath(input);
  const args = summarizeToolArguments(input, action, toolName);
  const label = reviewFiles.length > 0
    ? patchReviewLabel(reviewFiles)
    : buildToolCallLabel(toolName, action, input, command, pathValue);

  return {
    id,
    kind: "call",
    label,
    tone: command ? "command" : "default",
    toolName: formatToolName(toolName),
    action,
    args,
    command,
    path: pathValue ?? reviewFiles[0]?.path,
    reviewFiles: reviewFiles.length > 0 ? reviewFiles : undefined
  };
}

function createToolOutputDetail(id: string, output: string): ToolDetail {
  const cleanedOutput = cleanToolOutput(output);

  return {
    id,
    kind: "output",
    label: meaningfulOutputLabel(cleanedOutput),
    tone: "output",
    output: trimDetail(cleanedOutput),
    status: /(^|\n)\s*(error|failed|exception|traceback)\b/i.test(cleanedOutput)
      ? "failed"
      : "completed"
  };
}

function inferToolAction(
  toolName: string,
  input: JsonRecord
): NonNullable<ToolDetail["action"]> {
  const normalized = toolName.toLowerCase();

  if (isWriteStdinTool(toolName)) {
    return "other";
  }

  if (normalized.includes("read") || normalized.includes("view")) {
    return "read";
  }

  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("patch") ||
    normalized.includes("apply")
  ) {
    return "edit";
  }

  if (
    normalized.includes("grep") ||
    normalized.includes("glob") ||
    normalized.includes("search") ||
    normalized.includes("find")
  ) {
    return "search";
  }

  if (
    normalized.includes("bash") ||
    normalized.includes("shell") ||
    normalized.includes("exec") ||
    normalized.includes("terminal") ||
    extractToolCommand(input)
  ) {
    return "command";
  }

  if (normalized.includes("image") || normalized.includes("generate")) {
    return "generate";
  }

  return "other";
}

function buildToolCallLabel(
  toolName: string,
  action: NonNullable<ToolDetail["action"]>,
  input: JsonRecord,
  command?: string,
  pathValue?: string
) {
  const formattedName = formatToolName(toolName);
  const filename = pathValue ? path.basename(pathValue) : undefined;

  if (isWriteStdinTool(toolName)) {
    return writeStdinLabel(input);
  }

  if (action === "read") {
    return filename ? `Read ${filename}` : `Used ${formattedName}`;
  }

  if (action === "edit") {
    return filename ? `Edited ${filename}` : `Used ${formattedName}`;
  }

  if (action === "search") {
    const query =
      asString(input.pattern) ??
      asString(input.query) ??
      asString(input.regex) ??
      asString(input.search);
    return query ? `Searched for ${trimDetail(query)}` : `Used ${formattedName}`;
  }

  if (action === "command") {
    return command ? `Ran ${trimDetail(command)}` : `Ran ${formattedName}`;
  }

  if (action === "generate") {
    return "Generated image";
  }

  return `Used ${formattedName}`;
}

function summarizeToolArguments(
  input: JsonRecord,
  action: NonNullable<ToolDetail["action"]>,
  toolName?: string
) {
  if (toolName && isWriteStdinTool(toolName)) {
    return writeStdinArguments(input);
  }

  const hiddenKeys = new Set([
    "cmd",
    "command",
    "yield_time_ms",
    "max_output_tokens",
    "timeout_ms",
    "description",
    "workdir",
    "sandbox_permissions",
    "justification"
  ]);
  const priorityKeys = [
    "file_path",
    "path",
    "pattern",
    "query",
    "regex",
    "old_string",
    "new_string",
    "replace_all",
    "offset",
    "limit"
  ];
  const entries = Object.entries(input)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== undefined)
    .sort(([a], [b]) => {
      const aIndex = priorityKeys.indexOf(a);
      const bIndex = priorityKeys.indexOf(b);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    })
    .slice(0, action === "edit" ? 4 : 3);

  return Object.fromEntries(
    entries.map(([key, value]) => [key, trimDetail(valueToDisplay(value))])
  );
}

function isWriteStdinTool(toolName: string) {
  const normalized = normalizeToolName(toolName);

  return normalized === "write_stdin" || normalized.endsWith("_write_stdin");
}

function normalizeToolName(toolName: string) {
  return toolName
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/^_+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function writeStdinLabel(input: JsonRecord) {
  const sessionId = writeStdinSessionId(input);
  const chars = asString(input.chars);
  const base = chars && chars.length > 0
    ? "Sent input to terminal"
    : "Checked terminal output";

  return sessionId ? `${base} ${sessionId}` : base;
}

function writeStdinArguments(input: JsonRecord) {
  const sessionId = writeStdinSessionId(input);
  const chars = asString(input.chars);
  const waitMs = asNumber(input.yield_time_ms);
  const entries: [string, string][] = [];

  entries.push([
    "operation",
    chars && chars.length > 0 ? "send terminal input" : "check terminal output"
  ]);

  if (sessionId) {
    entries.push(["terminal_session", sessionId]);
  }

  if (chars && chars.length > 0) {
    entries.push(["input", trimDetail(JSON.stringify(chars))]);
  }

  if (waitMs !== undefined) {
    entries.push(["wait", `${waitMs}ms`]);
  }

  return Object.fromEntries(entries);
}

function writeStdinSessionId(input: JsonRecord) {
  const raw = input.session_id ?? input.sessionId;

  return typeof raw === "number" ? String(raw) : asString(raw);
}

function extractToolCommand(input: JsonRecord) {
  return (
    asString(input.cmd) ??
    asString(input.command) ??
    asString(input.shell_command)
  );
}

function extractToolPath(input: JsonRecord) {
  return (
    asString(input.file_path) ??
    asString(input.path) ??
    asString(input.abs_path) ??
    asString(input.filename)
  );
}

function meaningfulOutputLabel(output: string) {
  const trimmed = output.trim();

  if (!trimmed) {
    return "Output returned";
  }

  const firstLine = trimmed.split("\n").find(Boolean) ?? trimmed;

  if (/^[-=_]{3,}$/.test(firstLine.trim())) {
    return "Output returned";
  }

  return trimDetail(firstLine);
}

function cleanToolOutput(output: string) {
  const lines = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return true;
      }

      return !(
        /^Chunk ID:/i.test(trimmed) ||
        /^Wall time:/i.test(trimmed) ||
        /^Process exited with code/i.test(trimmed) ||
        /^Process running with session ID/i.test(trimmed) ||
        /^Original token count:/i.test(trimmed) ||
        /^Output:\s*$/i.test(trimmed)
      );
    });

  return decodeToolOutputText(lines.join("\n").trim()).trim();
}

function decodeToolOutputText(output: string) {
  if (!output) {
    return "";
  }

  try {
    const parsed = JSON.parse(output) as unknown;
    const text = extractText(parsed);

    if (text) {
      return text;
    }

    return typeof parsed === "string" ? parsed : output;
  } catch {
    return output;
  }
}

function isInformativeOutputDetail(detail: ToolDetail) {
  const output = detail.output?.trim() ?? "";

  return Boolean(output) && detail.label !== "Output returned";
}

function parseCodexUserMessage(
  value: string,
  idPrefix: string,
  imageUrls: string[] = []
) {
  const visibleValue = userVisiblePrompt(value);
  const requestMarker = value.match(/^##\s+My request for Codex:\s*$/m);

  if (!/^#\s+Files mentioned by the user:/m.test(value) || !requestMarker) {
    return {
      body: visibleValue,
      attachments: [] as ConversationAttachment[]
    };
  }

  const requestStart = (requestMarker.index ?? 0) + requestMarker[0].length;
  const filesSection = value.slice(0, requestMarker.index).trim();
  const requestBody = userVisiblePrompt(value.slice(requestStart).trim());
  const attachments: ConversationAttachment[] = [];

  for (const line of filesSection.split("\n")) {
    const match = line.match(/^##\s+(.+?):\s+(.+)$/);

    if (!match) {
      continue;
    }

    const [, label, filePath] = match;
    attachments.push({
      id: `${idPrefix}-attachment-${attachments.length + 1}`,
      type: "file",
      filename: label.trim(),
      mediaType: inferMediaType(label.trim() || filePath.trim()),
      url: imageUrls[attachments.length]
    });
  }

  return {
    body: requestBody || value,
    attachments
  };
}

function imageUrlsFromPayload(payload: JsonRecord) {
  const urls: string[] = [];

  for (const image of asArray(payload.images)) {
    const url = asString(image);

    if (url) {
      urls.push(url);
    }
  }

  for (const image of asArray(payload.local_images)) {
    const url = localImageToDataUrl(image);

    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

function localImageToDataUrl(value: unknown) {
  const filePath =
    typeof value === "string"
      ? value
      : asString(asRecord(value).path) ?? asString(asRecord(value).filePath);

  if (!filePath) {
    return undefined;
  }

  try {
    const bytes = fs.readFileSync(filePath);
    return `data:${inferMediaType(filePath)};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function inferMediaType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  if ([".png", ".apng"].includes(extension)) {
    return "image/png";
  }

  if ([".jpg", ".jpeg"].includes(extension)) {
    return "image/jpeg";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if ([".mp4", ".m4v"].includes(extension)) {
    return "video/mp4";
  }

  if (extension === ".mov") {
    return "video/quicktime";
  }

  if ([".mp3", ".mpeg"].includes(extension)) {
    return "audio/mpeg";
  }

  if (extension === ".wav") {
    return "audio/wav";
  }

  if (extension === ".pdf") {
    return "application/pdf";
  }

  if ([".json", ".jsonl"].includes(extension)) {
    return "application/json";
  }

  if ([".md", ".txt", ".ts", ".tsx", ".js", ".jsx", ".css", ".html"].includes(extension)) {
    return "text/plain";
  }

  return "application/octet-stream";
}

function valueToDisplay(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function trimText(value: string) {
  return trimToLength(value, MAX_TEXT_LENGTH);
}

function trimDetail(value: string) {
  return trimToLength(value, MAX_DETAIL_LENGTH);
}

function trimToLength(value: string, length: number) {
  const normalized = value.replace(/\s+\n/g, "\n").trim();

  return normalized.length > length
    ? `${normalized.slice(0, length - 1).trimEnd()}...`
    : normalized;
}

function titleFromText(value: string) {
  const titleText = titleVisiblePrompt(value);

  if (isContinuationSummary(titleText)) {
    return undefined;
  }

  const normalizedTitle = normalizedTitleFromPrompt(titleText);

  if (normalizedTitle) {
    return normalizedTitle;
  }

  const firstLine = titleText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return undefined;
  }

  return trimToLength(firstLine.replace(/^#+\s*/, ""), 58);
}

function normalizedTitleFromPrompt(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const featureTitle = normalized.match(/^Feature:\s*(.+?)(?:\.|$)/i)?.[1];

  if (featureTitle) {
    return titleFromFeature(featureTitle);
  }

  const errorDocsTitle = titleFromErrorDocsPrompt(normalized);

  if (errorDocsTitle) {
    return errorDocsTitle;
  }

  const comparable = normalized
    .toLowerCase()
    .replace(/[?.!]+$/g, "")
    .replace(/\bwhat's\b/g, "what is");

  if (/^what is (?:this|the) project about$/.test(comparable)) {
    return "Explain project";
  }

  if (/^what features (?:could|can|should) we add to (?:this|the) project$/.test(comparable)) {
    return "Add features";
  }

  return undefined;
}

function titleFromFeature(value: string) {
  const comparable = value.toLowerCase();

  if (
    comparable.includes("model") &&
    comparable.includes("provider") &&
    comparable.includes("project")
  ) {
    return "Persist project model choice";
  }

  return titleCaseWords(value)
    .replace(/\bA\b/g, "a")
    .replace(/\bAn\b/g, "an")
    .replace(/\bThe\b/g, "the");
}

function titleFromErrorDocsPrompt(value: string) {
  const urlMatch = value.match(
    /reviewing the docs at (https?:\/\/\S+)/i
  );

  if (!urlMatch) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(urlMatch[1].replace(/[),.;]+$/g, ""));
  } catch {
    return "Resolve documented error";
  }

  if (!url.hostname.endsWith("vercel.com")) {
    return "Resolve documented error";
  }

  const errorName = path.basename(url.pathname).replace(/\.md$/i, "");

  return errorName
    ? `Fix Vercel ${errorName} error`
    : "Fix Vercel error";
}

function titleCaseWords(value: string) {
  return trimToLength(value, 58)
    .split(" ")
    .map((word) =>
      word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word
    )
    .join(" ");
}

function titleVisiblePrompt(value: string) {
  const contextPacketTitle = value.match(
    /^(?:Composer|Forge) context packet\.[\s\S]*?^Session title:\s*(.+)$/im
  );

  if (contextPacketTitle?.[1]) {
    return contextPacketTitle[1].trim();
  }

  return userVisiblePrompt(value);
}

function userVisiblePrompt(value: string) {
  const withoutLeadingSystemInstruction = value
    .trim()
    .replace(/^<system_instruction>[\s\S]*?<\/system_instruction>\s*/i, "");

  const contextPacketUserRequest = withoutLeadingSystemInstruction.match(
    /^(?:Composer|Forge) context packet\.[\s\S]*?^User request:\s*([\s\S]+)$/im
  );

  if (contextPacketUserRequest?.[1]) {
    return contextPacketUserRequest[1].trim();
  }

  const branchPromptUserMessage = withoutLeadingSystemInstruction.match(
    /(?:^|\n)User message:\s*\n([\s\S]+)$/i
  );

  if (
    branchPromptUserMessage &&
    isBackgroundBranchNamePrompt(withoutLeadingSystemInstruction)
  ) {
    return branchPromptUserMessage[1].trim();
  }

  return withoutLeadingSystemInstruction.trim() || value.trim();
}

function isContinuationSummary(value: string) {
  return /^This session is being continued from a previous conversation/i.test(
    value.trim()
  );
}

function isHiddenHandoffTranscriptText(value: string) {
  const text = value.trim();

  return (
    /^<local-command-caveat>[\s\S]*<\/local-command-caveat>$/i.test(text) ||
    /^<local-command-stdout>[\s\S]*<\/local-command-stdout>$/i.test(text) ||
    /^<command-name>\s*\/?compact\s*<\/command-name>[\s\S]*Composer multi-provider handoff/i.test(text) ||
    /^Composer provider handoff context\./i.test(text) ||
    isContinuationSummary(text)
  );
}

function isBackgroundBranchNamePrompt(value: string) {
  return (
    /Respond directly to the user's prompt/i.test(value) &&
    /generating a git branch name for a coding task/i.test(value) &&
    /Return only the branch name/i.test(value)
  );
}

function titleFromCwd(cwd?: string) {
  return cwd ? path.basename(cwd) : undefined;
}

function titleFromPath(filePath: string) {
  return path.basename(filePath, ".jsonl");
}

function codexIdFromPath(filePath: string) {
  const basename = path.basename(filePath);
  const match = basename.match(
    /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/
  );

  return match?.[1] ?? path.basename(filePath, ".jsonl");
}

function latestTimestamp(rows: JsonRecord[]) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const timestamp = asString(rows[index].timestamp);

    if (timestamp) {
      return timestamp;
    }
  }

  return undefined;
}

function isoFromMtime(filePath: string) {
  const mtimeMs = safeMtimeMs(filePath);

  return mtimeMs ? new Date(mtimeMs).toISOString() : undefined;
}

function safeMtimeMs(filePath: string) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function relativeAge(timestamp?: string) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const deltaMs = Date.now() - date.getTime();

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

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function formatTime(timestamp?: string) {
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatToolName(name: string) {
  return name.replace(/^_/, "").replace(/_/g, " ");
}
