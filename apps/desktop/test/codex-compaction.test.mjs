import assert from "node:assert/strict";
import test from "node:test";

test("CodexProvider.compact generates a hidden readable handoff from a fork", async () => {
  const { CodexProvider } = await import("../dist-server/server/providers/codex.js");
  const provider = new CodexProvider();
  const calls = [];
  const events = [];
  const session = createSession();

  provider.ensureStarted = async () => {};
  provider.request = async (method, params) => {
    calls.push({ method, params });

    if (method === "thread/resume") {
      return { thread: { id: params.threadId } };
    }

    if (method === "thread/fork") {
      return { thread: { id: "fork-thread" } };
    }

    if (method === "turn/start") {
      queueMicrotask(() => {
        provider.handleNotification("turn/started", {
          threadId: "fork-thread",
          turn: { id: "summary-turn" }
        });
        provider.handleNotification("item/agentMessage/delta", {
          threadId: "fork-thread",
          itemId: "summary-message",
          delta: "partial summary"
        });
        provider.handleNotification("item/completed", {
          threadId: "fork-thread",
          item: {
            id: "summary-message",
            type: "agentMessage",
            text: "Readable Codex handoff summary."
          }
        });
        provider.handleNotification("turn/completed", {
          threadId: "fork-thread",
          turn: { id: "summary-turn", status: "completed" }
        });
      });
      return { turn: { id: "summary-turn" } };
    }

    if (method === "thread/archive") {
      return {};
    }

    throw new Error(`Unexpected Codex request: ${method}`);
  };

  const summary = await provider.compact({
    sessionId: session.id,
    session,
    settings: {
      permissionMode: "Full access",
      intelligence: "High",
      model: "gpt-5.5"
    },
    reason: "handoff from Codex to Claude",
    emit: (event) => events.push(event)
  });

  assert.equal(summary?.provider, "codex");
  assert.equal(summary?.source, "codex-handoff-turn");
  assert.equal(summary?.summary, "Readable Codex handoff summary.");
  assert.equal(session.compactionSummaries?.at(-1)?.summary, summary.summary);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["thread/resume", "thread/fork", "turn/start", "thread/archive"]
  );
  assert.equal(calls[1].params.threadId, "source-thread");
  assert.equal(calls[1].params.ephemeral, true);
  assert.equal(calls[1].params.sandbox, "read-only");
  assert.equal(calls[2].params.threadId, "fork-thread");
  assert.equal(calls[2].params.sandboxPolicy.type, "readOnly");
  assert.equal(calls[2].params.sandboxPolicy.networkAccess, false);
  assert.deepEqual(
    events.map((event) => event.type),
    ["tool.started", "tool.completed"]
  );
});

test("CodexProvider.compact falls back to visible transcript summary on failure", async () => {
  const { CodexProvider } = await import("../dist-server/server/providers/codex.js");
  const provider = new CodexProvider();
  const session = createSession();

  provider.ensureStarted = async () => {};
  provider.request = async (method, params) => {
    if (method === "thread/resume") {
      return { thread: { id: params.threadId } };
    }

    if (method === "thread/fork") {
      throw new Error("fork failed");
    }

    throw new Error(`Unexpected Codex request: ${method}`);
  };

  const summary = await provider.compact({
    sessionId: session.id,
    session,
    settings: {
      permissionMode: "Full access",
      intelligence: "High",
      model: "gpt-5.5"
    },
    reason: "handoff from Codex to Claude",
    emit() {}
  });

  assert.equal(summary?.source, "deterministic-fallback");
  assert.match(summary?.summary ?? "", /Recent User Requests/);
  assert.match(summary?.summary ?? "", /Fix the layout bug/);
  assert.match(summary?.summary ?? "", /npm run typecheck/);
});

test("CodexProvider does not render transcript items as tool calls", async () => {
  const { CodexProvider } = await import("../dist-server/server/providers/codex.js");
  const provider = new CodexProvider();
  const events = [];

  provider.activeTurns.set("composer-session", {
    threadId: "source-thread",
    turnId: "turn-1"
  });
  provider.sinks.set("composer-session", (event) => events.push(event));

  for (const itemType of ["userMessage", "reasoning", "agentMessage"]) {
    provider.handleNotification("item/started", {
      threadId: "source-thread",
      item: {
        id: `item-${itemType}`,
        type: itemType
      }
    });
  }

  assert.deepEqual(events, []);
});

function createSession() {
  return {
    id: "composer-session",
    provider: "codex",
    providerSessionId: "source-thread",
    contextVersion: 3,
    title: "Test session",
    cwd: "/tmp/project",
    items: [
      {
        id: "user-1",
        type: "user_message",
        body: "Fix the layout bug"
      },
      {
        id: "assistant-1",
        type: "assistant_message",
        provider: "codex",
        body: "Adjusted the session view width."
      },
      {
        id: "tool-1",
        type: "tool_group",
        provider: "codex",
        summary: "Ran npm run typecheck",
        details: [
          {
            id: "tool-1-detail",
            label: "Ran npm run typecheck",
            kind: "call",
            action: "command",
            command: "npm run typecheck"
          }
        ]
      }
    ],
    pendingItems: []
  };
}
