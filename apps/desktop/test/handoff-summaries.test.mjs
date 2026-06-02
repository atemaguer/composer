import assert from "node:assert/strict";
import test from "node:test";

// Verifies the cross-provider invariant that matters for handoffs: when a
// session switches engines, the source provider must produce a non-empty
// readable summary for the next provider — via the model when available, and
// via a deterministic fallback when the model returns nothing (so the next
// agent never inherits an empty handoff context).

function createSession(provider) {
  return {
    id: `composer-session-${provider}`,
    provider,
    providerSessionId: "source-thread",
    contextVersion: 3,
    title: "Test session",
    cwd: "/tmp/project",
    items: [
      { id: "user-1", type: "user_message", body: "Fix the layout bug in the header." },
      {
        id: "asst-1",
        type: "assistant_message",
        body: "I adjusted the flex container and re-ran the checks."
      },
      {
        id: "tool-1",
        type: "tool_group",
        summary: "Ran npm run typecheck",
        details: [
          { id: "d1", label: "npm run typecheck", kind: "command", action: "run" }
        ]
      }
    ],
    pendingItems: [],
    compactionSummaries: []
  };
}

const settings = {
  permissionMode: "Full access",
  intelligence: "High",
  model: "gpt-5.5"
};

test("Codex handoff produces a model-generated summary", async () => {
  const { CodexProvider } = await import("../dist-server/server/providers/codex.js");
  const provider = new CodexProvider();
  const session = createSession("codex");

  provider.ensureStarted = async () => {};
  provider.request = async (method, params) => {
    if (method === "thread/resume") return { thread: { id: params.threadId } };
    if (method === "thread/fork") return { thread: { id: "fork-thread" } };
    if (method === "turn/start") {
      queueMicrotask(() => {
        provider.handleNotification("turn/started", {
          threadId: "fork-thread",
          turn: { id: "summary-turn" }
        });
        provider.handleNotification("item/completed", {
          threadId: "fork-thread",
          item: { id: "m", type: "agentMessage", text: "Readable Codex handoff summary." }
        });
        provider.handleNotification("turn/completed", {
          threadId: "fork-thread",
          turn: { id: "summary-turn", status: "completed" }
        });
      });
      return { turn: { id: "summary-turn" } };
    }
    if (method === "thread/archive") return {};
    throw new Error(`Unexpected Codex request: ${method}`);
  };

  const summary = await provider.compact({
    sessionId: session.id,
    session,
    settings,
    reason: "handoff from Codex to Claude",
    emit() {}
  });

  assert.equal(summary?.provider, "codex");
  assert.ok(summary?.summary.trim().length > 0, "summary must be non-empty");
  assert.equal(summary.summary, "Readable Codex handoff summary.");
  assert.equal(session.compactionSummaries.at(-1)?.summary, summary.summary);
});

test("Codex handoff falls back to a non-empty deterministic summary", async () => {
  const { CodexProvider } = await import("../dist-server/server/providers/codex.js");
  const provider = new CodexProvider();
  const session = createSession("codex");

  provider.ensureStarted = async () => {};
  provider.request = async (method, params) => {
    if (method === "thread/resume") return { thread: { id: params.threadId } };
    if (method === "thread/fork") throw new Error("fork failed");
    throw new Error(`Unexpected Codex request: ${method}`);
  };

  const summary = await provider.compact({
    sessionId: session.id,
    session,
    settings,
    reason: "handoff from Codex to Claude",
    emit() {}
  });

  assert.equal(summary?.source, "deterministic-fallback");
  assert.ok(summary.summary.trim().length > 0);
  assert.match(summary.summary, /Fix the layout bug/);
  assert.match(summary.summary, /npm run typecheck/);
});

test("Claude handoff produces a model-generated summary", async () => {
  const { ClaudeProvider } = await import("../dist-server/server/providers/claude.js");
  const provider = new ClaudeProvider();
  const session = createSession("claude");

  provider.queryImpl = ({ options }) =>
    (async function* () {
      // The SDK fires PostCompact with the real model summary.
      await options.hooks.PostCompact[0].hooks[0]({
        hook_event_name: "PostCompact",
        compact_summary: "Readable Claude handoff summary.",
        trigger: "manual"
      });
      yield {
        type: "system",
        subtype: "compact_boundary",
        session_id: "claude-session",
        compact_metadata: { trigger: "manual", pre_tokens: 100, post_tokens: 20 }
      };
      yield { type: "result", subtype: "success", session_id: "claude-session" };
    })();

  const summary = await provider.compact({
    sessionId: session.id,
    session,
    settings: { ...settings, model: "claude-sonnet-4-6" },
    reason: "handoff from Claude to Codex",
    emit() {}
  });

  assert.equal(summary?.provider, "claude");
  assert.ok(summary?.summary.trim().length > 0, "summary must be non-empty");
  assert.equal(summary.summary, "Readable Claude handoff summary.");
  assert.equal(summary.preTokens, 100);
  assert.equal(session.compactionSummaries.at(-1)?.summary, summary.summary);
});

test("Claude handoff falls back to a non-empty summary when the model returns none", async () => {
  const { ClaudeProvider } = await import("../dist-server/server/providers/claude.js");
  const provider = new ClaudeProvider();
  const session = createSession("claude");

  // No PostCompact hook invocation — the model produced nothing usable.
  provider.queryImpl = () =>
    (async function* () {
      yield { type: "result", subtype: "success", session_id: "claude-session" };
    })();

  const summary = await provider.compact({
    sessionId: session.id,
    session,
    settings: { ...settings, model: "claude-sonnet-4-6" },
    reason: "handoff from Claude to Codex",
    emit() {}
  });

  assert.equal(summary?.provider, "claude");
  assert.ok(
    summary?.summary.trim().length > 0,
    "fallback summary must be non-empty so the next provider keeps context"
  );
  // The Claude fallback now assembles the same transcript digest as Codex,
  // rather than a bare one-line note — so the next provider keeps real context.
  assert.match(summary.summary, /# Claude Handoff Summary/);
  assert.match(summary.summary, /handoff from Claude to Codex/);
  assert.match(summary.summary, /Recent User Requests/);
  assert.match(summary.summary, /Fix the layout bug/);
  assert.match(summary.summary, /npm run typecheck/);
});
