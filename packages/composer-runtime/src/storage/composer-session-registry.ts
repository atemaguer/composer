import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  composerStateDatabasePath,
  type ComposerStateDatabaseOptions
} from "./composer-home.js";

export type ComposerDelegateProvider = "codex" | "claude";
export type ComposerSessionProvider = ComposerDelegateProvider | "meta";
export type ComposerSessionRenderMode = "single" | "hybrid";
export type ComposerHybridMode = "planner-review" | "parallel-initial" | "handoff";
export type ComposerProviderLifecycle =
  | "active"
  | "adopted"
  | "discarded"
  | "handoff";

export type ComposerSessionRecord = {
  id: string;
  title?: string;
  sourceCwd?: string;
  displayCwd?: string;
  activeCwd?: string;
  currentProvider?: ComposerSessionProvider;
  lastProvider?: ComposerSessionProvider;
  renderMode?: ComposerSessionRenderMode;
  hybridMode?: ComposerHybridMode;
  parallelAdoptedProvider?: ComposerDelegateProvider;
  status?: string;
  createdAt: string;
  updatedAt: string;
};

export type ComposerProviderSessionRecord = {
  composerSessionId: string;
  provider: ComposerDelegateProvider;
  providerSessionId: string;
  mode?: ComposerHybridMode;
  role?: "parallel-initial" | "planner" | "executor" | "handoff" | "primary";
  lifecycle: ComposerProviderLifecycle;
  cwd?: string;
  projectPath?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  originalCwd?: string;
  originalBranch?: string;
  originalHead?: string;
  lastContextVersion?: number;
  createdAt: string;
  updatedAt: string;
};

export type ComposerProviderSessionFileRecord = {
  provider: ComposerDelegateProvider;
  providerSessionId: string;
  filePath: string;
  fileMtimeMs?: number;
  fileSizeBytes?: number;
  cwd?: string;
  title?: string;
  updatedAt: string;
};

export type ComposerProviderSessionFileInput = {
  provider: ComposerDelegateProvider;
  providerSessionId: string;
  filePath: string;
  fileMtimeMs?: number;
  fileSizeBytes?: number;
  cwd?: string;
  title?: string;
  updatedAt?: string;
};

export type ComposerSessionEvent = {
  id: string;
  composerSessionId: string;
  type: string;
  provider?: ComposerSessionProvider;
  providerSessionId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

export type ComposerSessionRegistry = {
  version: 1;
  sessions: ComposerSessionRecord[];
  providerSessions: ComposerProviderSessionRecord[];
  events: ComposerSessionEvent[];
};

export type ComposerSessionRegistryStoreOptions = ComposerStateDatabaseOptions;

export type ComposerRuntimeSessionLike = {
  id: string;
  provider?: ComposerSessionProvider;
  providerSessionId?: string;
  title?: string;
  cwd?: string;
  displayCwd?: string;
  model?: string;
  renderMode?: ComposerSessionRenderMode;
  parallelAdoptedProvider?: ComposerDelegateProvider;
  runtimeStatus?: string;
  updatedAt?: string;
  lastProvider?: ComposerSessionProvider;
  providerSessions?: Partial<Record<
    ComposerSessionProvider,
    {
      sessionId?: string;
      cwd?: string;
      worktreePath?: string;
      worktreeBranch?: string;
      originalCwd?: string;
      originalBranch?: string;
      originalHead?: string;
      lastContextVersion?: number;
    }
  >>;
};

export type ComposerProviderSessionInput = {
  composerSessionId: string;
  provider: ComposerDelegateProvider;
  providerSessionId: string;
  mode?: ComposerHybridMode;
  role?: ComposerProviderSessionRecord["role"];
  lifecycle?: ComposerProviderLifecycle;
  cwd?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  originalCwd?: string;
  originalBranch?: string;
  originalHead?: string;
  lastContextVersion?: number;
};

export type ComposerParallelProviderAdoption = {
  composerSessionId: string;
  provider: ComposerDelegateProvider;
  providerSessionId?: string;
  activeCwd?: string;
};

export type ComposerSessionRegistryStore = {
  registryPath: string;
  read(): ComposerSessionRegistry;
  write(registry: ComposerSessionRegistry): void;
  upsertSessionFromRuntime(session: ComposerRuntimeSessionLike): void;
  upsertProviderSessions(records: ComposerProviderSessionInput[]): void;
  adoptParallelProvider(adoption: ComposerParallelProviderAdoption): void;
  archiveSession(composerSessionId: string): boolean;
  delegateProviderSessionKeys(registry?: ComposerSessionRegistry): Set<string>;
  readProviderSessionFile(
    provider: ComposerDelegateProvider,
    providerSessionId: string
  ): ComposerProviderSessionFileRecord | undefined;
  upsertProviderSessionFiles(records: ComposerProviderSessionFileInput[]): void;
  deleteProviderSessionFile(
    provider: ComposerDelegateProvider,
    providerSessionId: string
  ): void;
};

const MAX_EVENTS = 1_000;

export function createComposerSessionRegistryStore(
  options: ComposerSessionRegistryStoreOptions = {}
): ComposerSessionRegistryStore {
  return {
    registryPath: composerSessionRegistryPath(options),
    read: () => readComposerSessionRegistry(options),
    write: (registry) => writeComposerSessionRegistry(registry, options),
    upsertSessionFromRuntime: (session) =>
      upsertComposerSessionFromRuntime(session, options),
    upsertProviderSessions: (records) =>
      upsertComposerProviderSessions(records, options),
    adoptParallelProvider: (adoption) =>
      adoptComposerParallelProvider(adoption, options),
    archiveSession: (composerSessionId) =>
      archiveComposerSession(composerSessionId, options),
    delegateProviderSessionKeys: (registry) =>
      composerDelegateProviderSessionKeys(registry ?? readComposerSessionRegistry(options)),
    readProviderSessionFile: (provider, providerSessionId) =>
      readComposerProviderSessionFile(provider, providerSessionId, options),
    upsertProviderSessionFiles: (records) =>
      upsertComposerProviderSessionFiles(records, options),
    deleteProviderSessionFile: (provider, providerSessionId) =>
      deleteComposerProviderSessionFile(provider, providerSessionId, options)
  };
}

export function composerSessionRegistryPath(
  options: ComposerSessionRegistryStoreOptions = {}
) {
  return composerStateDatabasePath(options);
}

export function readComposerSessionRegistry(
  options?: ComposerSessionRegistryStoreOptions
): ComposerSessionRegistry {
  const db = openRegistryDatabase(options);

  return {
    version: 1,
    sessions: readSessionRecords(db),
    providerSessions: readProviderSessionRecords(db),
    events: readSessionEvents(db)
  };
}

export function writeComposerSessionRegistry(
  registry: ComposerSessionRegistry,
  options?: ComposerSessionRegistryStoreOptions
) {
  const db = openRegistryDatabase(options);

  replaceRegistry(db, trimRegistry(registry));
}

export function upsertComposerSessionFromRuntime(
  session: ComposerRuntimeSessionLike,
  options?: ComposerSessionRegistryStoreOptions
) {
  const db = openRegistryDatabase(options);
  const now = new Date().toISOString();

  transaction(db, () => {
    const existing = readSessionRecord(db, session.id);
    const sourceCwd = session.displayCwd ?? existing?.sourceCwd ?? session.cwd;
    const activeCwd = session.cwd ?? existing?.activeCwd;

    upsertSessionRecord(db, {
      id: session.id,
      title: session.title ?? existing?.title,
      sourceCwd,
      displayCwd: session.displayCwd ?? sourceCwd,
      activeCwd,
      currentProvider: session.provider ?? existing?.currentProvider,
      lastProvider: session.lastProvider ?? existing?.lastProvider,
      renderMode: session.renderMode ?? existing?.renderMode,
      hybridMode: isCompareAgentsModel(session.model)
        ? "parallel-initial"
        : existing?.hybridMode,
      parallelAdoptedProvider:
        session.parallelAdoptedProvider ?? existing?.parallelAdoptedProvider,
      status: session.runtimeStatus ?? existing?.status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: session.updatedAt ?? now
    });

    for (const provider of ["codex", "claude"] as const) {
      const state = session.providerSessions?.[provider];
      const providerSessionId =
        state?.sessionId ??
        (session.provider === provider ? session.providerSessionId : undefined);

      if (!providerSessionId) {
        continue;
      }

      const existingProviderRecord = readProviderSessionRecord(
        db,
        provider,
        providerSessionId
      );

      upsertProviderSessionRecord(db, {
        composerSessionId: session.id,
        provider,
        providerSessionId,
        lifecycle: existingProviderRecord?.lifecycle ??
          (session.parallelAdoptedProvider === provider ? "adopted" : "active"),
        cwd: state?.cwd ?? (session.provider === provider ? session.cwd : undefined),
        worktreePath: state?.worktreePath,
        worktreeBranch: state?.worktreeBranch,
        originalCwd: state?.originalCwd,
        originalBranch: state?.originalBranch,
        originalHead: state?.originalHead,
        lastContextVersion: state?.lastContextVersion,
        updatedAt: session.updatedAt ?? now
      });
    }
  });
}

function isCompareAgentsModel(model?: string) {
  return model === "Compare agents" || model === "Codex + Claude parallel";
}

export function upsertComposerProviderSessions(
  records: ComposerProviderSessionInput[],
  options?: ComposerSessionRegistryStoreOptions
) {
  if (records.length === 0) {
    return;
  }

  const db = openRegistryDatabase(options);
  const updatedAt = new Date().toISOString();

  transaction(db, () => {
    for (const record of records) {
      upsertSessionRecord(db, {
        id: record.composerSessionId,
        updatedAt
      });
      upsertProviderSessionRecord(db, {
        ...record,
        lifecycle: record.lifecycle ?? lifecycleForMode(record.mode),
        updatedAt
      });
      appendEvent(db, {
        composerSessionId: record.composerSessionId,
        type: "provider_session_attached",
        provider: record.provider,
        providerSessionId: record.providerSessionId,
        data: {
          mode: record.mode,
          role: record.role,
          lifecycle: record.lifecycle ?? lifecycleForMode(record.mode),
          cwd: record.cwd
        }
      });
    }
  });
}

export function adoptComposerParallelProvider({
  composerSessionId,
  provider,
  providerSessionId,
  activeCwd
}: ComposerParallelProviderAdoption, options?: ComposerSessionRegistryStoreOptions) {
  const db = openRegistryDatabase(options);
  const now = new Date().toISOString();

  transaction(db, () => {
    const providerRecords = db.prepare(
      "SELECT provider, provider_session_id, mode, lifecycle FROM provider_sessions WHERE composer_session_id = ?"
    ).all(composerSessionId) as ProviderSessionRow[];

    for (const record of providerRecords) {
      if (
        record.provider === provider &&
        (!providerSessionId || record.provider_session_id === providerSessionId)
      ) {
        db.prepare(
          "UPDATE provider_sessions SET lifecycle = 'adopted', cwd = COALESCE(?, cwd), updated_at = ? WHERE provider = ? AND provider_session_id = ?"
        ).run(activeCwd ?? null, now, provider, record.provider_session_id);
      } else if (record.mode === "parallel-initial" || record.lifecycle === "active") {
        db.prepare(
          "UPDATE provider_sessions SET lifecycle = 'discarded', updated_at = ? WHERE provider = ? AND provider_session_id = ?"
        ).run(now, record.provider, record.provider_session_id);
      }
    }

    db.prepare(
      `UPDATE composer_sessions
       SET current_provider = ?,
           last_provider = ?,
           render_mode = 'single',
           parallel_adopted_provider = ?,
           active_cwd = COALESCE(?, active_cwd),
           updated_at = ?
       WHERE id = ?`
    ).run(provider, provider, provider, activeCwd ?? null, now, composerSessionId);

    appendEvent(db, {
      composerSessionId,
      type: "parallel_provider_adopted",
      provider,
      providerSessionId,
      data: { activeCwd }
    });
  });
}

export function archiveComposerSession(
  composerSessionId: string,
  options?: ComposerSessionRegistryStoreOptions
) {
  const db = openRegistryDatabase(options);
  const now = new Date().toISOString();

  let changed = false;

  transaction(db, () => {
    const existing = readSessionRecord(db, composerSessionId);

    if (!existing || existing.status === "archived") {
      return;
    }

    db.prepare(
      "UPDATE composer_sessions SET status = 'archived', updated_at = ? WHERE id = ?"
    ).run(now, composerSessionId);
    appendEvent(db, {
      composerSessionId,
      type: "session_archived",
      data: { previousStatus: existing.status }
    });
    changed = true;
  });

  return changed;
}

export function renameComposerSession(
  composerSessionId: string,
  title: string,
  options?: ComposerSessionRegistryStoreOptions
) {
  const db = openRegistryDatabase(options);
  const now = new Date().toISOString();
  const trimmed = title.trim();

  let changed = false;

  transaction(db, () => {
    const existing = readSessionRecord(db, composerSessionId);

    if (!existing || !trimmed || existing.title === trimmed) {
      return;
    }

    db.prepare(
      "UPDATE composer_sessions SET title = ?, updated_at = ? WHERE id = ?"
    ).run(trimmed, now, composerSessionId);
    appendEvent(db, {
      composerSessionId,
      type: "session_renamed",
      data: { previousTitle: existing.title ?? null, title: trimmed }
    });
    changed = true;
  });

  return changed;
}

export function composerDelegateProviderSessionKeys(
  registry = readComposerSessionRegistry()
) {
  return new Set(
    registry.providerSessions.map((record) =>
      providerSessionKey(record.provider, record.providerSessionId)
    )
  );
}

export function readComposerProviderSessionFile(
  provider: ComposerDelegateProvider,
  providerSessionId: string,
  options?: ComposerSessionRegistryStoreOptions
): ComposerProviderSessionFileRecord | undefined {
  const db = openRegistryDatabase(options);

  return readProviderSessionFileRecord(db, provider, providerSessionId);
}

export function upsertComposerProviderSessionFile(
  record: ComposerProviderSessionFileInput,
  options?: ComposerSessionRegistryStoreOptions
) {
  upsertComposerProviderSessionFiles([record], options);
}

export function upsertComposerProviderSessionFiles(
  records: ComposerProviderSessionFileInput[],
  options?: ComposerSessionRegistryStoreOptions
) {
  if (records.length === 0) {
    return;
  }

  const db = openRegistryDatabase(options);

  transaction(db, () => {
    for (const record of records) {
      upsertProviderSessionFileRecord(db, record);
    }
  });
}

export function deleteComposerProviderSessionFile(
  provider: ComposerDelegateProvider,
  providerSessionId: string,
  options?: ComposerSessionRegistryStoreOptions
) {
  const db = openRegistryDatabase(options);

  db.prepare(
    "DELETE FROM provider_session_files WHERE provider = ? AND provider_session_id = ?"
  ).run(provider, providerSessionId);
}

export function providerSessionKey(
  provider: ComposerDelegateProvider,
  providerSessionId: string
) {
  return `${provider}:${providerSessionId}`;
}

function upsertSessionRecord(
  db: DatabaseSync,
  next: Partial<ComposerSessionRecord> & { id: string; updatedAt?: string; createdAt?: string }
) {
  const now = new Date().toISOString();
  const existing = readSessionRecord(db, next.id);
  const record: ComposerSessionRecord = {
    id: next.id,
    title: next.title ?? existing?.title,
    sourceCwd: next.sourceCwd ?? existing?.sourceCwd,
    displayCwd: next.displayCwd ?? existing?.displayCwd,
    activeCwd: next.activeCwd ?? existing?.activeCwd,
    currentProvider: next.currentProvider ?? existing?.currentProvider,
    lastProvider: next.lastProvider ?? existing?.lastProvider,
    renderMode: next.renderMode ?? existing?.renderMode,
    hybridMode: next.hybridMode ?? existing?.hybridMode,
    parallelAdoptedProvider:
      next.parallelAdoptedProvider ?? existing?.parallelAdoptedProvider,
    status: next.status ?? existing?.status,
    createdAt: existing?.createdAt ?? next.createdAt ?? now,
    updatedAt: next.updatedAt ?? now
  };

  db.prepare(
    `INSERT INTO composer_sessions (
       id, title, source_cwd, display_cwd, active_cwd, current_provider,
       last_provider, render_mode, hybrid_mode, parallel_adopted_provider,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       source_cwd = excluded.source_cwd,
       display_cwd = excluded.display_cwd,
       active_cwd = excluded.active_cwd,
       current_provider = excluded.current_provider,
       last_provider = excluded.last_provider,
       render_mode = excluded.render_mode,
       hybrid_mode = excluded.hybrid_mode,
       parallel_adopted_provider = excluded.parallel_adopted_provider,
       status = excluded.status,
       updated_at = excluded.updated_at`
  ).run(
    record.id,
    record.title ?? null,
    record.sourceCwd ?? null,
    record.displayCwd ?? null,
    record.activeCwd ?? null,
    record.currentProvider ?? null,
    record.lastProvider ?? null,
    record.renderMode ?? null,
    record.hybridMode ?? null,
    record.parallelAdoptedProvider ?? null,
    record.status ?? null,
    record.createdAt,
    record.updatedAt
  );
}

function upsertProviderSessionRecord(
  db: DatabaseSync,
  next: Partial<ComposerProviderSessionRecord> & {
    composerSessionId: string;
    provider: ComposerDelegateProvider;
    providerSessionId: string;
    updatedAt?: string;
  }
) {
  const now = new Date().toISOString();
  const existing = readProviderSessionRecord(db, next.provider, next.providerSessionId);
  const record: ComposerProviderSessionRecord = {
    composerSessionId: next.composerSessionId,
    provider: next.provider,
    providerSessionId: next.providerSessionId,
    mode: next.mode ?? existing?.mode,
    role: next.role ?? existing?.role,
    lifecycle: next.lifecycle ?? existing?.lifecycle ?? "active",
    cwd: next.cwd ?? existing?.cwd,
    projectPath: next.projectPath ?? existing?.projectPath,
    worktreePath: next.worktreePath ?? existing?.worktreePath,
    worktreeBranch: next.worktreeBranch ?? existing?.worktreeBranch,
    originalCwd: next.originalCwd ?? existing?.originalCwd,
    originalBranch: next.originalBranch ?? existing?.originalBranch,
    originalHead: next.originalHead ?? existing?.originalHead,
    lastContextVersion: next.lastContextVersion ?? existing?.lastContextVersion,
    createdAt: existing?.createdAt ?? next.createdAt ?? now,
    updatedAt: next.updatedAt ?? now
  };

  db.prepare(
    `INSERT INTO provider_sessions (
       provider, provider_session_id, composer_session_id, mode, role, lifecycle,
       cwd, project_path, worktree_path, worktree_branch, original_cwd,
       original_branch, original_head, last_context_version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_session_id) DO UPDATE SET
       composer_session_id = excluded.composer_session_id,
       mode = excluded.mode,
       role = excluded.role,
       lifecycle = excluded.lifecycle,
       cwd = excluded.cwd,
       project_path = excluded.project_path,
       worktree_path = excluded.worktree_path,
       worktree_branch = excluded.worktree_branch,
       original_cwd = excluded.original_cwd,
       original_branch = excluded.original_branch,
       original_head = excluded.original_head,
       last_context_version = excluded.last_context_version,
       updated_at = excluded.updated_at`
  ).run(
    record.provider,
    record.providerSessionId,
    record.composerSessionId,
    record.mode ?? null,
    record.role ?? null,
    record.lifecycle,
    record.cwd ?? null,
    record.projectPath ?? null,
    record.worktreePath ?? null,
    record.worktreeBranch ?? null,
    record.originalCwd ?? null,
    record.originalBranch ?? null,
    record.originalHead ?? null,
    record.lastContextVersion ?? null,
    record.createdAt,
    record.updatedAt
  );
}

function appendEvent(
  db: DatabaseSync,
  event: Omit<ComposerSessionEvent, "id" | "timestamp">
) {
  const record = {
    ...event,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString()
  };

  db.prepare(
    `INSERT INTO session_events (
       id, composer_session_id, type, provider, provider_session_id, timestamp, data_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.composerSessionId,
    record.type,
    record.provider ?? null,
    record.providerSessionId ?? null,
    record.timestamp,
    record.data ? JSON.stringify(record.data) : null
  );

  db.prepare(
    `DELETE FROM session_events
     WHERE id IN (
       SELECT id
       FROM session_events
       ORDER BY timestamp DESC, id DESC
       LIMIT -1 OFFSET ?
     )`
  ).run(MAX_EVENTS);
}

function upsertProviderSessionFileRecord(
  db: DatabaseSync,
  next: ComposerProviderSessionFileInput
) {
  const updatedAt = next.updatedAt ?? new Date().toISOString();

  db.prepare(
    `INSERT INTO provider_session_files (
       provider, provider_session_id, file_path, file_mtime_ms, file_size_bytes,
       cwd, title, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_session_id) DO UPDATE SET
       file_path = excluded.file_path,
       file_mtime_ms = excluded.file_mtime_ms,
       file_size_bytes = excluded.file_size_bytes,
       cwd = excluded.cwd,
       title = excluded.title,
       updated_at = excluded.updated_at`
  ).run(
    next.provider,
    next.providerSessionId,
    next.filePath,
    next.fileMtimeMs ?? null,
    next.fileSizeBytes ?? null,
    next.cwd ?? null,
    next.title ?? null,
    updatedAt
  );
}

function trimRegistry(registry: ComposerSessionRegistry): ComposerSessionRegistry {
  return {
    version: 1,
    sessions: dedupeBy(registry.sessions, (record) => record.id),
    providerSessions: dedupeBy(registry.providerSessions, (record) =>
      providerSessionKey(record.provider, record.providerSessionId)
    ),
    events: registry.events.slice(-MAX_EVENTS)
  };
}

function replaceRegistry(db: DatabaseSync, registry: ComposerSessionRegistry) {
  transaction(db, () => {
    db.exec("DELETE FROM session_events; DELETE FROM provider_sessions; DELETE FROM composer_sessions;");

    for (const session of registry.sessions) {
      upsertSessionRecord(db, session);
    }

    for (const providerSession of registry.providerSessions) {
      upsertProviderSessionRecord(db, providerSession);
    }

    for (const event of registry.events) {
      db.prepare(
        `INSERT INTO session_events (
           id, composer_session_id, type, provider, provider_session_id, timestamp, data_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        event.id,
        event.composerSessionId,
        event.type,
        event.provider ?? null,
        event.providerSessionId ?? null,
        event.timestamp,
        event.data ? JSON.stringify(event.data) : null
      );
    }
  });
}

type SessionRow = {
  id: string;
  title: string | null;
  source_cwd: string | null;
  display_cwd: string | null;
  active_cwd: string | null;
  current_provider: string | null;
  last_provider: string | null;
  render_mode: string | null;
  hybrid_mode: string | null;
  parallel_adopted_provider: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderSessionRow = {
  composer_session_id: string;
  provider: string;
  provider_session_id: string;
  mode: string | null;
  role: string | null;
  lifecycle: string;
  cwd: string | null;
  project_path: string | null;
  worktree_path: string | null;
  worktree_branch: string | null;
  original_cwd: string | null;
  original_branch: string | null;
  original_head: string | null;
  last_context_version: number | null;
  created_at: string;
  updated_at: string;
};

type ProviderSessionFileRow = {
  provider: string;
  provider_session_id: string;
  file_path: string;
  file_mtime_ms: number | null;
  file_size_bytes: number | null;
  cwd: string | null;
  title: string | null;
  updated_at: string;
};

type EventRow = {
  id: string;
  composer_session_id: string;
  type: string;
  provider: string | null;
  provider_session_id: string | null;
  timestamp: string;
  data_json: string | null;
};

function readSessionRecords(db: DatabaseSync) {
  return (db.prepare(
    "SELECT * FROM composer_sessions ORDER BY updated_at DESC, id DESC"
  ).all() as SessionRow[]).map(sessionFromRow);
}

function readProviderSessionFileRecord(
  db: DatabaseSync,
  provider: ComposerDelegateProvider,
  providerSessionId: string
) {
  const row = db.prepare(
    "SELECT * FROM provider_session_files WHERE provider = ? AND provider_session_id = ?"
  ).get(provider, providerSessionId) as ProviderSessionFileRow | undefined;

  return row ? providerSessionFileFromRow(row) : undefined;
}

function readSessionRecord(db: DatabaseSync, id: string) {
  const row = db.prepare(
    "SELECT * FROM composer_sessions WHERE id = ?"
  ).get(id) as SessionRow | undefined;

  return row ? sessionFromRow(row) : undefined;
}

function readProviderSessionRecords(db: DatabaseSync) {
  return (db.prepare(
    "SELECT * FROM provider_sessions ORDER BY updated_at DESC, provider, provider_session_id"
  ).all() as ProviderSessionRow[]).map(providerSessionFromRow);
}

function readProviderSessionRecord(
  db: DatabaseSync,
  provider: ComposerDelegateProvider,
  providerSessionId: string
) {
  const row = db.prepare(
    "SELECT * FROM provider_sessions WHERE provider = ? AND provider_session_id = ?"
  ).get(provider, providerSessionId) as ProviderSessionRow | undefined;

  return row ? providerSessionFromRow(row) : undefined;
}

function readSessionEvents(db: DatabaseSync) {
  return (db.prepare(
    "SELECT * FROM session_events ORDER BY timestamp ASC, rowid ASC"
  ).all() as EventRow[]).map(eventFromRow);
}

function sessionFromRow(row: SessionRow): ComposerSessionRecord {
  return {
    id: row.id,
    title: row.title ?? undefined,
    sourceCwd: row.source_cwd ?? undefined,
    displayCwd: row.display_cwd ?? undefined,
    activeCwd: row.active_cwd ?? undefined,
    currentProvider: parseSessionProvider(row.current_provider),
    lastProvider: parseSessionProvider(row.last_provider),
    renderMode: parseRenderMode(row.render_mode),
    hybridMode: parseHybridMode(row.hybrid_mode),
    parallelAdoptedProvider: parseDelegateProvider(row.parallel_adopted_provider),
    status: row.status ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function providerSessionFromRow(row: ProviderSessionRow): ComposerProviderSessionRecord {
  const provider = parseDelegateProvider(row.provider);

  if (!provider) {
    throw new Error(`Invalid provider in Composer registry: ${row.provider}`);
  }

  return {
    composerSessionId: row.composer_session_id,
    provider,
    providerSessionId: row.provider_session_id,
    mode: parseHybridMode(row.mode),
    role: parseRole(row.role),
    lifecycle: parseLifecycle(row.lifecycle) ?? "active",
    cwd: row.cwd ?? undefined,
    projectPath: row.project_path ?? undefined,
    worktreePath: row.worktree_path ?? undefined,
    worktreeBranch: row.worktree_branch ?? undefined,
    originalCwd: row.original_cwd ?? undefined,
    originalBranch: row.original_branch ?? undefined,
    originalHead: row.original_head ?? undefined,
    lastContextVersion: row.last_context_version ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function providerSessionFileFromRow(
  row: ProviderSessionFileRow
): ComposerProviderSessionFileRecord {
  const provider = parseDelegateProvider(row.provider);

  if (!provider) {
    throw new Error(`Invalid provider in Composer provider session file: ${row.provider}`);
  }

  return {
    provider,
    providerSessionId: row.provider_session_id,
    filePath: row.file_path,
    fileMtimeMs: row.file_mtime_ms ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    cwd: row.cwd ?? undefined,
    title: row.title ?? undefined,
    updatedAt: row.updated_at
  };
}

function eventFromRow(row: EventRow): ComposerSessionEvent {
  return {
    id: row.id,
    composerSessionId: row.composer_session_id,
    type: row.type,
    provider: parseSessionProvider(row.provider),
    providerSessionId: row.provider_session_id ?? undefined,
    timestamp: row.timestamp,
    data: parseEventData(row.data_json)
  };
}

// Long-lived connections keyed by resolved store path. Opening a fresh
// connection (PRAGMAs + ensureSchema) on every read/write is expensive, so we
// reuse a single connection per path and run ensureSchema exactly once when the
// connection is first created.
const registryConnections = new Map<string, DatabaseSync>();

function openRegistryDatabase(options?: ComposerSessionRegistryStoreOptions) {
  const storePath = composerSessionRegistryPath(options);

  const cached = registryConnections.get(storePath);
  if (cached) {
    return cached;
  }

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const db = new DatabaseSync(storePath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  ensureSchema(db);
  registryConnections.set(storePath, db);
  return db;
}

/**
 * Close all cached registry connections. Intended for app shutdown. Safe to
 * call when no connections are open. Subsequent reads/writes will lazily
 * reopen connections as needed.
 */
export function closeComposerSessionRegistry() {
  for (const db of registryConnections.values()) {
    try {
      db.close();
    } catch {
      // Ignore close failures during shutdown.
    }
  }
  registryConnections.clear();
}

function ensureSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS composer_sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      source_cwd TEXT,
      display_cwd TEXT,
      active_cwd TEXT,
      current_provider TEXT,
      last_provider TEXT,
      render_mode TEXT,
      hybrid_mode TEXT,
      parallel_adopted_provider TEXT,
      status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_sessions (
      provider TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      composer_session_id TEXT NOT NULL,
      mode TEXT,
      role TEXT,
      lifecycle TEXT NOT NULL,
      cwd TEXT,
      project_path TEXT,
      worktree_path TEXT,
      worktree_branch TEXT,
      original_cwd TEXT,
      original_branch TEXT,
      original_head TEXT,
      last_context_version INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, provider_session_id),
      FOREIGN KEY (composer_session_id) REFERENCES composer_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_events (
      id TEXT PRIMARY KEY,
      composer_session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT,
      provider_session_id TEXT,
      timestamp TEXT NOT NULL,
      data_json TEXT,
      FOREIGN KEY (composer_session_id) REFERENCES composer_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS provider_session_files (
      provider TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_mtime_ms REAL,
      file_size_bytes INTEGER,
      cwd TEXT,
      title TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, provider_session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_composer_sessions_updated
      ON composer_sessions(updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_composer_sessions_source_cwd
      ON composer_sessions(source_cwd, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_composer_sessions_status
      ON composer_sessions(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_sessions_composer_provider
      ON provider_sessions(composer_session_id, provider, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_sessions_lifecycle
      ON provider_sessions(lifecycle, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_session_events_composer_timestamp
      ON session_events(composer_session_id, timestamp ASC);
    CREATE INDEX IF NOT EXISTS idx_provider_session_files_updated
      ON provider_session_files(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_session_files_path
      ON provider_session_files(file_path);
  `);

  db.prepare(
    "INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run();
}

function transaction(db: DatabaseSync, fn: () => void) {
  db.exec("BEGIN IMMEDIATE");

  try {
    fn();
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures; the original error is more useful.
    }
    throw error;
  }
}

function parseEventData(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function lifecycleForMode(mode?: ComposerHybridMode): ComposerProviderLifecycle {
  return mode === "handoff" ? "handoff" : "active";
}

function parseSessionProvider(value: unknown): ComposerSessionProvider | undefined {
  if (value === "codex" || value === "claude" || value === "meta") {
    return value;
  }

  return undefined;
}

function parseDelegateProvider(value: unknown): ComposerDelegateProvider | undefined {
  if (value === "codex" || value === "claude") {
    return value;
  }

  return undefined;
}

function parseHybridMode(value: unknown): ComposerHybridMode | undefined {
  if (value === "planner-review" || value === "parallel-initial" || value === "handoff") {
    return value;
  }

  return undefined;
}

function parseRenderMode(value: unknown): ComposerSessionRenderMode | undefined {
  if (value === "single" || value === "hybrid") {
    return value;
  }

  return undefined;
}

function parseLifecycle(value: unknown): ComposerProviderLifecycle | undefined {
  if (
    value === "active" ||
    value === "adopted" ||
    value === "discarded" ||
    value === "handoff"
  ) {
    return value;
  }

  return undefined;
}

function parseRole(value: unknown): ComposerProviderSessionRecord["role"] | undefined {
  if (
    value === "parallel-initial" ||
    value === "planner" ||
    value === "executor" ||
    value === "handoff" ||
    value === "primary"
  ) {
    return value;
  }

  return undefined;
}

function dedupeBy<T>(values: T[], keyForValue: (value: T) => string) {
  const map = new Map<string, T>();

  for (const value of values) {
    map.set(keyForValue(value), value);
  }

  return [...map.values()];
}
