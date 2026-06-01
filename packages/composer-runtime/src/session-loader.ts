import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  archiveComposerSession,
  composerDelegateProviderSessionKeys,
  deleteComposerProviderSessionFile,
  providerSessionKey,
  readComposerProviderSessionFile,
  readComposerSessionRegistry,
  upsertComposerProviderSessionFile,
  upsertComposerProviderSessionFiles,
  type ComposerProviderSessionFileInput,
  type ComposerProviderSessionRecord,
  type ComposerSessionEvent,
  type ComposerSessionRegistry,
  type ComposerSessionRecord
} from "./composer-session-registry.js";
import {
  compareSessionsByUpdatedAt,
  FILE_SCAN_CONCURRENCY,
  finishSession,
  findJsonl,
  findJsonlPaths,
  log,
  mapWithConcurrency,
  MAX_SESSIONS_PER_PROVIDER,
  pathExists,
  relativeAge,
  selectSessionTree,
  sessionTimestamp,
  titleFromCwd,
  type ConversationItem,
  type JsonRecord,
  type ProviderSessionState,
  type SessionContent,
  type SessionProvider,
  type SubagentMetadata
} from "./session-loader/shared.js";
import {
  codexIdFromPath,
  isCodexChatSessionCwd,
  parseCodexSession,
  readCodexIndex
} from "./session-loader/codex-adapter.js";
import {
  findClaudeProjectJsonl,
  findClaudeProjectJsonlPaths,
  parseClaudeSession
} from "./session-loader/claude-adapter.js";

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

export type SessionSnapshot = {
  projects: Project[];
  sessions: Record<string, SessionContent>;
};

export type LocalSessionAction = "archive";

const providerSessionFilePathCache = new Map<string, string>();

export function loadLocalSessions(): Promise<SessionSnapshot> {
  return loadLocalSessionSnapshot({ includeItems: true });
}

export async function loadLocalSessionList(): Promise<SessionSnapshot> {
  return loadLocalSessionSnapshot({ includeItems: false });
}

export async function loadLocalSessionContent(sessionId: string): Promise<SessionContent | undefined> {
  const registry = readComposerSessionRegistry();
  const sessionRecord = registry.sessions.find((session) => session.id === sessionId);

  if (sessionRecord && sessionRecord.status !== "archived") {
    const providerRecords = activeProviderRecordsForSession(
      sessionRecord,
      registry.providerSessions.filter((record) =>
        record.composerSessionId === sessionRecord.id
      )
    );
    // Single-render mode only displays the visible provider record's items, so
    // load full items for that record alone and metadata-only for the rest.
    // Hybrid/handoff modes interleave every record's items, so they all need a
    // full load. latestSessionUpdatedAt only consumes each native's updatedAt,
    // which the metadata-only load still resolves from mtime.
    const fullItemKeys = providerRecordKeysRequiringItems(
      sessionRecord,
      providerRecords
    );
    const nativeSessions = uniqueSessionsById(
      (
        await Promise.all(
          providerRecords.map((record) =>
            loadNativeProviderSession(
              record.provider,
              record.providerSessionId,
              {
                includeItems: fullItemKeys.has(
                  providerSessionKey(record.provider, record.providerSessionId)
                )
              }
            )
          )
        )
      ).filter((session): session is SessionContent => Boolean(session))
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
    return (await loadNativeProviderSession("codex", sessionId.slice("codex-".length), {
      includeItems: true
    })) ?? undefined;
  }

  if (sessionId.startsWith("claude-")) {
    return (await loadNativeProviderSession("claude", sessionId.slice("claude-".length), {
      includeItems: true
    })) ?? undefined;
  }

  return undefined;
}

async function loadLocalSessionSnapshot(options: { includeItems: boolean }): Promise<SessionSnapshot> {
  const registry = readComposerSessionRegistry();
  const delegateKeys = composerDelegateProviderSessionKeys(registry);
  const claudeSessions = await loadClaudeSessions(options);
  const codexSessions = await loadCodexSessions(options);
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

/**
 * Returns the set of provider-session keys whose native transcript items are
 * actually rendered for `sessionRecord`. Single-render mode only displays the
 * visible provider record; hybrid (parallel) and handoff modes interleave every
 * record. Mirrors the render-mode branching in {@link composerSessionFromRecord}
 * so single-render opens avoid fully parsing the non-visible provider sessions.
 */
function providerRecordKeysRequiringItems(
  sessionRecord: ComposerSessionRecord,
  providerRecords: ComposerProviderSessionRecord[]
): Set<string> {
  const allKeys = () =>
    new Set(
      providerRecords.map((record) =>
        providerSessionKey(record.provider, record.providerSessionId)
      )
    );

  const renderMode = sessionRecord.renderMode ??
    (sessionRecord.hybridMode === "parallel-initial" && !sessionRecord.parallelAdoptedProvider
      ? "hybrid"
      : "single");

  if (renderMode === "hybrid" && !sessionRecord.parallelAdoptedProvider) {
    return allKeys();
  }

  if (shouldRenderHandoffTimeline(sessionRecord, providerRecords)) {
    return allKeys();
  }

  const visibleProvider = sessionRecord.parallelAdoptedProvider ??
    (sessionRecord.currentProvider === "codex" || sessionRecord.currentProvider === "claude"
      ? sessionRecord.currentProvider
      : providerRecords[0]?.provider);
  const visibleRecord = visibleProvider
    ? latestProviderRecord(providerRecords.filter((record) => record.provider === visibleProvider))
    : latestProviderRecord(providerRecords);

  if (!visibleRecord) {
    // Fall back to a full load so we never under-fetch the visible items.
    return allKeys();
  }

  return new Set([
    providerSessionKey(visibleRecord.provider, visibleRecord.providerSessionId)
  ]);
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

  return compactAdjacentHandoffMarkers([...events, ...handoffMarkers]
    .sort((a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
      a.order - b.order ||
      a.id.localeCompare(b.id)
    )
    .map((entry) => entry.item));
}

function handoffTimelineEvents(
  sessionRecord: ComposerSessionRecord,
  providerRecords: ComposerProviderSessionRecord[],
  registryEvents: ComposerSessionEvent[]
) {
  type HandoffEvent = {
    timestamp: string;
    provider: "codex" | "claude";
    providerSessionId?: string;
    handoff?: boolean;
  };
  const providerKeys = new Set(
    providerRecords.map((record) =>
      providerSessionKey(record.provider, record.providerSessionId)
    )
  );
  const attachEvents: HandoffEvent[] = registryEvents
    .filter((event) =>
      event.composerSessionId === sessionRecord.id &&
      event.type === "provider_session_attached" &&
      isDelegateProvider(event.provider) &&
      event.providerSessionId &&
      providerKeys.has(providerSessionKey(event.provider, event.providerSessionId))
    )
    .map((event) => ({
      timestamp: event.timestamp,
      provider: event.provider as "codex" | "claude",
      providerSessionId: event.providerSessionId,
      handoff:
        event.data?.mode === "handoff" ||
        event.data?.role === "handoff" ||
        event.data?.lifecycle === "handoff"
    }))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const events = handoffTransitions(attachEvents);

  const orderedRecords = [...providerRecords].sort((a, b) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
  const eventKeys = new Set(
    events.map((event) =>
      providerSessionKey(event.provider, event.providerSessionId ?? "")
    )
  );
  const recordEvents = handoffTransitions(
    orderedRecords
      .filter((record) => isDelegateProvider(record.provider))
      .map((record) => ({
        timestamp: record.createdAt,
        provider: record.provider as "codex" | "claude",
        providerSessionId: record.providerSessionId,
        handoff:
          record.mode === "handoff" ||
          record.role === "handoff" ||
          record.lifecycle === "handoff"
      }))
  )
    .filter(
      (event) =>
        !eventKeys.has(providerSessionKey(event.provider, event.providerSessionId ?? ""))
    )
    .map((record) => ({
      timestamp: record.timestamp,
      provider: record.provider,
      providerSessionId: record.providerSessionId
    }));

  return [...events, ...recordEvents].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
}

function handoffTransitions<
  Event extends {
    timestamp: string;
    provider?: SessionProvider;
    providerSessionId?: string;
    handoff?: boolean;
  }
>(events: Event[]) {
  return events.filter((event, index) => {
    let previous:
      | { provider?: SessionProvider }
      | undefined;

    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const candidate = events[previousIndex];

      if (candidate.provider !== event.provider) {
        previous = candidate;
        break;
      }
    }

    return event.handoff && Boolean(previous);
  });
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

function compactAdjacentHandoffMarkers(items: ConversationItem[]) {
  const compacted: ConversationItem[] = [];

  for (const item of items) {
    const previous = compacted[compacted.length - 1];

    if (isHandoffMarkerItem(previous) && isHandoffMarkerItem(item)) {
      compacted[compacted.length - 1] = item;
      continue;
    }

    compacted.push(item);
  }

  return compacted;
}

function isHandoffMarkerItem(item: ConversationItem | undefined) {
  return (
    item?.type === "tool_group" &&
    item.details.some((detail) =>
      /\bpreparing handoff context\b/i.test(
        [item.summary, detail.label, detail.toolName].filter(Boolean).join(" ")
      )
    )
  );
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
    model: "Compare agents",
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

async function loadCodexSessions(options: { includeItems: boolean }): Promise<SessionContent[]> {
  const codexRoot = path.join(os.homedir(), ".codex");
  const index = await readCodexIndex(codexRoot);
  const files = (await findJsonl(path.join(codexRoot, "sessions")))
    .filter((file) => !file.fullPath.endsWith("session_index.jsonl"))
    // Newest-by-mtime first so the bounded pool resolves the most relevant
    // sessions earliest.
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Parse the unavoidable previews with a bounded concurrency pool instead of
  // serially; results stay in newest-first order.
  const parsedFiles = await mapWithConcurrency(
    files,
    FILE_SCAN_CONCURRENCY,
    async (file) => ({
      file,
      parsed: await parseCodexSession(file.fullPath, index, options)
    })
  );

  const sessions: SessionContent[] = [];
  const fileRecords: ComposerProviderSessionFileInput[] = [];

  for (const { file, parsed } of parsedFiles) {
    if (!parsed) {
      continue;
    }

    // Cache + persist the file path for every listed session, including
    // zero-item ones, so a later single-file open hits the fast path. This was
    // previously gated behind the items>0 list filter, leaving zero-item
    // sessions uncacheable.
    cacheSessionFilePath(parsed, file.fullPath);
    const fileRecord = providerSessionFileInput(parsed, file.fullPath, file.mtimeMs);

    if (fileRecord) {
      fileRecords.push(fileRecord);
    }

    if (!options.includeItems || parsed.items.length > 0) {
      sessions.push(parsed);
    }
  }

  persistProviderSessionFileInputs(fileRecords);

  return selectSessionTree(sessions, MAX_SESSIONS_PER_PROVIDER);
}

async function loadNativeProviderSession(
  provider: "codex" | "claude",
  providerSessionId: string,
  options: { includeItems: boolean }
) {
  const filePath = await findSessionFile({
    id: `${provider}-${providerSessionId}`,
    provider,
    providerSessionId
  });

  if (!filePath) {
    return undefined;
  }

  if (provider === "codex") {
    return (await parseCodexSession(
      filePath,
      await readCodexIndex(path.join(os.homedir(), ".codex")),
      options
    )) ?? undefined;
  }

  return (await parseClaudeSession(filePath, options)) ?? undefined;
}

export async function updateLocalSessionVisibility(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId">,
  action: LocalSessionAction
) {
  const archivedComposerSession = action === "archive"
    ? archiveComposerSession(session.id)
    : false;
  const filePath = await findSessionFile(session);

  if (!filePath) {
    return {
      ok: true,
      changed: archivedComposerSession,
      reason: archivedComposerSession ? undefined : "No local session file found"
    };
  }

  const archivePath = archivePathForSessionFile(filePath, session.provider);
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.rename(filePath, await uniqueFilePath(archivePath));

  return { ok: true, changed: true, filePath };
}

async function loadClaudeSessions(options: { includeItems: boolean }): Promise<SessionContent[]> {
  const projectsRoot = path.join(os.homedir(), ".claude", "projects");
  // Newest-by-mtime first so the bounded pool resolves the most relevant
  // sessions earliest.
  const files = (await findClaudeProjectJsonl(projectsRoot)).sort(
    (a, b) => b.mtimeMs - a.mtimeMs
  );

  // Parse the unavoidable previews with a bounded concurrency pool instead of
  // serially; results stay in newest-first order.
  const parsedFiles = await mapWithConcurrency(
    files,
    FILE_SCAN_CONCURRENCY,
    async (file) => ({
      file,
      parsed: await parseClaudeSession(file.fullPath, options)
    })
  );

  const sessions: SessionContent[] = [];
  const fileRecords: ComposerProviderSessionFileInput[] = [];

  for (const { file, parsed } of parsedFiles) {
    if (!parsed) {
      continue;
    }

    // Cache + persist the file path for every listed session, including
    // zero-item ones, so a later single-file open hits the fast path. This was
    // previously gated behind the items>0 list filter, leaving zero-item
    // sessions uncacheable.
    cacheSessionFilePath(parsed, file.fullPath);
    const fileRecord = providerSessionFileInput(parsed, file.fullPath, file.mtimeMs);

    if (fileRecord) {
      fileRecords.push(fileRecord);
    }

    if (!options.includeItems || parsed.items.length > 0) {
      sessions.push(parsed);
    }
  }

  persistProviderSessionFileInputs(fileRecords);

  return selectSessionTree(sessions, MAX_SESSIONS_PER_PROVIDER);
}

async function findSessionFile(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId">
) {
  const providerId = providerIdForSession(session);

  if (!providerId) {
    return undefined;
  }

  const cachedFilePath = await cachedSessionFilePath(session);

  if (cachedFilePath) {
    return cachedFilePath;
  }

  let filePath: string | undefined;

  // On a cache miss we only need the matching path, so enumerate paths without
  // statting every file (the mtimes were previously computed and discarded).
  if (session.provider === "codex") {
    filePath = (await findJsonlPaths(path.join(os.homedir(), ".codex", "sessions")))
      .find((filePath) => codexIdFromPath(filePath) === providerId);
  } else if (session.provider === "claude") {
    filePath = (await findClaudeProjectJsonlPaths(path.join(os.homedir(), ".claude", "projects")))
      .find((filePath) => path.basename(filePath, ".jsonl") === providerId);
  }

  if (filePath) {
    cacheSessionFilePath(session, filePath);
    const fileRecord = providerSessionFileInput(session, filePath);

    if (fileRecord) {
      try {
        upsertComposerProviderSessionFile(fileRecord);
      } catch {
        // Persistent metadata is only a fast path; transcript loading still works
        // through provider directory scans when metadata writes fail.
      }
    }
  }

  return filePath;
}

async function cachedSessionFilePath(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId">
) {
  const cacheKey = providerSessionFilePathCacheKey(session);

  if (!cacheKey) {
    return undefined;
  }

  let filePath = providerSessionFilePathCache.get(cacheKey);

  if (!filePath) {
    try {
      const providerId = providerIdForSession(session);

      filePath =
        providerId && (session.provider === "codex" || session.provider === "claude")
          ? readComposerProviderSessionFile(session.provider, providerId)?.filePath
          : undefined;
    } catch {
      filePath = undefined;
    }
  }

  if (!filePath) {
    return undefined;
  }

  if (await pathExists(filePath)) {
    providerSessionFilePathCache.set(cacheKey, filePath);
    return filePath;
  }

  providerSessionFilePathCache.delete(cacheKey);
  try {
    const providerId = providerIdForSession(session);

    if (providerId && (session.provider === "codex" || session.provider === "claude")) {
      deleteComposerProviderSessionFile(session.provider, providerId);
    }
  } catch {
    // Persistent metadata is an optimization; stale cleanup should not block loading.
  }
  return undefined;
}

function cacheSessionFilePath(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId"> &
    Partial<Pick<SessionContent, "cwd" | "title">>,
  filePath: string
) {
  const cacheKey = providerSessionFilePathCacheKey(session);

  if (cacheKey) {
    providerSessionFilePathCache.set(cacheKey, filePath);
  }
}

function providerSessionFileInput(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId"> &
    Partial<Pick<SessionContent, "cwd" | "title">>,
  filePath: string,
  fileMtimeMs?: number
): ComposerProviderSessionFileInput | null {
  const providerId = providerIdForSession(session);

  if (!providerId || (session.provider !== "codex" && session.provider !== "claude")) {
    return null;
  }

  return {
    provider: session.provider,
    providerSessionId: providerId,
    filePath,
    fileMtimeMs,
    cwd: session.cwd,
    title: session.title
  };
}

function persistProviderSessionFileInputs(
  records: ComposerProviderSessionFileInput[]
) {
  if (records.length === 0) {
    return;
  }

  try {
    upsertComposerProviderSessionFiles(records);
  } catch {
    // Persistent metadata is only a fast path; transcript loading still works
    // through provider directory scans when metadata writes fail.
  }
}

function providerSessionFilePathCacheKey(
  session: Pick<SessionContent, "id" | "provider" | "providerSessionId">
) {
  const providerId = providerIdForSession(session);

  return providerId ? `${session.provider}:${providerId}` : undefined;
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

async function uniqueFilePath(filePath: string) {
  if (!(await pathExists(filePath))) {
    return filePath;
  }

  const extension = path.extname(filePath);
  const base = filePath.slice(0, -extension.length);

  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `${base}-${index}${extension}`;

    if (!(await pathExists(candidate))) {
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

function normalizeCwd(value?: string) {
  if (!value) {
    return undefined;
  }

  return path.resolve(value);
}
