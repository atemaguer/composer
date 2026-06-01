import {
  applyLiveSessionEvent,
  defaultIntelligenceByProvider,
  defaultModelsByProvider
} from "@composer/client";
import type {
  ApprovalRequest,
  LiveAgentEvent,
  Project,
  SessionContent
} from "@composer/client";

import type { Dialog, RootReducer, TuiInit, TuiState } from "./types.js";

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

// ---------------------------------------------------------------------------
// State-level helpers
// ---------------------------------------------------------------------------

function mergeSnapshotSessions(
  existing: Record<string, SessionContent>,
  incoming: Record<string, SessionContent>
): Record<string, SessionContent> {
  const merged: Record<string, SessionContent> = { ...existing };

  for (const [id, session] of Object.entries(incoming)) {
    const prev = merged[id];

    // A snapshot is metadata-only. Never clobber a session whose full content
    // we've already loaded — just refresh its lightweight metadata. For unseen
    // sessions, mark them not-content-loaded so resuming fetches the real
    // transcript (and the session's provider) instead of showing an empty pane.
    if (prev?.contentLoaded) {
      merged[id] = {
        ...prev,
        title: session.title ?? prev.title,
        updatedAt: session.updatedAt ?? prev.updatedAt,
        provider: session.provider ?? prev.provider,
        lastProvider: session.lastProvider ?? prev.lastProvider,
        model: session.model ?? prev.model,
        runtimeStatus: session.runtimeStatus ?? prev.runtimeStatus
      };
    } else {
      merged[id] = { ...normalizeSession(session), contentLoaded: false };
    }
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
    sessionsLoading: false,
    selectedThread: null,
    route: "home",
    pendingNewRequestId: null,
    approvals: [],
    provider: init.provider ?? "codex",
    modelByProvider: { ...defaultModelsByProvider },
    intelligenceByProvider: { ...defaultIntelligenceByProvider },
    permission: "Default permissions",
    dialogs: [],
    autocomplete: { open: false, trigger: "/", index: 0 },
    input: "",
    busy: false,
    error: null,
    notice: null
  };
}

/** Pop the top dialog only when it matches the given approval id. */
function popApprovalDialog(dialogs: Dialog[], approvalId: string): Dialog[] {
  const top = dialogs[dialogs.length - 1];
  if (top?.kind === "approval" && top.approval.id === approvalId) {
    return dialogs.slice(0, -1);
  }
  return dialogs;
}

// ---------------------------------------------------------------------------
// rootReducer
// ---------------------------------------------------------------------------

function reduceEvent(state: TuiState, event: LiveAgentEvent): TuiState {
  switch (event.type) {
    case "sessions.snapshot":
      return {
        ...state,
        sessionsLoading: false,
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
          pendingNewRequestId: null,
          route: "session"
        };
      }

      return {
        ...state,
        sessions: putSession(state.sessions, normalized),
        selectedThread: state.selectedThread ?? normalized.id,
        route: "session"
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
      // Surface the prompt on top of everything else. Avoid stacking a second
      // entry if this same approval is already the focused dialog.
      const top = state.dialogs[state.dialogs.length - 1];
      const alreadyTop =
        top?.kind === "approval" && top.approval.id === event.approval.id;
      const dialogs = alreadyTop
        ? state.dialogs
        : [...state.dialogs, { kind: "approval" as const, approval: event.approval }];

      return { ...state, approvals, sessions, dialogs };
    }

    case "approval.resolved": {
      const approvals = state.approvals.filter(
        (approval) => approval.id !== event.approvalId
      );
      const dialogs = popApprovalDialog(state.dialogs, event.approvalId);
      // The wire event carries no sessionId; resolve via the dropped approval.
      const resolved = state.approvals.find(
        (approval) => approval.id === event.approvalId
      );
      const sessions = applyEventToSession(
        state.sessions,
        resolved?.sessionId,
        event
      );

      return { ...state, approvals, dialogs, sessions };
    }

    case "error": {
      const sessions = applyEventToSession(
        state.sessions,
        event.sessionId ?? state.selectedThread,
        event
      );

      // A Compose session that needs a parallel thread adopted before it can
      // continue — surface the adopt picker instead of leaving the user stuck.
      const needsAdoption =
        typeof event.message === "string" &&
        /adopt/i.test(event.message) &&
        Boolean(state.selectedThread);
      const top = state.dialogs[state.dialogs.length - 1];
      const dialogs =
        needsAdoption && top?.kind !== "adopt"
          ? [...state.dialogs, { kind: "adopt" as const }]
          : state.dialogs;

      return {
        ...state,
        sessions,
        dialogs,
        busy: false,
        error: event.message
      };
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

      const wasActive = state.selectedThread === event.sessionId;

      return {
        ...state,
        sessions,
        approvals: state.approvals.filter(
          (approval) => approval.sessionId !== event.sessionId
        ),
        selectedThread: wasActive ? null : state.selectedThread,
        route: wasActive ? "home" : state.route,
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
        sessionsLoading: false,
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

    case "selectThread": {
      // Sync the composer's provider/model to the resumed session so the status
      // bar is accurate and provider-scoped commands (e.g. /adopt for Compose
      // sessions) are available.
      const session = action.sessionId
        ? state.sessions[action.sessionId]
        : null;
      // Prefer the session's own provider so a Compose (meta) session shows
      // "Compose" and an adopted session shows the adopted provider.
      const provider =
        session?.provider ?? session?.lastProvider ?? state.provider;
      const modelByProvider = session?.model
        ? { ...state.modelByProvider, [provider]: session.model }
        : state.modelByProvider;

      return {
        ...state,
        selectedThread: action.sessionId,
        provider,
        modelByProvider,
        route: action.sessionId ? "session" : "home",
        dialogs: []
      };
    }

    case "newSession":
      // Drop the active thread so the next prompt starts a fresh conversation,
      // return to the home screen, and clear any open pickers / draft.
      return {
        ...state,
        selectedThread: null,
        route: "home",
        dialogs: [],
        input: "",
        autocomplete: { ...state.autocomplete, open: false, index: 0 },
        error: null
      };

    case "removeApproval": {
      const approvals = state.approvals.filter(
        (approval) => approval.id !== action.approvalId
      );
      const dialogs = popApprovalDialog(state.dialogs, action.approvalId);

      return { ...state, approvals, dialogs };
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
        dialogs: state.dialogs.slice(0, -1)
      };
    }

    case "setModel":
      return {
        ...state,
        modelByProvider: {
          ...state.modelByProvider,
          [state.provider]: action.model
        },
        dialogs: state.dialogs.slice(0, -1)
      };

    case "setIntelligence":
      return {
        ...state,
        intelligenceByProvider: {
          ...state.intelligenceByProvider,
          [state.provider]: action.intelligence
        },
        dialogs: state.dialogs.slice(0, -1)
      };

    case "setPermission":
      return {
        ...state,
        permission: action.permission,
        dialogs: state.dialogs.slice(0, -1)
      };

    case "pushDialog":
      return { ...state, dialogs: [...state.dialogs, action.dialog] };

    case "popDialog":
      return { ...state, dialogs: state.dialogs.slice(0, -1) };

    case "clearDialogs":
      return { ...state, dialogs: [] };

    case "openAutocomplete":
      return {
        ...state,
        autocomplete: { ...state.autocomplete, open: true, index: 0 }
      };

    case "closeAutocomplete":
      return {
        ...state,
        autocomplete: { ...state.autocomplete, open: false }
      };

    case "moveAutocomplete": {
      if (action.count <= 0) {
        return state;
      }
      const next =
        ((state.autocomplete.index + action.delta) % action.count +
          action.count) %
        action.count;
      return { ...state, autocomplete: { ...state.autocomplete, index: next } };
    }

    case "setAutocompleteIndex":
      return {
        ...state,
        autocomplete: { ...state.autocomplete, index: action.index }
      };

    case "setInput":
      return { ...state, input: action.value };

    case "setBusy":
      return { ...state, busy: action.busy };

    case "setSessionsLoading":
      return { ...state, sessionsLoading: action.loading };

    case "setError":
      return { ...state, error: action.error };

    case "setNotice":
      return { ...state, notice: action.notice };

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
          route: "session",
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
