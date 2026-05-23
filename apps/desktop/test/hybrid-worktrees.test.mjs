import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("parallel initial creates only the Codex Composer-managed worktree", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "composer-hybrid-worktrees-"));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  const originalHome = process.env.HOME;

  try {
    fs.mkdirSync(repo, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    run("git", ["init"], repo);
    run("git", ["config", "user.email", "composer@example.test"], repo);
    run("git", ["config", "user.name", "Composer Test"], repo);
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
    run("git", ["add", "README.md"], repo);
    run("git", ["commit", "-m", "initial"], repo);

    process.env.HOME = home;

    const { createCodexParallelWorktree } = await import(
      "../dist-server/server/parallel-worktrees.js"
    );
    const worktree = createCodexParallelWorktree({
      baseCwd: repo,
      parentSessionId: "session/one"
    });

    assert.equal(worktree.provider, "codex");
    assert.equal(path.basename(worktree.cwd), "codex");
    assert.equal(
      run("git", ["rev-parse", "--is-inside-work-tree"], worktree.cwd),
      "true"
    );
    assert.equal(fs.existsSync(path.join(path.dirname(worktree.cwd), "claude")), false);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Claude initial delegate uses native worktree CLI args", async () => {
  const { applyClaudeNativeWorktreeOption } = await import(
    "../dist-server/server/providers/claude.js"
  );
  const options = { extraArgs: { debug: null } };

  applyClaudeNativeWorktreeOption(options, {
    nativeWorktreeName: "composer-session-one"
  });

  assert.deepEqual(options.extraArgs, {
    debug: null,
    worktree: "composer-session-one"
  });
});

test("Claude resume does not request a new native worktree", async () => {
  const { applyClaudeNativeWorktreeOption } = await import(
    "../dist-server/server/providers/claude.js"
  );
  const options = {};

  applyClaudeNativeWorktreeOption(
    options,
    { nativeWorktreeName: "composer-session-one" },
    "claude-existing-session"
  );

  assert.deepEqual(options, { resume: "claude-existing-session" });
});

test("parallel adoption keeps only the chosen provider transcript", async () => {
  const { adoptedParallelItems } = await import(
    "../dist-server/server/runtime.js"
  );
  const items = [
    {
      id: "user",
      type: "user_message",
      body: "explain this project"
    },
    {
      id: "supervisor",
      type: "assistant_message",
      body: "**Hybrid supervisor**\n\nStarting both."
    },
    {
      id: "codex-header",
      type: "assistant_message",
      body: "**Codex parallel delegate**",
      provider: "codex",
      layoutGroupId: "parallel-1"
    },
    {
      id: "codex-user-echo",
      type: "tool_group",
      summary: "[Codex] user Message",
      provider: "codex",
      layoutGroupId: "parallel-1",
      details: [
        {
          id: "codex-user-echo-detail",
          label: "[Codex] user Message",
          kind: "call",
          action: "other"
        }
      ]
    },
    {
      id: "codex-answer",
      type: "assistant_message",
      body: "Codex answer",
      provider: "codex",
      layoutGroupId: "parallel-1"
    },
    {
      id: "claude-answer",
      type: "assistant_message",
      body: "Claude answer",
      provider: "claude",
      layoutGroupId: "parallel-1"
    },
    {
      id: "complete",
      type: "assistant_message",
      body: "**Hybrid supervisor**\n\nParallel run complete."
    }
  ];

  assert.deepEqual(adoptedParallelItems(items, "codex"), [
    {
      id: "user",
      type: "user_message",
      body: "explain this project"
    },
    {
      id: "codex-answer",
      type: "assistant_message",
      body: "Codex answer"
    }
  ]);
});

test("parallel adoption discards the unchosen provider session before handoff", async () => {
  await withTempHome(async () => {
    const { AgentRuntime } = await import("../dist-server/server/runtime.js");
    const runtime = new AgentRuntime({
      sessions: {
        "meta-live-test": {
          id: "meta-live-test",
          provider: "meta",
          providerSessionId: JSON.stringify({
            codex: "codex-session",
            claude: "stale-claude-session"
          }),
          providerSessions: {
            codex: {
              sessionId: "codex-session",
              cwd: "/tmp/source/.composer/worktrees/repo/session/codex"
            },
            claude: {
              sessionId: "stale-claude-session",
              cwd: "/tmp/source/.claude/worktrees/composer-meta-live-test"
            }
          },
          renderMode: "hybrid",
          displayCwd: "/tmp/source",
          contextVersion: 1,
          runtimeStatus: "idle",
          title: "Explain project",
          cwd: "/tmp/source/.claude/worktrees/composer-meta-live-test",
          model: "Codex + Claude parallel",
          updatedAt: new Date().toISOString(),
          items: [
            {
              id: "user",
              type: "user_message",
              body: "explain this project"
            }
          ],
          pendingItems: []
        }
      },
      projects: []
    });

    const adopted = runtime.adoptParallelThread("meta-live-test", "codex")
      .sessions["meta-live-test"];

    assert.equal(adopted.provider, "codex");
    assert.equal(adopted.lastProvider, "codex");
    assert.equal(adopted.renderMode, "single");
    assert.equal(adopted.providerSessionId, "codex-session");
    assert.deepEqual(adopted.providerSessions, {
      codex: {
        sessionId: "codex-session",
        cwd: "/tmp/source/.composer/worktrees/repo/session/codex"
      }
    });

    const completed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for Claude handoff run"));
      }, 2_000);
      const unsubscribe = runtime.onBroadcast((event) => {
        if (
          event.type === "session.updated" &&
          event.session.providerSessions?.claude?.sessionId === "new-claude-session"
        ) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(event.session);
        }
      });
    });

    runtime.providers.codex = {
      async run() {},
      async compact(request) {
        assert.equal(request.session.providerSessionId, "codex-session");
      },
      async interrupt() {},
      dispose() {}
    };
    runtime.providers.claude = {
      async run(request) {
        assert.equal(request.session.providerSessionId, undefined);
        assert.equal(
          request.session.cwd,
          "/tmp/source/.composer/worktrees/repo/session/codex"
        );
        request.session.providerSessionId = "new-claude-session";
        request.emit({
          id: "claude-complete",
          type: "turn.completed",
          sessionId: request.sessionId,
          turnId: "claude-turn",
          status: "idle"
        });
      },
      async interrupt() {},
      dispose() {}
    };

    runtime.sendMessage({
      sessionId: "meta-live-test",
      provider: "claude",
      prompt: "continue with Claude",
      settings: {
        permissionMode: "Full access",
        intelligence: "High",
        model: "claude-sonnet-4-6"
      }
    }, () => {});

    const completedSession = await completed;
    assert.equal(completedSession.providerSessions.claude.sessionId, "new-claude-session");
    assert.equal(
      completedSession.providerSessions.claude.cwd,
      "/tmp/source/.composer/worktrees/repo/session/codex"
    );
  });
});

test("hybrid sessions are grouped under their source workspace, not delegate worktrees", async () => {
  const { AgentRuntime } = await import("../dist-server/server/runtime.js");
  const runtime = new AgentRuntime({
    sessions: {
      "meta-live-test": {
        id: "meta-live-test",
        provider: "meta",
        providerSessionId: JSON.stringify({ codex: "codex-session", claude: "claude-session" }),
        providerSessions: {
          codex: {
            sessionId: "codex-session",
            cwd: "/tmp/source/.composer/worktrees/repo/session/codex"
          },
          claude: {
            sessionId: "claude-session",
            cwd: "/tmp/source/.claude/worktrees/composer-meta-live-test"
          }
        },
        renderMode: "hybrid",
        displayCwd: "/tmp/source",
        contextVersion: 1,
        runtimeStatus: "idle",
        title: "Explain project",
        cwd: "/tmp/source/.claude/worktrees/composer-meta-live-test",
        model: "Codex + Claude parallel",
        updatedAt: new Date().toISOString(),
        items: [
          {
            id: "user",
            type: "user_message",
            body: "explain this project"
          }
        ],
        pendingItems: []
      }
    },
    projects: []
  });

  assert.equal(runtime.snapshot().projects[0]?.id, "/tmp/source");
});

test("registered parallel sessions reload as one Composer parent session", async () => {
  await withTempHome(async ({ home }) => {
    const sourceCwd = "/tmp/source";
    const codexCwd = `${sourceCwd}/.composer/worktrees/repo/session/codex`;
    const claudeCwd = `${sourceCwd}/.claude/worktrees/composer-meta-live-test`;
    writeCodexSession(home, {
      sessionId: "codex-session",
      cwd: codexCwd,
      user: "explain this project",
      assistant: "Codex answer"
    });
    writeClaudeSession(home, {
      sessionId: "claude-session",
      projectPath: `${home}/.claude/projects/-tmp-source--claude-worktrees-composer-meta-live-test`,
      cwd: claudeCwd,
      user: "explain this project",
      assistant: "Claude answer"
    });
    await writeRegistry({
      version: 1,
      sessions: [
        {
          id: "meta-live-test",
          title: "Explain project",
          sourceCwd,
          displayCwd: sourceCwd,
          activeCwd: codexCwd,
          currentProvider: "meta",
          lastProvider: "meta",
          renderMode: "hybrid",
          hybridMode: "parallel-initial",
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:01:00.000Z"
        }
      ],
      providerSessions: [
        {
          composerSessionId: "meta-live-test",
          provider: "codex",
          providerSessionId: "codex-session",
          mode: "parallel-initial",
          role: "parallel-initial",
          lifecycle: "active",
          cwd: codexCwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:01:00.000Z"
        },
        {
          composerSessionId: "meta-live-test",
          provider: "claude",
          providerSessionId: "claude-session",
          mode: "parallel-initial",
          role: "parallel-initial",
          lifecycle: "active",
          cwd: claudeCwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:01:00.000Z"
        }
      ],
      events: []
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const snapshot = loadLocalSessions();

    assert.deepEqual(Object.keys(snapshot.sessions), ["meta-live-test"]);
    assert.equal(snapshot.projects[0]?.id, sourceCwd);
    assert.equal(snapshot.sessions["meta-live-test"].provider, "meta");
    assert.equal(snapshot.sessions["meta-live-test"].renderMode, "hybrid");
    assert.equal(
      snapshot.sessions["meta-live-test"].items.some(
        (item) => item.type === "parallel_thread_group"
      ),
      true
    );
  });
});

test("adopted parallel sessions reload as the chosen provider only", async () => {
  await withTempHome(async ({ home }) => {
    const sourceCwd = "/tmp/source";
    const codexCwd = `${sourceCwd}/.composer/worktrees/repo/session/codex`;
    const claudeCwd = `${sourceCwd}/.claude/worktrees/composer-meta-live-test`;
    writeCodexSession(home, {
      sessionId: "codex-session",
      cwd: codexCwd,
      user: "explain this project",
      assistant: "Codex answer"
    });
    writeClaudeSession(home, {
      sessionId: "claude-session",
      projectPath: `${home}/.claude/projects/-tmp-source--claude-worktrees-composer-meta-live-test`,
      cwd: claudeCwd,
      user: "explain this project",
      assistant: "Claude answer"
    });
    await writeRegistry({
      version: 1,
      sessions: [
        {
          id: "meta-live-test",
          title: "Explain project",
          sourceCwd,
          displayCwd: sourceCwd,
          activeCwd: codexCwd,
          currentProvider: "codex",
          lastProvider: "codex",
          renderMode: "single",
          hybridMode: "parallel-initial",
          parallelAdoptedProvider: "codex",
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:01:00.000Z"
        }
      ],
      providerSessions: [
        {
          composerSessionId: "meta-live-test",
          provider: "codex",
          providerSessionId: "codex-session",
          mode: "parallel-initial",
          role: "parallel-initial",
          lifecycle: "adopted",
          cwd: codexCwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:01:00.000Z"
        },
        {
          composerSessionId: "meta-live-test",
          provider: "claude",
          providerSessionId: "claude-session",
          mode: "parallel-initial",
          role: "parallel-initial",
          lifecycle: "discarded",
          cwd: claudeCwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:01:00.000Z"
        }
      ],
      events: []
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const snapshot = loadLocalSessions();
    const session = snapshot.sessions["meta-live-test"];

    assert.deepEqual(Object.keys(snapshot.sessions), ["meta-live-test"]);
    assert.equal(snapshot.projects[0]?.id, sourceCwd);
    assert.equal(session.provider, "codex");
    assert.equal(session.renderMode, "single");
    assert.equal(session.parallelAdoptedProvider, "codex");
    assert.equal(session.providerSessions.claude, undefined);
    assert.equal(
      session.items.some((item) => item.type === "parallel_thread_group"),
      false
    );
    assert.equal(
      session.items.some(
        (item) => item.type === "assistant_message" && item.body === "Codex answer"
      ),
      true
    );
  });
});

async function withTempHome(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "composer-home-"));
  const home = path.join(root, "home");
  const originalHome = process.env.HOME;

  try {
    fs.mkdirSync(home, { recursive: true });
    process.env.HOME = home;
    return await callback({ root, home });
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeCodexSession(home, { sessionId, cwd, user, assistant }) {
  const dir = path.join(home, ".codex", "sessions", "2026", "05", "23");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `rollout-2026-05-23T00-00-00-${sessionId}.jsonl`),
    [
      {
        type: "session_meta",
        timestamp: "2026-05-23T00:00:00.000Z",
        payload: { id: sessionId, cwd }
      },
      {
        type: "event_msg",
        timestamp: "2026-05-23T00:00:01.000Z",
        payload: { type: "user_message", message: user }
      },
      {
        type: "response_item",
        timestamp: "2026-05-23T00:00:02.000Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: assistant }]
        }
      }
    ].map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

function writeClaudeSession(home, { sessionId, projectPath, cwd, user, assistant }) {
  fs.mkdirSync(projectPath, { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, `${sessionId}.jsonl`),
    [
      {
        type: "user",
        sessionId,
        cwd,
        timestamp: "2026-05-23T00:00:01.000Z",
        message: { role: "user", content: user }
      },
      {
        type: "assistant",
        sessionId,
        cwd,
        timestamp: "2026-05-23T00:00:02.000Z",
        message: {
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: assistant }]
        }
      }
    ].map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

async function writeRegistry(registry) {
  const { writeComposerSessionRegistry } = await import(
    "../dist-server/electron/composer-session-registry.js"
  );
  writeComposerSessionRegistry(registry);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`
    );
  }

  return result.stdout.trim();
}
