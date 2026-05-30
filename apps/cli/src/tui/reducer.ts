import {
  defaultIntelligenceByProvider,
  defaultModelsByProvider
} from "@composer/client";
import type {
  ApprovalRequest,
  LiveAgentEvent,
  Project,
  SessionContent,
  ToolDetail
} from "@composer/client";

import type { OverlayMode, RootReducer, TuiInit, TuiState } from "./types.js";

// ---------------------------------------------------------------------------
// Local helpers (ported from the desktop session-store)
// ---------------------------------------------------------------------------

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fill in the optional collection fields the wire format may omit so the rest
 * of the reducer can treat them as always-present. Mirrors the desktop helper.
 */
function normalizeSession(session: SessionContent): SessionContent {
  return {
    ...session,
    items: session.items ?? [],
    pendingItems: session.pendingItems ?? [],
    providerSessions: session.providerSessions ?? {},
    runtimeStatus: session.runtimeStatus ?? "idle",
    contentLoaded: session.contentLoaded ?? true
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

/**
 * Pure `(SessionContent, LiveAgentEvent) => SessionContent`. Ported verbatim
 * from the desktop store's `applyLiveSessionEvent`. Always returns a new object.
 */
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
    if (
      next.items.some(
        (item) => item.type === "tool_group" && item.id === event.toolId
      )
    ) {
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
    const outputIndex = tool.details.findIndex(
      (detail) => detail.id === output.id
    );
    const nextOutput: ToolDetail = {
      ...output,
      output: `${output.output ?? ""}${event.delta}`,
      status: "running"
    };
    nextOutput.label =
      nextOutput.output?.trim().split("\n").at(-1) || "Output returned";

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
            status:
              detail.status === "running" ? "completed" : detail.status
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

// ---------------------------------------------------------------------------
// State-level helpers
// ---------------------------------------------------------------------------

function mergeSnapshotSessions(
  existing: Record<string, SessionContent>,
  incoming: Record<string, SessionContent>
): Record<string, SessionContent> {
  const merged: Record<string, SessionContent> = { ...existing };

  for (const [id, session] of Object.entries(incoming)) {
    merged[id] = normalizeSession(session);
  }

  return merged;
}

function upsertApproval(
  approvals: ApprovalRequest[],
  approval: ApprovalRequest
): ApprovalRequest[] {
  const existingIndex = approvals.findIndex((item) => item.id === approval.id);

  if (existingIndex === -1) {
    return [...approvals, approval];
  }

  return approvals.map((item, index) =>
    index === existingIndex ? approval : item
  );
}

/** Put a session into the map, returning a new map. */
function putSession(
  sessions: Record<string, SessionContent>,
  session: SessionContent
): Record<string, SessionContent> {
  return { ...sessions, [session.id]: session };
}

/**
 * Apply a live event to its target session (if present), returning the new
 * sessions map. Returns the same reference when the target session is unknown.
 */
function applyEventToSession(
  sessions: Record<string, SessionContent>,
  sessionId: string | null | undefined,
  event: LiveAgentEvent
): Record<string, SessionContent> {
  if (!sessionId) {
    return sessions;
  }

  const session = sessions[sessionId];

  if (!session) {
    return sessions;
  }

  return putSession(sessions, applyLiveSessionEvent(session, event));
}

function titleFromBody(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");

  if (trimmed.length <= 40) {
    return trimmed || "New conversation";
  }

  return `${trimmed.slice(0, 40)}…`;
}

// ---------------------------------------------------------------------------
// initialState
// ---------------------------------------------------------------------------

export function initialState(init: TuiInit): TuiState {
  return {
    cwd: init.cwd,
    sessions: {},
    projects: [],
    selectedThread: null,
    pendingNewRequestId: null,
    approvals: [],
    provider: init.provider ?? "codex",
    modelByProvider: { ...defaultModelsByProvider },
    intelligenceByProvider: { ...defaultIntelligenceByProvider },
    permission: "Default permissions",
    overlay: { kind: "none" },
    input: "",
    busy: false,
    error: null
  };
}

// ---------------------------------------------------------------------------
// rootReducer
// ---------------------------------------------------------------------------

function reduceEvent(state: TuiState, event: LiveAgentEvent): TuiState {
  switch (event.type) {
    case "sessions.snapshot":
      return {
        ...state,
        projects: event.snapshot.projects,
        sessions: mergeSnapshotSessions(
          state.sessions,
          event.snapshot.sessions
        )
      };

    case "session.started": {
      const normalized = normalizeSession(event.session);
      const synthetic =
        state.pendingNewRequestId !== null
          ? state.sessions[state.pendingNewRequestId]
          : undefined;

      // Reconcile an optimistic new conversation: migrate the user's pending
      // user_message(s) to the front of the real session, drop the synthetic.
      if (synthetic && state.pendingNewRequestId) {
        const sessions = { ...state.sessions };
        delete sessions[state.pendingNewRequestId];
        sessions[normalized.id] = {
          ...normalized,
          items: [...synthetic.items, ...normalized.items]
        };

        return {
          ...state,
          sessions,
          selectedThread: normalized.id,
          pendingNewRequestId: null
        };
      }

      return {
        ...state,
        sessions: putSession(state.sessions, normalized),
        selectedThread: state.selectedThread ?? normalized.id
      };
    }

    case "session.updated":
      return {
        ...state,
        sessions: putSession(state.sessions, normalizeSession(event.session))
      };

    case "approval.requested": {
      const approvals = upsertApproval(state.approvals, event.approval);
      const sessions = applyEventToSession(
        state.sessions,
        event.approval.sessionId,
        event
      );

      return {
        ...state,
        approvals,
        sessions,
        overlay: { kind: "approval", approval: event.approval }
      };
    }

    case "approval.resolved": {
      const approvals = state.approvals.filter(
        (approval) => approval.id !== event.approvalId
      );
      const overlay: OverlayMode =
        state.overlay.kind === "approval" &&
        state.overlay.approval.id === event.approvalId
          ? { kind: "none" }
          : state.overlay;
      // The wire event carries no sessionId; resolve via the dropped approval.
      const resolved = state.approvals.find(
        (approval) => approval.id === event.approvalId
      );
      const sessions = applyEventToSession(
        state.sessions,
        resolved?.sessionId,
        event
      );

      return { ...state, approvals, overlay, sessions };
    }

    case "error": {
      const sessions = applyEventToSession(
        state.sessions,
        event.sessionId ?? state.selectedThread,
        event
      );

      return { ...state, sessions, busy: false, error: event.message };
    }

    case "turn.completed": {
      const sessions = applyEventToSession(
        state.sessions,
        event.sessionId ?? state.selectedThread,
        event
      );

      return { ...state, sessions, busy: false };
    }

    case "session.patch": {
      const session = state.sessions[event.sessionId];

      if (!session) {
        return state;
      }

      const patched: SessionContent = { ...session };

      if (event.runtimeStatus !== undefined) {
        patched.runtimeStatus = event.runtimeStatus;
      }
      if (event.updatedAt !== undefined) {
        patched.updatedAt = event.updatedAt;
      }
      if (event.title !== undefined) {
        patched.title = event.title;
      }
      if (event.cwd !== undefined) {
        patched.cwd = event.cwd;
      }
      if (event.displayCwd !== undefined) {
        patched.displayCwd = event.displayCwd;
      }
      if (event.worktreePath !== undefined) {
        patched.worktreePath = event.worktreePath;
      }
      if (event.worktreeBranch !== undefined) {
        patched.worktreeBranch = event.worktreeBranch;
      }
      if (event.model !== undefined) {
        patched.model = event.model;
      }
      if (event.lastProvider !== undefined) {
        patched.lastProvider = event.lastProvider;
      }
      if (event.contextVersion !== undefined) {
        patched.contextVersion = event.contextVersion;
      }
      if (event.providerSessions) {
        patched.providerSessions = {
          ...(session.providerSessions ?? {}),
          ...event.providerSessions
        };
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

        patched.items = items;
      }

      return { ...state, sessions: putSession(state.sessions, patched) };
    }

    case "session.removed": {
      if (!state.sessions[event.sessionId]) {
        return state;
      }

      const sessions = { ...state.sessions };
      delete sessions[event.sessionId];

      return {
        ...state,
        sessions,
        approvals: state.approvals.filter(
          (approval) => approval.sessionId !== event.sessionId
        ),
        selectedThread:
          state.selectedThread === event.sessionId
            ? null
            : state.selectedThread,
        pendingNewRequestId:
          state.pendingNewRequestId === event.sessionId
            ? null
            : state.pendingNewRequestId
      };
    }

    default: {
      // turn.started, message.*, tool.* — all carry a sessionId.
      const sessions = applyEventToSession(
        state.sessions,
        event.sessionId ?? state.selectedThread,
        event
      );

      if (sessions === state.sessions) {
        return state;
      }

      return { ...state, sessions };
    }
  }
}

export const rootReducer: RootReducer = (state, action) => {
  switch (action.type) {
    case "event":
      return reduceEvent(state, action.event);

    case "snapshot":
      return {
        ...state,
        projects: action.projects,
        sessions: mergeSnapshotSessions(state.sessions, action.sessions)
      };

    case "upsertSession": {
      const normalized = normalizeSession(action.session);

      return {
        ...state,
        sessions: putSession(state.sessions, normalized),
        selectedThread: state.selectedThread ?? normalized.id
      };
    }

    case "selectThread":
      return {
        ...state,
        selectedThread: action.sessionId,
        overlay: { kind: "none" }
      };

    case "removeApproval": {
      const approvals = state.approvals.filter(
        (approval) => approval.id !== action.approvalId
      );
      const overlay: OverlayMode =
        state.overlay.kind === "approval" &&
        state.overlay.approval.id === action.approvalId
          ? { kind: "none" }
          : state.overlay;

      return { ...state, approvals, overlay };
    }

    case "setProvider": {
      const provider = action.provider;

      return {
        ...state,
        provider,
        modelByProvider: {
          ...state.modelByProvider,
          [provider]:
            state.modelByProvider[provider] ??
            defaultModelsByProvider[provider]
        },
        intelligenceByProvider: {
          ...state.intelligenceByProvider,
          [provider]:
            state.intelligenceByProvider[provider] ??
            defaultIntelligenceByProvider[provider]
        },
        overlay: { kind: "none" }
      };
    }

    case "setModel":
      return {
        ...state,
        modelByProvider: {
          ...state.modelByProvider,
          [state.provider]: action.model
        },
        overlay: { kind: "none" }
      };

    case "setIntelligence":
      return {
        ...state,
        intelligenceByProvider: {
          ...state.intelligenceByProvider,
          [state.provider]: action.intelligence
        },
        overlay: { kind: "none" }
      };

    case "setPermission":
      return {
        ...state,
        permission: action.permission,
        overlay: { kind: "none" }
      };

    case "setOverlay":
      return { ...state, overlay: action.overlay };

    case "setInput":
      return { ...state, input: action.value };

    case "setBusy":
      return { ...state, busy: action.busy };

    case "setError":
      return { ...state, error: action.error };

    case "userMessage": {
      const userItem = {
        id: createId("user"),
        type: "user_message" as const,
        body: action.body
      };

      if (action.isNew) {
        const synthetic = normalizeSession({
          id: action.sessionId,
          title: titleFromBody(action.body),
          provider: state.provider,
          cwd: state.cwd,
          runtimeStatus: "running",
          items: [userItem],
          pendingItems: []
        });

        return {
          ...state,
          sessions: putSession(state.sessions, synthetic),
          selectedThread: action.sessionId,
          pendingNewRequestId: action.sessionId,
          busy: true
        };
      }

      const existing = state.sessions[action.sessionId];

      if (!existing) {
        return { ...state, busy: true };
      }

      const updated: SessionContent = {
        ...existing,
        items: [...existing.items, userItem],
        runtimeStatus: "running"
      };

      return {
        ...state,
        sessions: putSession(state.sessions, updated),
        busy: true
      };
    }

    default:
      return state;
  }
};
