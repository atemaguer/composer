import type {
  ConversationItem,
  LiveAgentEvent,
  SessionContent,
  ToolDetail
} from "./types.js";

export interface ApplyEventOptions {
  /**
   * When true (the default), the input session is never mutated: a brand new
   * SessionContent (with freshly cloned arrays) is returned. This is the exact
   * behavior of the canonical desktop immutable reducer.
   *
   * When false, the immutable result is computed and then written back onto the
   * SAME input session object (Object.assign + reassigning items/pendingItems),
   * and that same reference is returned. This matches the runtime's in-place
   * semantics where consumers hold a long-lived session reference.
   */
  immutable?: boolean;
  /**
   * Controls what the `error` event does.
   * - "default": set status=error, clear pendingItems, settle running tool
   *   groups, and push the generic "Agent failed: ..." notice (desktop behavior).
   * - "none": set status=error, clear pendingItems, settle running tool groups,
   *   but do NOT push a notice (the runtime appends its own).
   */
  errorNotice?: "default" | "none";
}

/**
 * Canonical immutable session reducer, ported verbatim from the desktop
 * session-store (`applyLiveSessionEvent`). Never mutates `session`; returns a
 * new SessionContent with arrays cloned lazily per-branch.
 */
function applyLiveSessionEventImmutable(
  session: SessionContent,
  event: LiveAgentEvent,
  errorNotice: "default" | "none"
): SessionContent {
  // Shallow clone with a fresh updatedAt. Arrays (items/pendingItems/
  // providerSessions) are cloned lazily per-branch so high-frequency delta
  // events only touch the one array they actually mutate.
  const next: SessionContent = {
    ...session,
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
    const items = [...(session.items ?? [])];
    const existingIndex = items.findIndex(
      (item) => item.type === "assistant_message" && item.id === event.messageId
    );

    if (existingIndex >= 0) {
      const existing = items[existingIndex];

      if (existing.type === "assistant_message") {
        items[existingIndex] = {
          ...existing,
          body: `${existing.body}${event.delta}`,
          provider: event.provider ?? existing.provider,
          layoutGroupId: event.layoutGroupId ?? existing.layoutGroupId,
          layoutTitle: event.layoutTitle ?? existing.layoutTitle
        };
      }
    } else {
      items.push({
        id: event.messageId,
        type: "assistant_message",
        body: event.delta,
        provider: event.provider,
        layoutGroupId: event.layoutGroupId,
        layoutTitle: event.layoutTitle
      });
    }

    next.items = items;
    return next;
  }

  if (event.type === "message.completed") {
    const items = [...(session.items ?? [])];
    const existingIndex = items.findIndex(
      (item) => item.type === "assistant_message" && item.id === event.messageId
    );

    if (existingIndex >= 0) {
      const existing = items[existingIndex];

      if (existing.type === "assistant_message") {
        items[existingIndex] = {
          ...existing,
          body: event.body ?? existing.body,
          provider: event.provider ?? existing.provider,
          layoutGroupId: event.layoutGroupId ?? existing.layoutGroupId,
          layoutTitle: event.layoutTitle ?? existing.layoutTitle
        };
      }
    } else if (event.body) {
      items.push({
        id: event.messageId,
        type: "assistant_message",
        body: event.body,
        provider: event.provider,
        layoutGroupId: event.layoutGroupId,
        layoutTitle: event.layoutTitle
      });
    }

    next.items = items;
    return next;
  }

  if (event.type === "tool.started") {
    const sessionItems = session.items ?? [];

    if (sessionItems.some((item) => item.type === "tool_group" && item.id === event.toolId)) {
      next.items = sessionItems;
      return next;
    }

    next.items = [
      ...sessionItems,
      {
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
      }
    ];
    return next;
  }

  if (event.type === "tool.delta") {
    const sessionItems = session.items ?? [];
    const toolIndex = sessionItems.findIndex(
      (item) => item.type === "tool_group" && item.id === event.toolId
    );
    const tool = sessionItems[toolIndex];

    if (tool?.type !== "tool_group") {
      next.items = sessionItems;
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

    const items = [...sessionItems];
    items[toolIndex] = { ...tool, details };
    next.items = items;
    return next;
  }

  if (event.type === "tool.completed") {
    const sessionItems = session.items ?? [];
    const toolIndex = sessionItems.findIndex(
      (item) => item.type === "tool_group" && item.id === event.toolId
    );
    const tool = sessionItems[toolIndex];

    if (tool?.type === "tool_group") {
      const items = [...sessionItems];
      items[toolIndex] = {
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
      next.items = items;
    } else {
      next.items = sessionItems;
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

  if (event.type === "question.requested") {
    next.runtimeStatus = "awaiting_approval";
    next.pendingQuestion = event.question;
    return next;
  }

  if (event.type === "question.resolved") {
    // The engine resumes the turn once answered.
    if (next.pendingQuestion?.id === event.questionId) {
      next.pendingQuestion = undefined;
      next.runtimeStatus = "running";
    }
    return next;
  }

  if (event.type === "error") {
    next.runtimeStatus = "error";
    next.pendingItems = [];
    const items = settleRunningToolGroups(session.items ?? []);

    if (errorNotice === "default") {
      items.push({
        id: `${next.id}-error-${Date.now()}`,
        type: "notice",
        label: `Agent failed: ${event.message}`
      });
    }

    next.items = items;
    return next;
  }

  if (event.type === "turn.completed") {
    next.runtimeStatus = event.status;
    next.pendingItems = [];
    next.items = settleRunningToolGroups(session.items ?? []);
  }

  return next;
}

/**
 * Apply a single live agent event to a session.
 *
 * Default (`immutable: true`) returns a new SessionContent without mutating the
 * input. With `immutable: false`, the immutable result is written back onto the
 * same input session and that reference is returned.
 */
export function applyLiveSessionEvent(
  session: SessionContent,
  event: LiveAgentEvent,
  options?: ApplyEventOptions
): SessionContent {
  const immutable = options?.immutable ?? true;
  const errorNotice = options?.errorNotice ?? "default";
  const result = applyLiveSessionEventImmutable(session, event, errorNotice);

  if (immutable) {
    return result;
  }

  // Mutating mode: copy the computed result back onto the SAME session object
  // (including reassigning the items/pendingItems arrays) and return it.
  Object.assign(session, result);
  session.items = result.items;
  session.pendingItems = result.pendingItems;
  return session;
}

/**
 * Fold `applyLiveSessionEvent` over a list of events. Honors the same options
 * (immutability / errorNotice) for every event in the sequence.
 */
export function applyLiveSessionEvents(
  session: SessionContent,
  events: LiveAgentEvent[],
  options?: ApplyEventOptions
): SessionContent {
  return events.reduce(
    (current, event) => applyLiveSessionEvent(current, event, options),
    session
  );
}

// Once a turn ends, nothing is running. Some providers (notably Claude) don't
// always emit a tool.completed for every tool.started, which would otherwise
// leave a tool group's status stuck at "running" and shimmering forever.
export function settleRunningToolGroups(
  items: ConversationItem[]
): ConversationItem[] {
  return items.map((item) => {
    if (item.type !== "tool_group" || item.status !== "running") {
      return item;
    }

    return {
      ...item,
      status: "completed",
      details: item.details.map((detail) =>
        detail.status === "running" ? { ...detail, status: "completed" } : detail
      )
    };
  });
}

export function toolDetail(
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
