import type {
  AgentModel,
  ApprovalRequest,
  IntelligenceMode,
  LiveAgentEvent,
  PermissionMode,
  Project,
  SessionContent,
  SessionProvider
} from "@composer/client";

/**
 * Which transient overlay (if any) is currently capturing keyboard focus.
 * Everything outside of `none` renders a modal picker on top of the chat.
 */
export type OverlayMode =
  | { kind: "none" }
  | { kind: "sessions" }
  | { kind: "provider" }
  | { kind: "model" }
  | { kind: "intelligence" }
  | { kind: "permission" }
  | { kind: "approval"; approval: ApprovalRequest };

/**
 * The complete TUI state. Mirrors the desktop's session-store + composer-store
 * but flattened into a single reducer-friendly shape.
 */
export type TuiState = {
  /** Working directory the runtime server was started in. */
  cwd: string;
  /** All known sessions keyed by id (loaded lazily / via snapshot). */
  sessions: Record<string, SessionContent>;
  /** Project tree from the latest session snapshot (for the session list). */
  projects: Project[];
  /** Id of the session currently shown in the conversation pane. */
  selectedThread: string | null;
  /**
   * When a brand-new conversation is in flight we optimistically render a
   * synthetic session keyed by this request id until `session.started` arrives
   * with the real session, at which point the synthetic items are migrated.
   */
  pendingNewRequestId: string | null;
  /** Outstanding approval requests awaiting a user decision. */
  approvals: ApprovalRequest[];

  // Composer settings ------------------------------------------------------
  provider: SessionProvider;
  modelByProvider: Record<SessionProvider, AgentModel>;
  intelligenceByProvider: Record<SessionProvider, IntelligenceMode>;
  permission: PermissionMode;

  // UI ---------------------------------------------------------------------
  overlay: OverlayMode;
  /** Current text in the prompt input. */
  input: string;
  /** True while an agent request is streaming. */
  busy: boolean;
  /** Last fatal/transient error to surface in the status bar. */
  error: string | null;
};

/**
 * All state transitions. `event` carries a wire `LiveAgentEvent` straight from
 * the agent stream or the websocket; everything else is local UI intent.
 */
export type TuiAction =
  | { type: "event"; event: LiveAgentEvent }
  | {
      type: "snapshot";
      projects: Project[];
      sessions: Record<string, SessionContent>;
    }
  | { type: "upsertSession"; session: SessionContent }
  | { type: "selectThread"; sessionId: string | null }
  | { type: "removeApproval"; approvalId: string }
  | { type: "setProvider"; provider: SessionProvider }
  | { type: "setModel"; model: AgentModel }
  | { type: "setIntelligence"; intelligence: IntelligenceMode }
  | { type: "setPermission"; permission: PermissionMode }
  | { type: "setOverlay"; overlay: OverlayMode }
  | { type: "setInput"; value: string }
  | { type: "setBusy"; busy: boolean }
  | { type: "setError"; error: string | null }
  /**
   * Optimistically append a user message. `sessionId` is the active session,
   * or `requestId` for a not-yet-started new conversation (the synthetic id).
   */
  | { type: "userMessage"; sessionId: string; body: string; isNew: boolean };

export type TuiInit = {
  cwd: string;
  provider?: SessionProvider;
};

/** Implemented in `reducer.ts`. */
export type RootReducer = (state: TuiState, action: TuiAction) => TuiState;

/**
 * Convenience selectors shared across components — the active session and the
 * currently-effective model/intelligence for the selected provider.
 */
export function activeSession(state: TuiState): SessionContent | null {
  if (!state.selectedThread) {
    return null;
  }
  return state.sessions[state.selectedThread] ?? null;
}

export function activeModel(state: TuiState): AgentModel {
  return state.modelByProvider[state.provider];
}

export function activeIntelligence(state: TuiState): IntelligenceMode {
  return state.intelligenceByProvider[state.provider];
}
