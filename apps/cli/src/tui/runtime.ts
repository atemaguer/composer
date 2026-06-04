import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ComposerClient,
  type ApprovalDecision,
  type ComposerCapabilityCatalog,
  type ComposerEventSocket,
  type DelegateSessionProvider,
  type LiveAgentEvent,
  type ReviewBranchList,
  type ReviewDiff,
  type ReviewDiffScope,
  type SessionContent,
  type SessionSnapshot
} from "@composer/client";
import { useTui } from "./store.js";
import { activeSession, type TuiState } from "./types.js";

/**
 * Imperative surface the React UI calls into. Every method is fire-and-forget
 * and manages its own async work; results flow back through reducer dispatches.
 */
export type RuntimeApi = {
  /** Send a prompt to the runtime; when a turn is running it queues behind it. */
  sendPrompt: (prompt: string) => void;
  /** "Send now" a queued message (front by default): Codex injects, Claude interrupts. */
  steerQueue: (queuedId?: string) => void;
  /** Remove a not-yet-run queued message. */
  cancelQueued: (queuedId: string) => void;
  /** Abort the in-flight request (both locally and on the server). */
  interrupt: () => void;
  /** Resolve an outstanding approval over the event socket. */
  resolveApproval: (approvalId: string, decision: ApprovalDecision) => void;
  /** Answer an open clarifying question with the selected option(s). */
  answerQuestion: (
    questionId: string,
    answers: Array<{ questionId: string; selected: string[] }>
  ) => void;
  /** Hydrate a past session (if needed) and select it. */
  loadSession: (sessionId: string) => void;
  /** Ask the server for a fresh session snapshot. */
  refreshSessions: () => void;
  /** Load a working-tree diff for the review viewer. */
  loadReviewDiff: (scope?: ReviewDiffScope) => Promise<ReviewDiff | null>;
  /** List local/remote branches for the active working directory. */
  loadReviewBranches: () => Promise<ReviewBranchList | null>;
  /** Check out a branch in the active working directory. */
  checkoutBranch: (branch: string) => Promise<ReviewBranchList | null>;
  /** Load the skills/plugins capability catalog. */
  loadCapabilities: () => Promise<ComposerCapabilityCatalog | null>;
  /** Manually compact the active session's provider context. */
  compactSession: (sessionId: string) => void;
  /** Archive (hide) a session. */
  archiveSession: (sessionId: string) => void;
  /** In Compose/meta mode, adopt one provider's parallel thread to continue. */
  adoptParallel: (
    sessionId: string,
    provider: DelegateSessionProvider
  ) => void;
};

export function useRuntime(connection: {
  httpUrl: string;
  wsUrl: string;
}): RuntimeApi {
  const { state, dispatch } = useTui();

  // Hold the latest state so async callbacks read current values instead of
  // values captured at the time the callback was created (stale-closure fix).
  const stateRef = useRef<TuiState>(state);
  stateRef.current = state;

  const client = useMemo(
    () =>
      new ComposerClient<
        LiveAgentEvent,
        SessionSnapshot,
        ReviewDiff,
        ReviewBranchList,
        ComposerCapabilityCatalog
      >({
        httpUrl: connection.httpUrl,
        wsUrl: connection.wsUrl
      }),
    [connection.httpUrl, connection.wsUrl]
  );

  const socketRef = useRef<ComposerEventSocket<LiveAgentEvent> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRequestIdRef = useRef<string | null>(null);
  // Tracks in-flight session loads so we never fetch the same session twice.
  const loadingSessionsRef = useRef<Set<string>>(new Set());

  // Open the event socket once per connection and tear it down on unmount.
  useEffect(() => {
    const socket = client.openEventSocket({
      onEvent: (event) => dispatch({ type: "event", event })
    });
    socketRef.current = socket;

    const requestSnapshot = () => socket.requestSnapshot();

    if (socket.socket.readyState === socket.socket.OPEN) {
      requestSnapshot();
    } else {
      socket.socket.addEventListener?.("open", requestSnapshot, { once: true });
      // Fall back to a direct call in case the open event was missed; the
      // socket abstraction only forwards sends once readyState === OPEN.
      requestSnapshot();
    }

    return () => {
      socket.socket.removeEventListener?.("open", requestSnapshot);
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [client, dispatch]);

  const sendPrompt = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      const current = stateRef.current;

      if (!trimmed) {
        return;
      }

      const provider = current.provider;
      const model = current.modelByProvider[provider];
      const intelligence = current.intelligenceByProvider[provider];
      const permissionMode = current.permission;
      const cwd = current.cwd;
      const sessionId = current.selectedThread ?? undefined;
      const requestId = crypto.randomUUID();

      // While a turn is running, a send queues behind it (the runtime parks it
      // until the turn completes). A queued message must NOT render an optimistic
      // transcript bubble (it lives in the queue accordion until drained) and
      // must NOT disturb the active turn's abort/busy bookkeeping. It surfaces
      // via the queued session.patch over the socket.
      const queueing = current.busy && Boolean(sessionId);

      if (!queueing) {
        lastRequestIdRef.current = requestId;
        // Optimistically render the user's message. A brand-new conversation is
        // keyed by requestId until `session.started` migrates it to the real id.
        dispatch({
          type: "userMessage",
          sessionId: sessionId ?? requestId,
          body: trimmed,
          isNew: !sessionId
        });
      }
      dispatch({ type: "setInput", value: "" });

      const controller = new AbortController();
      if (!queueing) {
        abortRef.current = controller;
      }

      void (async () => {
        try {
          for await (const event of client.chatEvents({
            requestId,
            sessionId,
            provider,
            prompt: trimmed,
            cwd,
            permissionMode,
            intelligence,
            model,
            signal: controller.signal
          })) {
            dispatch({ type: "event", event });
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            // Interruption is expected; the reducer handles UI state.
          } else if (!queueing) {
            dispatch({ type: "setError", error: String(err) });
          }
        } finally {
          if (!queueing) {
            dispatch({ type: "setBusy", busy: false });
          }
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      })();
    },
    [client, dispatch]
  );

  // "Send now": steer a queued message into the active run (front of the queue
  // by default). Codex injects it; Claude interrupts and runs it next.
  const steerQueue = useCallback(
    (queuedId?: string) => {
      const sessionId = stateRef.current.selectedThread;
      if (!sessionId) {
        return;
      }
      void client
        .steer(sessionId, queuedId)
        .catch((err) => dispatch({ type: "setError", error: String(err) }));
    },
    [client, dispatch]
  );

  // Remove a not-yet-run queued message.
  const cancelQueued = useCallback(
    (queuedId: string) => {
      const sessionId = stateRef.current.selectedThread;
      if (!sessionId) {
        return;
      }
      void client
        .cancelQueuedMessage(sessionId, queuedId)
        .catch((err) => dispatch({ type: "setError", error: String(err) }));
    },
    [client, dispatch]
  );

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    const requestId = lastRequestIdRef.current;
    if (requestId) {
      void client.interrupt({ requestId }).catch(() => undefined);
      socketRef.current?.interrupt({ requestId });
    }

    dispatch({ type: "setBusy", busy: false });
  }, [client, dispatch]);

  const resolveApproval = useCallback(
    (approvalId: string, decision: ApprovalDecision) => {
      socketRef.current?.resolveApproval(approvalId, decision);
      dispatch({ type: "removeApproval", approvalId });
    },
    [dispatch]
  );

  const answerQuestion = useCallback(
    (
      questionId: string,
      answers: Array<{ questionId: string; selected: string[] }>
    ) => {
      // The runtime broadcasts question.resolved (clearing pendingQuestion).
      socketRef.current?.resolveQuestion(questionId, answers);
    },
    []
  );

  const loadSession = useCallback(
    (sessionId: string) => {
      const existing = stateRef.current.sessions[sessionId];

      if (existing?.contentLoaded) {
        dispatch({ type: "selectThread", sessionId });
        return;
      }

      if (loadingSessionsRef.current.has(sessionId)) {
        return;
      }

      loadingSessionsRef.current.add(sessionId);

      void (async () => {
        try {
          const session = await client.loadSession<SessionContent>(sessionId);
          if (session) {
            dispatch({ type: "upsertSession", session });
          }
          dispatch({ type: "selectThread", sessionId });
        } catch (err) {
          dispatch({ type: "setError", error: String(err) });
        } finally {
          loadingSessionsRef.current.delete(sessionId);
        }
      })();
    },
    [client, dispatch]
  );

  const refreshSessions = useCallback(() => {
    dispatch({ type: "setSessionsLoading", loading: true });
    socketRef.current?.requestSnapshot();
  }, [dispatch]);

  // The working directory to run git/review operations in: prefer the active
  // session's cwd, falling back to the server's launch directory.
  const reviewCwd = useCallback(() => {
    const current = stateRef.current;
    return activeSession(current)?.cwd ?? current.cwd;
  }, []);

  const loadReviewDiff = useCallback(
    async (scope: ReviewDiffScope = "unstaged") => {
      try {
        const requestScope = scope === "last-turn" ? "unstaged" : scope;
        return await client.loadReviewDiff({
          cwd: reviewCwd(),
          scope: requestScope
        });
      } catch (err) {
        dispatch({ type: "setError", error: String(err) });
        return null;
      }
    },
    [client, dispatch, reviewCwd]
  );

  const loadReviewBranches = useCallback(async () => {
    try {
      return await client.loadReviewBranches(reviewCwd());
    } catch (err) {
      dispatch({ type: "setError", error: String(err) });
      return null;
    }
  }, [client, dispatch, reviewCwd]);

  const checkoutBranch = useCallback(
    async (branch: string) => {
      try {
        return await client.checkoutBranch(reviewCwd(), branch);
      } catch (err) {
        dispatch({ type: "setError", error: String(err) });
        return null;
      }
    },
    [client, dispatch, reviewCwd]
  );

  const loadCapabilities = useCallback(async () => {
    try {
      return await client.loadCapabilities();
    } catch (err) {
      dispatch({ type: "setError", error: String(err) });
      return null;
    }
  }, [client, dispatch]);

  const compactSession = useCallback(
    (sessionId: string) => {
      const current = stateRef.current;
      void client
        .compactSession({
          sessionId,
          provider: current.provider,
          model: current.modelByProvider[current.provider],
          permissionMode: current.permission,
          intelligence: current.intelligenceByProvider[current.provider]
        })
        .catch((err) => dispatch({ type: "setError", error: String(err) }));
    },
    [client, dispatch]
  );

  const archiveSession = useCallback(
    (sessionId: string) => {
      void client
        .updateSessionVisibility(sessionId, "archive")
        .catch((err) => dispatch({ type: "setError", error: String(err) }));
    },
    [client, dispatch]
  );

  const adoptParallel = useCallback(
    (sessionId: string, provider: DelegateSessionProvider) => {
      void client
        .adoptParallelThread(sessionId, provider)
        .catch((err) => dispatch({ type: "setError", error: String(err) }));
    },
    [client, dispatch]
  );

  return useMemo(
    () => ({
      sendPrompt,
      steerQueue,
      cancelQueued,
      interrupt,
      resolveApproval,
      answerQuestion,
      loadSession,
      refreshSessions,
      loadReviewDiff,
      loadReviewBranches,
      checkoutBranch,
      loadCapabilities,
      compactSession,
      archiveSession,
      adoptParallel
    }),
    [
      sendPrompt,
      steerQueue,
      cancelQueued,
      interrupt,
      resolveApproval,
      answerQuestion,
      loadSession,
      refreshSessions,
      loadReviewDiff,
      loadReviewBranches,
      checkoutBranch,
      loadCapabilities,
      compactSession,
      archiveSession,
      adoptParallel
    ]
  );
}
