import { create } from "zustand";
import {
  applyLiveSessionEvent,
  applyLiveSessionEvents
} from "@composer/client";

import type {
  ApprovalRequest,
  LiveAgentEvent,
  Project,
  ProjectThread,
  SessionContent,
  SessionSnapshot
} from "../types";

type StateUpdater<T> = T | ((current: T) => T);

function resolveState<T>(updater: StateUpdater<T>, current: T): T {
  return typeof updater === "function"
    ? (updater as (current: T) => T)(current)
    : updater;
}

export type SessionStoreState = {
  projects: Project[];
  sessions: Record<string, SessionContent>;
  selectedThread: string;
  approvals: ApprovalRequest[];
  pendingNewRequestId: string | null;
};

export type SessionStoreActions = {
  setProjects: (value: StateUpdater<Project[]>) => void;
  setSessions: (value: StateUpdater<Record<string, SessionContent>>) => void;
  setSnapshot: (snapshot: SessionSnapshot) => void;
  upsertSession: (session: SessionContent) => void;
  removeSession: (sessionId: string) => void;
  addApproval: (approval: ApprovalRequest) => void;
  removeApproval: (approvalId: string) => void;
  setSelectedThread: (value: string) => void;
  setPendingNewRequestId: (value: string | null) => void;
  applyAgentEvent: (event: LiveAgentEvent) => void;
};

export type SessionStore = SessionStoreState & SessionStoreActions;

type BufferableDeltaEvent = Extract<
  LiveAgentEvent,
  { type: "message.delta" | "tool.delta" }
>;

// Per-session ordered buffer of streaming delta events. Deltas are coalesced
// and flushed in a single store commit on requestAnimationFrame (~16ms) to
// avoid one full-clone set() per token.
const deltaBuffers = new Map<string, BufferableDeltaEvent[]>();
let flushScheduled = false;

function scheduleFlush(flush: () => void) {
  if (flushScheduled) {
    return;
  }

  flushScheduled = true;

  const run = () => {
    flushScheduled = false;
    flush();
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(run);
  } else {
    // Fallback when requestAnimationFrame is unavailable (~16ms ≈ one frame).
    setTimeout(run, 16);
  }
}

// Collapse a run of buffered deltas for one session into the minimal set of
// events to apply: consecutive deltas targeting the same message/tool are
// concatenated so a single flush appends the combined delta.
function coalesceDeltas(
  events: BufferableDeltaEvent[]
): BufferableDeltaEvent[] {
  const result: BufferableDeltaEvent[] = [];

  for (const event of events) {
    const last = result[result.length - 1];

    if (
      last &&
      last.type === "message.delta" &&
      event.type === "message.delta" &&
      last.messageId === event.messageId
    ) {
      result[result.length - 1] = {
        ...last,
        delta: `${last.delta}${event.delta}`,
        provider: event.provider ?? last.provider,
        layoutGroupId: event.layoutGroupId ?? last.layoutGroupId,
        layoutTitle: event.layoutTitle ?? last.layoutTitle
      };
      continue;
    }

    if (
      last &&
      last.type === "tool.delta" &&
      event.type === "tool.delta" &&
      last.toolId === event.toolId
    ) {
      result[result.length - 1] = {
        ...last,
        delta: `${last.delta}${event.delta}`,
        provider: event.provider ?? last.provider,
        layoutGroupId: event.layoutGroupId ?? last.layoutGroupId,
        layoutTitle: event.layoutTitle ?? last.layoutTitle
      };
      continue;
    }

    result.push(event);
  }

  return result;
}

// Apply all buffered deltas for a single session to the given state, returning
// the partial update (or undefined if nothing buffered / session is gone).
function applyBufferedDeltasForSession(
  state: SessionStoreState,
  sessionId: string
): Partial<SessionStoreState> | undefined {
  const buffered = deltaBuffers.get(sessionId);
  deltaBuffers.delete(sessionId);

  if (!buffered || buffered.length === 0) {
    return undefined;
  }

  const session = state.sessions[sessionId];

  if (!session) {
    return undefined;
  }

  const updated = applyLiveSessionEvents(session, coalesceDeltas(buffered));

  if (updated === session) {
    return undefined;
  }

  // Streaming-only deltas never affect the projects array (P1-2).
  return {
    sessions: {
      ...state.sessions,
      [updated.id]: updated
    }
  };
}

export const useSessionStore = create<SessionStore>((set) => ({
  projects: [],
  sessions: {},
  selectedThread: "",
  approvals: [],
  pendingNewRequestId: null,
  setProjects: (value) =>
    set((state) => ({ projects: resolveState(value, state.projects) })),
  setSessions: (value) =>
    set((state) => ({ sessions: resolveState(value, state.sessions) })),
  setSnapshot: (snapshot) =>
    set((state) => normalizedSnapshotState(snapshot, state.sessions)),
  upsertSession: (session) =>
    set((state) => {
      const normalized = normalizeSession(session);

      return {
        sessions: {
          ...state.sessions,
          [normalized.id]: normalized
        },
        projects: upsertSessionProject(state.projects, normalized)
      };
    }),
  removeSession: (sessionId) =>
    set((state) => {
      deltaBuffers.delete(sessionId);
      const sessions = { ...state.sessions };
      delete sessions[sessionId];

      return {
        sessions,
        projects: removeThreadFromProjects(state.projects, sessionId),
        approvals: state.approvals.filter(
          (approval) => approval.sessionId !== sessionId
        ),
        selectedThread:
          state.selectedThread === sessionId ? "" : state.selectedThread,
        pendingNewRequestId:
          state.selectedThread === sessionId ? null : state.pendingNewRequestId
      };
    }),
  addApproval: (approval) =>
    set((state) => upsertApprovalState(state.approvals, approval)),
  removeApproval: (approvalId) =>
    set((state) => ({
      approvals: state.approvals.filter((approval) => approval.id !== approvalId)
    })),
  applyAgentEvent: (event) => {
    // Buffer streaming-only deltas and flush them coalesced on the next frame.
    if (
      (event.type === "message.delta" || event.type === "tool.delta") &&
      event.sessionId
    ) {
      const sessionId = event.sessionId;
      const buffered = deltaBuffers.get(sessionId);

      if (buffered) {
        buffered.push(event);
      } else {
        deltaBuffers.set(sessionId, [event]);
      }

      scheduleFlush(() => {
        const sessionIds = Array.from(deltaBuffers.keys());

        if (sessionIds.length === 0) {
          return;
        }

        set((state) => {
          let sessions = state.sessions;

          for (const id of sessionIds) {
            const partial = applyBufferedDeltasForSession(
              { ...state, sessions },
              id
            );

            if (partial?.sessions) {
              sessions = partial.sessions;
            }
          }

          return sessions === state.sessions ? {} : { sessions };
        });
      });

      return;
    }

    // For any non-delta event targeting a specific session, flush that
    // session's pending deltas first so ordering is preserved, then apply.
    const targetSessionId =
      "sessionId" in event && event.sessionId
        ? event.sessionId
        : event.type === "approval.requested"
          ? event.approval.sessionId
          : event.type === "session.started" || event.type === "session.updated"
            ? // These full-rebuild events identify their session via event.session
              // (not event.sessionId) and REPLACE the stored session wholesale, so
              // their buffered deltas must be flushed first or the deferred rAF
              // flush would replay stale tokens onto the rebuilt session.
              event.session.id
            : undefined;

    // A removed session should discard any pending buffered deltas rather than
    // flush them onto a session that is about to be deleted.
    if (event.type === "session.removed") {
      deltaBuffers.delete(event.sessionId);
    }

    set((state) => {
      let working = state;

      if (event.type === "sessions.snapshot") {
        // A snapshot replaces the entire sessions map, so flush EVERY buffered
        // session first (targetSessionId is single-valued and can't cover this).
        // applyBufferedDeltasForSession deletes each buffer entry, so the
        // deferred rAF flush finds nothing to replay onto the new map.
        let sessions = working.sessions;

        for (const id of Array.from(deltaBuffers.keys())) {
          const flushed = applyBufferedDeltasForSession(
            { ...working, sessions },
            id
          );

          if (flushed?.sessions) {
            sessions = flushed.sessions;
          }
        }

        working = sessions === working.sessions ? working : { ...working, sessions };
      } else if (
        targetSessionId &&
        event.type !== "session.removed" &&
        deltaBuffers.has(targetSessionId)
      ) {
        const flushed = applyBufferedDeltasForSession(state, targetSessionId);

        if (flushed?.sessions) {
          working = { ...state, sessions: flushed.sessions };
        }
      }

      const result = applyAgentEventToState(working, event);

      if (working === state) {
        return result;
      }

      // Carry the flushed sessions through if the reducer didn't replace them.
      return result.sessions
        ? result
        : { ...result, sessions: working.sessions };
    });
  },
  setSelectedThread: (selectedThread) => set({ selectedThread }),
  setPendingNewRequestId: (pendingNewRequestId) =>
    set({ pendingNewRequestId })
}));

export const sessionStoreSelectors = {
  snapshot: (state: SessionStoreState): SessionSnapshot => ({
    projects: state.projects,
    sessions: state.sessions
  }),
  activeSession: (state: SessionStoreState) =>
    state.selectedThread ? state.sessions[state.selectedThread] : undefined,
  selectedSession: (state: SessionStoreState) =>
    state.selectedThread ? state.sessions[state.selectedThread] : undefined,
  approvalsForSession: (sessionId: string) => (state: SessionStoreState) =>
    state.approvals.filter((approval) => approval.sessionId === sessionId),
  activeApprovals: (state: SessionStoreState) => {
    const activeSession = sessionStoreSelectors.activeSession(state);

    return activeSession
      ? state.approvals.filter(
          (approval) => approval.sessionId === activeSession.id
        )
      : state.approvals;
  },
  isSessionRunning: (sessionId: string) => (state: SessionStoreState) => {
    const session = state.sessions[sessionId];

    return session ? isSessionRunning(session) : false;
  }
};

export function isSessionRunning(session: SessionContent) {
  return Boolean(
    session.pendingItems.length ||
      session.runtimeStatus === "running" ||
      session.runtimeStatus === "awaiting_approval"
  );
}

export function normalizedSnapshotState(
  snapshot: SessionSnapshot,
  existingSessions: Record<string, SessionContent> = {}
): Pick<SessionStoreState, "projects" | "sessions"> {
  return {
    projects: snapshot.projects,
    sessions: normalizeSessions(snapshot.sessions, existingSessions)
  };
}

export function normalizeSession(session: SessionContent): SessionContent {
  return {
    ...session,
    items: session.items ?? [],
    pendingItems: session.pendingItems ?? [],
    providerSessions: session.providerSessions ?? {},
    runtimeStatus: session.runtimeStatus ?? "idle",
    contentLoaded: session.contentLoaded ?? true
  };
}

// Identity-relevant fields whose change should produce a new session object.
// Arrays/records (items, pendingItems, providerSessions) are compared by
// reference since normalizeSession reuses the incoming references when it can.
function sessionsEquivalent(a: SessionContent, b: SessionContent): boolean {
  return (
    a.id === b.id &&
    a.provider === b.provider &&
    a.providerSessionId === b.providerSessionId &&
    a.title === b.title &&
    a.updatedAt === b.updatedAt &&
    a.cwd === b.cwd &&
    a.displayCwd === b.displayCwd &&
    a.worktreePath === b.worktreePath &&
    a.worktreeBranch === b.worktreeBranch &&
    a.model === b.model &&
    a.lastProvider === b.lastProvider &&
    a.contextVersion === b.contextVersion &&
    a.parentSessionId === b.parentSessionId &&
    a.subagent === b.subagent &&
    a.renderMode === b.renderMode &&
    a.parallelAdoptedProvider === b.parallelAdoptedProvider &&
    a.runtimeStatus === b.runtimeStatus &&
    a.contentLoaded === b.contentLoaded &&
    a.items === b.items &&
    a.pendingItems === b.pendingItems &&
    a.providerSessions === b.providerSessions &&
    a.handoffSummaries === b.handoffSummaries &&
    a.compactionSummaries === b.compactionSummaries
  );
}

export function normalizeSessions(
  sessions: Record<string, SessionContent>,
  existingSessions: Record<string, SessionContent> = {}
): Record<string, SessionContent> {
  const result: Record<string, SessionContent> = {};
  let changed = false;

  for (const [id, session] of Object.entries(sessions)) {
    let normalized = normalizeSession(session);
    const existing = existingSessions[id];

    if (!normalized.contentLoaded && existing?.contentLoaded) {
      const incomingRunning = isSessionRunning(normalized);

      normalized = normalizeSession({
        ...normalized,
        items: existing.items,
        pendingItems: incomingRunning
          ? normalized.pendingItems.length
            ? normalized.pendingItems
            : existing.pendingItems
          : [],
        runtimeStatus: incomingRunning ? normalized.runtimeStatus : "idle",
        providerSessions: {
          ...normalized.providerSessions,
          ...existing.providerSessions
        },
        contentLoaded: true
      });
    }

    // Reuse the existing object when nothing identity-relevant changed so
    // consumers keep referential equality and skip re-renders.
    if (existing && sessionsEquivalent(existing, normalized)) {
      result[id] = existing;
    } else {
      result[id] = normalized;
      changed = true;
    }
  }

  // If no entry changed and the key set is identical, return the existing
  // record unchanged to preserve referential equality.
  if (
    !changed &&
    Object.keys(existingSessions).length === Object.keys(result).length
  ) {
    return existingSessions;
  }

  return result;
}

export function applyAgentEventToState(
  state: SessionStoreState,
  event: LiveAgentEvent
): Partial<SessionStoreState> {
  if (event.type === "sessions.snapshot") {
    return normalizedSnapshotState(event.snapshot, state.sessions);
  }

  if (event.type === "session.started" || event.type === "session.updated") {
    const normalized = normalizeSession(event.session);
    const newSessionSelection =
      event.type === "session.started" && state.pendingNewRequestId
        ? {
            pendingNewRequestId: null,
            selectedThread: normalized.id
          }
        : {};

    return {
      sessions: {
        ...state.sessions,
        [normalized.id]: normalized
      },
      projects: upsertSessionProjectIfChanged(state.projects, normalized),
      ...newSessionSelection
    };
  }

  if (event.type === "approval.requested") {
    const approvalState = upsertApprovalState(state.approvals, event.approval);
    const session = state.sessions[event.approval.sessionId];

    if (!session) {
      return approvalState;
    }

    const updated = applyLiveSessionEvent(session, event);

    return {
      ...approvalState,
      sessions: {
        ...state.sessions,
        [updated.id]: updated
      },
      projects: upsertSessionProjectIfChanged(state.projects, updated)
    };
  }

  if (event.type === "approval.resolved") {
    return {
      approvals: state.approvals.filter(
        (approval) => approval.id !== event.approvalId
      )
    };
  }

  if (
    event.type === "turn.completed" &&
    state.selectedThread === event.sessionId
  ) {
    const session = state.sessions[event.sessionId];

    if (!session) {
      return { pendingNewRequestId: null };
    }

    const updated = applyLiveSessionEvent(session, event);

    return {
      pendingNewRequestId: null,
      sessions: {
        ...state.sessions,
        [updated.id]: updated
      },
      projects: upsertSessionProjectIfChanged(state.projects, updated)
    };
  }

  if (event.type === "session.patch") {
    const session = state.sessions[event.sessionId];

    if (!session) {
      return {};
    }

    const updated = applySessionPatch(session, event);

    if (updated === session) {
      return {};
    }

    return {
      sessions: {
        ...state.sessions,
        [updated.id]: updated
      },
      // Only rebuild projects when project-relevant metadata changed.
      projects: upsertSessionProjectIfChanged(state.projects, updated)
    };
  }

  if (event.type === "session.removed") {
    const sessions = { ...state.sessions };

    if (!(event.sessionId in sessions)) {
      return {};
    }

    delete sessions[event.sessionId];

    return {
      sessions,
      projects: removeThreadFromProjects(state.projects, event.sessionId),
      approvals: state.approvals.filter(
        (approval) => approval.sessionId !== event.sessionId
      ),
      selectedThread:
        state.selectedThread === event.sessionId ? "" : state.selectedThread,
      pendingNewRequestId:
        state.selectedThread === event.sessionId
          ? null
          : state.pendingNewRequestId
    };
  }

  if ("sessionId" in event && event.sessionId) {
    const session = state.sessions[event.sessionId];

    if (!session) {
      return {};
    }

    const updated = applyLiveSessionEvent(session, event);

    // Streaming-only events (turn.started, tool.started/delta/completed,
    // message.delta, error) never affect project metadata, so leave
    // state.projects untouched to avoid sidebar/thread-tab re-renders.
    return {
      sessions: {
        ...state.sessions,
        [updated.id]: updated
      }
    };
  }

  return {};
}

// Apply a lightweight session.patch: only the provided changed scalar fields,
// merged providerSessions, and appended timeline items (replace-by-id, else
// push). Returns the original session reference when nothing changed.
function applySessionPatch(
  session: SessionContent,
  event: Extract<LiveAgentEvent, { type: "session.patch" }>
): SessionContent {
  const next: SessionContent = { ...session };
  let changed = false;

  const assign = <K extends keyof SessionContent>(
    key: K,
    value: SessionContent[K] | undefined
  ) => {
    if (value !== undefined && value !== session[key]) {
      next[key] = value;
      changed = true;
    }
  };

  assign("runtimeStatus", event.runtimeStatus);
  assign("updatedAt", event.updatedAt);
  assign("title", event.title);
  assign("cwd", event.cwd);
  assign("displayCwd", event.displayCwd);
  assign("worktreePath", event.worktreePath);
  assign("worktreeBranch", event.worktreeBranch);
  assign("model", event.model);
  assign("lastProvider", event.lastProvider);
  assign("contextVersion", event.contextVersion);

  if (event.providerSessions) {
    next.providerSessions = {
      ...(session.providerSessions ?? {}),
      ...event.providerSessions
    };
    changed = true;
  }

  if (event.appendedItems?.length) {
    const items = [...session.items];

    for (const item of event.appendedItems) {
      const index = items.findIndex((existing) => existing.id === item.id);

      if (index >= 0) {
        items[index] = item;
      } else {
        items.push(item);
      }
    }

    next.items = items;
    changed = true;
  }

  return changed ? next : session;
}

function upsertApprovalState(
  approvals: ApprovalRequest[],
  approval: ApprovalRequest
): Pick<SessionStoreState, "approvals"> {
  const existingIndex = approvals.findIndex((item) => item.id === approval.id);

  if (existingIndex === -1) {
    return { approvals: [...approvals, approval] };
  }

  return {
    approvals: approvals.map((item, index) =>
      index === existingIndex ? approval : item
    )
  };
}

// Rebuild the projects array only when the session's project-relevant thread
// metadata actually changed. We compare the displayed age BUCKET (not the raw
// timestamp) so the steady-state short-circuit still holds within a bucket but
// a rebuild fires exactly when the sidebar's age label would change — otherwise
// the label goes stale on updatedAt-only events. Returns the original projects
// reference unchanged when nothing the sidebar cares about changed.
export function upsertSessionProjectIfChanged(
  projects: Project[],
  session: SessionContent
): Project[] {
  const existingThread = findThread(projects, session.id);

  if (existingThread) {
    const sameProject =
      projectKey(threadProject(projects, session.id)) ===
      workspaceProjectForSession(session).id;

    if (
      sameProject &&
      existingThread.name === session.title &&
      existingThread.provider === session.provider &&
      existingThread.model === session.model &&
      existingThread.cwd === session.cwd &&
      existingThread.parentSessionId === session.parentSessionId &&
      existingThread.subagent === session.subagent &&
      existingThread.age === relativeAge(session.updatedAt)
    ) {
      return projects;
    }
  }

  return upsertSessionProject(projects, session);
}

// Find which project currently contains the given session's thread.
function threadProject(projects: Project[], sessionId: string): Project {
  for (const project of projects) {
    if (findThreadInTree(project.threads, sessionId)) {
      return project;
    }
  }

  // Should not happen when called after findThread succeeds; fall back to a
  // sentinel that won't match any workspace id.
  return { id: "__no_project__", name: "", cwd: "", threads: [] };
}

export function upsertSessionProject(
  projects: Project[],
  session: SessionContent
) {
  const project = workspaceProjectForSession(session);
  const existingThread = findThread(projects, session.id);
  const thread: ProjectThread = {
    id: session.id,
    name: session.title,
    age: relativeAge(session.updatedAt),
    provider: session.provider,
    model: session.model,
    cwd: session.cwd,
    parentSessionId: session.parentSessionId,
    subagent: session.subagent,
    children: existingThread?.children ?? []
  };
  const withoutThread = projects
    .map((item) => ({
      ...item,
      threads: removeThreadFromTree(item.threads, session.id)
    }))
    .filter((item) => item.threads.length > 0 || projectKey(item) === project.id);

  if (session.parentSessionId) {
    const parentSessionId = session.parentSessionId;
    let inserted = false;
    const withNestedThread = withoutThread.map((item) => {
      const threads = insertChildThread(
        item.threads,
        parentSessionId,
        thread
      );
      inserted ||= threads !== item.threads;
      return threads === item.threads ? item : { ...item, threads };
    });

    if (inserted) {
      return withNestedThread;
    }
  }

  const existing = withoutThread.find((item) => projectKey(item) === project.id);

  if (existing) {
    return withoutThread.map((item) =>
      projectKey(item) === project.id
        ? {
            ...item,
            id: project.id,
            name: project.name,
            cwd: project.cwd,
            threads: [thread, ...item.threads]
          }
        : item
    );
  }

  return [
    {
      id: project.id,
      name: project.name,
      cwd: project.cwd,
      threads: [thread]
    },
    ...withoutThread
  ];
}

export function removeThreadFromProjects(projects: Project[], sessionId: string) {
  return projects
    .map((project) => ({
      ...project,
      threads: removeThreadFromTree(project.threads, sessionId)
    }))
    .filter((project) => project.threads.length > 0);
}

function removeThreadFromTree(threads: ProjectThread[], sessionId: string) {
  let changed = false;
  const next: ProjectThread[] = [];

  for (const thread of threads) {
    if (thread.id === sessionId) {
      changed = true;
      continue;
    }

    const existingChildren = thread.children ?? [];
    const children = removeThreadFromTree(existingChildren, sessionId);

    if (children !== existingChildren) {
      changed = true;
      next.push({ ...thread, children });
    } else {
      next.push(thread);
    }
  }

  return changed ? next : threads;
}

function insertChildThread(
  threads: ProjectThread[],
  parentSessionId: string,
  child: ProjectThread
): ProjectThread[] {
  let changed = false;
  const next = threads.map((thread) => {
    if (thread.id === parentSessionId) {
      changed = true;
      return {
        ...thread,
        children: [child, ...(thread.children ?? [])]
      };
    }

    const existingChildren = thread.children ?? [];
    const children = insertChildThread(existingChildren, parentSessionId, child);

    if (children !== existingChildren) {
      changed = true;
      return { ...thread, children };
    }

    return thread;
  });

  return changed ? next : threads;
}

function findThread(projects: Project[], sessionId: string) {
  for (const project of projects) {
    const thread = findThreadInTree(project.threads, sessionId);

    if (thread) {
      return thread;
    }
  }

  return undefined;
}

function findThreadInTree(
  threads: ProjectThread[],
  sessionId: string
): ProjectThread | undefined {
  for (const thread of threads) {
    if (thread.id === sessionId) {
      return thread;
    }

    const child = findThreadInTree(thread.children ?? [], sessionId);

    if (child) {
      return child;
    }
  }

  return undefined;
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

function basename(filePath: string) {
  return filePath.replace(/\/+$/, "").split("/").pop() || filePath;
}

export function workspaceProjectForSession(
  session: Pick<SessionContent, "cwd" | "displayCwd" | "renderMode" | "parallelAdoptedProvider">
) {
  const cwd = workspaceCwdForSession(session).replace(/\/+$/, "");

  return {
    id: cwd ?? "unknown-workspace",
    name: cwd ? basename(cwd) : "Unknown workspace",
    cwd
  };
}

function workspaceCwdForSession(
  session: Pick<SessionContent, "cwd" | "displayCwd" | "renderMode" | "parallelAdoptedProvider">
) {
  return displayWorkspaceCwd(session.displayCwd ?? session.cwd) ?? "";
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

function projectKey(project: Project) {
  return project.id ?? project.cwd ?? project.name;
}
