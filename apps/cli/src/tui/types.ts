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
 * A single modal picker on the dialog stack. Everything except the base
 * conversation lives here; the top entry owns the keyboard while it is open.
 *
 * Phase 1 ships the provider/model/intelligence/permission pickers, the
 * session list, the command palette, the approval prompt, and the read-only
 * help/status panels. Phase 3 adds review/branch/capabilities/confirm.
 */
export type Dialog =
  | { kind: "sessions" }
  | { kind: "provider" }
  | { kind: "model" }
  | { kind: "intelligence" }
  | { kind: "permission" }
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "review" }
  | { kind: "branch" }
  | { kind: "capabilities" }
  | { kind: "archive" }
  | { kind: "adopt" }
  | { kind: "approval"; approval: ApprovalRequest };

/** Which top-level screen the conversation pane renders. */
export type RouteMode = "home" | "session";

/**
 * Transient state for the slash/`@` autocomplete popup that floats above the
 * prompt input. The candidate list itself is derived purely from `input` +
 * `provider` (see `commands/registry.ts`), so only the cursor and open flag
 * need to live in the store.
 */
export type AutocompleteState = {
  open: boolean;
  /** Which trigger opened the popup. `/` = slash commands. */
  trigger: "/";
  /** Highlighted candidate index. */
  index: number;
};

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
  /** Which screen is shown — `home` (no/!selected thread) or `session`. */
  route: RouteMode;
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
  /** Modal dialog stack; the last entry is the focused, top-most dialog. */
  dialogs: Dialog[];
  /** Slash-command autocomplete popup state. */
  autocomplete: AutocompleteState;
  /** Current text in the prompt input. */
  input: string;
  /** True while an agent request is streaming. */
  busy: boolean;
  /** Last fatal/transient error to surface in the status bar. */
  error: string | null;
  /** Transient toast/notice line shown in the status bar (auto-driven by UI). */
  notice: string | null;
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
  | { type: "newSession" }
  | { type: "removeApproval"; approvalId: string }
  | { type: "setProvider"; provider: SessionProvider }
  | { type: "setModel"; model: AgentModel }
  | { type: "setIntelligence"; intelligence: IntelligenceMode }
  | { type: "setPermission"; permission: PermissionMode }
  // Dialog stack -----------------------------------------------------------
  | { type: "pushDialog"; dialog: Dialog }
  | { type: "popDialog" }
  | { type: "clearDialogs" }
  // Autocomplete -----------------------------------------------------------
  | { type: "openAutocomplete" }
  | { type: "closeAutocomplete" }
  | { type: "moveAutocomplete"; delta: number; count: number }
  | { type: "setAutocompleteIndex"; index: number }
  // Input / status ---------------------------------------------------------
  | { type: "setInput"; value: string }
  | { type: "setBusy"; busy: boolean }
  | { type: "setError"; error: string | null }
  | { type: "setNotice"; notice: string | null }
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

/**
 * True when the active session is a finished, unadopted Compose (parallel)
 * session — i.e. both agents ran and the user must pick one thread to continue.
 * Gated on `runtimeStatus` so the prompt only appears once both agents settle
 * (the meta provider emits a single turn.completed after both delegates).
 */
export function needsParallelAdoption(session: SessionContent | null): boolean {
  if (!session || session.parallelAdoptedProvider) {
    return false;
  }
  if (session.runtimeStatus === "running") {
    return false;
  }
  return (
    session.provider === "meta" &&
    session.renderMode === "hybrid" &&
    Boolean(session.providerSessions?.codex?.sessionId) &&
    Boolean(session.providerSessions?.claude?.sessionId)
  );
}

/** The focused, top-most dialog (or null when the stack is empty). */
export function topDialog(state: TuiState): Dialog | null {
  return state.dialogs.length > 0
    ? state.dialogs[state.dialogs.length - 1]
    : null;
}

/** True when any modal is capturing the keyboard. */
export function anyDialogOpen(state: TuiState): boolean {
  return state.dialogs.length > 0;
}
