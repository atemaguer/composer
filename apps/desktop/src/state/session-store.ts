import { create } from "zustand";

import type {
  ApprovalRequest,
  LiveAgentEvent,
  Project,
  ProjectThread,
  SessionContent,
  SessionSnapshot,
  ToolDetail
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
    set(normalizedSnapshotState(snapshot)),
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
  applyAgentEvent: (event) =>
    set((state) => applyAgentEventToState(state, event)),
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
  snapshot: SessionSnapshot
): Pick<SessionStoreState, "projects" | "sessions"> {
  return {
    projects: snapshot.projects,
    sessions: normalizeSessions(snapshot.sessions)
  };
}

export function normalizeSession(session: SessionContent): SessionContent {
  return {
    ...session,
    items: session.items ?? [],
    pendingItems: session.pendingItems ?? [],
    providerSessions: session.providerSessions ?? {},
    runtimeStatus: session.runtimeStatus ?? "idle"
  };
}

export function normalizeSessions(
  sessions: Record<string, SessionContent>
): Record<string, SessionContent> {
  return Object.fromEntries(
    Object.entries(sessions).map(([id, session]) => [id, normalizeSession(session)])
  );
}

export function applyAgentEventToState(
  state: SessionStoreState,
  event: LiveAgentEvent
): Partial<SessionStoreState> {
  if (event.type === "sessions.snapshot") {
    return normalizedSnapshotState(event.snapshot);
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
      projects: upsertSessionProject(state.projects, normalized),
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
      projects: upsertSessionProject(state.projects, updated)
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
      projects: upsertSessionProject(state.projects, updated)
    };
  }

  if ("sessionId" in event && event.sessionId) {
    const session = state.sessions[event.sessionId];

    if (!session) {
      return {};
    }

    const updated = applyLiveSessionEvent(session, event);

    return {
      sessions: {
        ...state.sessions,
        [updated.id]: updated
      },
      projects: upsertSessionProject(state.projects, updated)
    };
  }

  return {};
}

function applyLiveSessionEvent(
  session: SessionContent,
  event: LiveAgentEvent
): SessionContent {
  const next: SessionContent = {
    ...session,
    items: [...(session.items ?? [])],
    pendingItems: [...(session.pendingItems ?? [])],
    providerSessions: { ...(session.providerSessions ?? {}) },
    updatedAt: new Date().toISOString()
  };

  if (event.type === "turn.started") {
    next.runtimeStatus = "running";
    next.pendingItems = [
      {
        id: `${next.id}-${event.turnId}-pending`,
        type: "running_tool",
        label: event.label ?? "Agent is working",
        status: "running"
      }
    ];
    return next;
  }

  if (event.type === "message.delta") {
    const existingIndex = next.items.findIndex(
      (item) => item.type === "assistant_message" && item.id === event.messageId
    );

    if (existingIndex >= 0) {
      const existing = next.items[existingIndex];

      if (existing.type === "assistant_message") {
        next.items[existingIndex] = {
          ...existing,
          body: `${existing.body}${event.delta}`,
          provider: event.provider ?? existing.provider,
          layoutGroupId: event.layoutGroupId ?? existing.layoutGroupId,
          layoutTitle: event.layoutTitle ?? existing.layoutTitle
        };
      }
    } else {
      next.items.push({
        id: event.messageId,
        type: "assistant_message",
        body: event.delta,
        provider: event.provider,
        layoutGroupId: event.layoutGroupId,
        layoutTitle: event.layoutTitle
      });
    }

    return next;
  }

  if (event.type === "message.completed") {
    const existingIndex = next.items.findIndex(
      (item) => item.type === "assistant_message" && item.id === event.messageId
    );

    if (existingIndex >= 0) {
      const existing = next.items[existingIndex];

      if (existing.type === "assistant_message") {
        next.items[existingIndex] = {
          ...existing,
          body: event.body ?? existing.body,
          provider: event.provider ?? existing.provider,
          layoutGroupId: event.layoutGroupId ?? existing.layoutGroupId,
          layoutTitle: event.layoutTitle ?? existing.layoutTitle
        };
      }
    } else if (event.body) {
      next.items.push({
        id: event.messageId,
        type: "assistant_message",
        body: event.body,
        provider: event.provider,
        layoutGroupId: event.layoutGroupId,
        layoutTitle: event.layoutTitle
      });
    }

    return next;
  }

  if (event.type === "tool.started") {
    if (next.items.some((item) => item.type === "tool_group" && item.id === event.toolId)) {
      return next;
    }

    next.items.push({
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
    return next;
  }

  if (event.type === "tool.delta") {
    const toolIndex = next.items.findIndex(
      (item) => item.type === "tool_group" && item.id === event.toolId
    );
    const tool = next.items[toolIndex];

    if (tool?.type !== "tool_group") {
      return next;
    }

    const output =
      tool.details.find((detail) => detail.kind === "output") ??
      toolDetail(`${event.toolId}-output`, "Output returned", "output");
    const outputIndex = tool.details.findIndex((detail) => detail.id === output.id);
    const nextOutput: ToolDetail = {
      ...output,
      output: `${output.output ?? ""}${event.delta}`,
      status: "running"
    };
    nextOutput.label = nextOutput.output?.trim().split("\n").at(-1) || "Output returned";

    const details = [...tool.details];

    if (outputIndex >= 0) {
      details[outputIndex] = nextOutput;
    } else {
      details.push(nextOutput);
    }

    next.items[toolIndex] = { ...tool, details };
    return next;
  }

  if (event.type === "tool.completed") {
    const toolIndex = next.items.findIndex(
      (item) => item.type === "tool_group" && item.id === event.toolId
    );
    const tool = next.items[toolIndex];

    if (tool?.type === "tool_group") {
      next.items[toolIndex] = {
        ...tool,
        status: event.detail?.status ?? "completed",
        details: [
          ...tool.details.map((detail) => ({
            ...detail,
            status: detail.status === "running" ? "completed" : detail.status
          })),
          ...(event.detail ? [event.detail] : [])
        ]
      };
    }

    return next;
  }

  if (event.type === "approval.requested") {
    next.runtimeStatus = "awaiting_approval";
    next.pendingItems = [
      {
        id: `${event.approval.id}-pending`,
        type: "running_tool",
        label: event.approval.title,
        status: "running"
      }
    ];
    return next;
  }

  if (event.type === "error") {
    next.runtimeStatus = "error";
    next.pendingItems = [];
    next.items.push({
      id: `${next.id}-error-${Date.now()}`,
      type: "notice",
      label: `Agent failed: ${event.message}`
    });
    return next;
  }

  if (event.type === "turn.completed") {
    next.runtimeStatus = event.status;
    next.pendingItems = [];
  }

  return next;
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

export function upsertSessionProject(
  projects: Project[],
  session: SessionContent
) {
  const project = workspaceProjectForSession(session);
  const thread: ProjectThread = {
    id: session.id,
    name: session.title,
    age: relativeAge(session.updatedAt),
    provider: session.provider,
    model: session.model,
    cwd: session.cwd
  };
  const withoutThread = projects
    .map((item) => ({
      ...item,
      threads: item.threads.filter((threadItem) => threadItem.id !== session.id)
    }))
    .filter((item) => item.threads.length > 0 || projectKey(item) === project.id);
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
      threads: project.threads.filter((thread) => thread.id !== sessionId)
    }))
    .filter((project) => project.threads.length > 0);
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
