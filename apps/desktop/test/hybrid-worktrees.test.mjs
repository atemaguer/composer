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
    const worktree = await createCodexParallelWorktree({
      baseCwd: repo,
      parentSessionId: "session/one"
    });

    assert.equal(worktree.provider, "codex");
    assert.equal(path.basename(worktree.cwd), "codex");
    assert.equal(
      run("git", ["rev-parse", "--is-inside-work-tree"], worktree.cwd),
      "true"
    );
    assert.match(
      run("git", ["branch", "--show-current"], worktree.cwd),
      /^composer\/parallel-codex-session-one(?:-\d+)?$/
    );
    assert.equal(fs.existsSync(path.join(path.dirname(worktree.cwd), "claude")), false);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parallel initial bootstraps non-git project folders", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "composer-hybrid-non-git-"));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  const originalHome = process.env.HOME;

  try {
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.mkdirSync(path.join(repo, "node_modules", "ignored"), { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
    fs.writeFileSync(path.join(repo, "src", "index.ts"), "export const ok = true;\n");
    fs.writeFileSync(path.join(repo, "node_modules", "ignored", "index.js"), "ignored\n");

    process.env.HOME = home;

    const { createCodexParallelWorktree } = await import(
      "../dist-server/server/parallel-worktrees.js"
    );
    const worktree = await createCodexParallelWorktree({
      baseCwd: repo,
      parentSessionId: "session/non-git"
    });

    assert.equal(worktree.provider, "codex");
    assert.equal(run("git", ["rev-parse", "--is-inside-work-tree"], repo), "true");
    assert.equal(run("git", ["branch", "--show-current"], repo), "main");
    assert.equal(run("git", ["show-ref", "--verify", "refs/heads/main"], repo).length > 0, true);
    assert.equal(
      run("git", ["log", "-1", "--format=%s"], repo),
      "Initialize Composer workspace"
    );
    assert.equal(
      run("git", ["rev-parse", "--is-inside-work-tree"], worktree.cwd),
      "true"
    );
    assert.match(
      run("git", ["branch", "--show-current"], worktree.cwd),
      /^composer\/parallel-codex-session-non-git(?:-\d+)?$/
    );
    assert.equal(
      run("git", ["merge-base", "main", "HEAD"], worktree.cwd),
      run("git", ["rev-parse", "main"], worktree.cwd)
    );
    assert.equal(fs.existsSync(path.join(worktree.cwd, "README.md")), true);
    assert.equal(fs.existsSync(path.join(worktree.cwd, "src", "index.ts")), true);
    assert.equal(fs.existsSync(path.join(worktree.cwd, "node_modules")), false);
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

  assert.deepEqual(
    adoptedParallelItems([
      {
        id: "user",
        type: "user_message",
        body: "explain this project"
      },
      {
        id: "parallel",
        type: "parallel_thread_group",
        columns: [
          {
            provider: "codex",
            title: "Codex thread",
            items: [
              {
                id: "codex-wrapper",
                type: "tool_group",
                summary: "Codex parallel delegate started",
                details: [
                  {
                    id: "codex-wrapper-detail",
                    label: "Codex parallel delegate",
                    kind: "call",
                    toolName: "meta_supervisor",
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
              }
            ]
          },
          {
            provider: "claude",
            title: "Claude thread",
            items: [
              {
                id: "claude-answer",
                type: "assistant_message",
                body: "Claude answer"
              }
            ]
          }
        ]
      }
    ], "codex"),
    [
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
    ]
  );
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

    const adopted = (await runtime.adoptParallelThread("meta-live-test", "codex"))
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
        return {
          id: "codex-summary",
          provider: "codex",
          contextVersion: 1,
          createdAt: new Date().toISOString(),
          trigger: "manual",
          source: "codex-handoff-turn",
          summary: "Readable Codex handoff for Claude."
        };
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
        assert.match(
          request.contextPrompt,
          /Readable Codex handoff for Claude\./
        );
        assert.match(request.contextPrompt, /Provider switch: Codex -> Claude\./);
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
    const snapshot = await loadLocalSessions();

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

test("archived Composer sessions do not reload in workspace sessions", async () => {
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
          status: "archived",
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
    const snapshot = await loadLocalSessions();

    assert.deepEqual(Object.keys(snapshot.sessions), []);
    assert.deepEqual(snapshot.projects, []);
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
    const snapshot = await loadLocalSessions();
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

test("registered handoff sessions reload interleaved provider transcripts", async () => {
  await withTempHome(async ({ home }) => {
    const sourceCwd = "/tmp/source";
    const codexCwd = `${sourceCwd}/.composer/worktrees/repo/session/codex`;
    const claudeCwd = codexCwd;
    writeCodexSession(home, {
      sessionId: "codex-session",
      cwd: codexCwd,
      user: "explain this project",
      assistant: "Codex initial answer",
      startSecond: 0
    });
    writeClaudeSession(home, {
      sessionId: "claude-session",
      projectPath: `${home}/.claude/projects/-tmp-source--composer-worktrees-repo-session-codex`,
      cwd: claudeCwd,
      user: "what did codex do?",
      assistant: "Claude continued from Codex",
      startSecond: 4,
      handoffNoise: true
    });
    await writeRegistry({
      version: 1,
      sessions: [
        {
          id: "meta-live-test",
          title: "Explain project",
          sourceCwd,
          displayCwd: sourceCwd,
          activeCwd: claudeCwd,
          currentProvider: "claude",
          lastProvider: "claude",
          renderMode: "single",
          hybridMode: "handoff",
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:06.000Z"
        }
      ],
      providerSessions: [
        {
          composerSessionId: "meta-live-test",
          provider: "codex",
          providerSessionId: "codex-session",
          mode: "handoff",
          role: "handoff",
          lifecycle: "handoff",
          cwd: codexCwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:03.000Z"
        },
        {
          composerSessionId: "meta-live-test",
          provider: "claude",
          providerSessionId: "claude-session",
          mode: "handoff",
          role: "handoff",
          lifecycle: "handoff",
          cwd: claudeCwd,
          createdAt: "2026-05-23T00:00:04.000Z",
          updatedAt: "2026-05-23T00:00:06.000Z"
        }
      ],
      events: [
        {
          id: "attach-codex",
          composerSessionId: "meta-live-test",
          type: "provider_session_attached",
          provider: "codex",
          providerSessionId: "codex-session",
          timestamp: "2026-05-23T00:00:00.000Z",
          data: { mode: "handoff", role: "handoff", lifecycle: "handoff" }
        },
        {
          id: "attach-claude",
          composerSessionId: "meta-live-test",
          type: "provider_session_attached",
          provider: "claude",
          providerSessionId: "claude-session",
          timestamp: "2026-05-23T00:00:03.000Z",
          data: { mode: "handoff", role: "handoff", lifecycle: "handoff" }
        },
        {
          id: "attach-codex-repeat",
          composerSessionId: "meta-live-test",
          type: "provider_session_attached",
          provider: "codex",
          providerSessionId: "codex-session",
          timestamp: "2026-05-23T00:00:03.100Z",
          data: { mode: "handoff", role: "handoff", lifecycle: "handoff" }
        },
        {
          id: "attach-claude-repeat",
          composerSessionId: "meta-live-test",
          type: "provider_session_attached",
          provider: "claude",
          providerSessionId: "claude-session",
          timestamp: "2026-05-23T00:00:03.200Z",
          data: { mode: "handoff", role: "handoff", lifecycle: "handoff" }
        }
      ]
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const session = (await loadLocalSessions()).sessions["meta-live-test"];

    assert.equal(session.provider, "claude");
    assert.equal(session.renderMode, "single");
    assert.deepEqual(
      session.items.map((item) =>
        item.type === "tool_group" ? item.summary : item.body
      ),
      [
        "explain this project",
        "Codex initial answer",
        "Preparing handoff context for Claude",
        "what did codex do?",
        "Claude continued from Codex"
      ]
    );
    assert.equal(
      session.items.filter(
        (item) =>
          item.type === "tool_group" &&
          item.summary.startsWith("Preparing handoff context")
      ).length,
      1
    );
  });
});

test("registered handoff sessions backfill markers from provider records", async () => {
  await withTempHome(async ({ home }) => {
    const sourceCwd = "/tmp/source";
    const codexCwd = `${sourceCwd}/.composer/worktrees/repo/session/codex`;
    const claudeCwd = codexCwd;
    writeCodexSession(home, {
      sessionId: "codex-session",
      cwd: codexCwd,
      user: "explain this project",
      assistant: "Codex initial answer",
      startSecond: 0
    });
    writeClaudeSession(home, {
      sessionId: "claude-session",
      projectPath: `${home}/.claude/projects/-tmp-source--composer-worktrees-repo-session-codex`,
      cwd: claudeCwd,
      user: "what was done in this session?",
      assistant: "Claude answered from Codex handoff",
      startSecond: 4,
      handoffNoise: true
    });
    writeCodexSession(home, {
      sessionId: "codex-session-followup",
      cwd: codexCwd,
      user: "what did claude do?",
      assistant: "Codex answered from Claude handoff",
      startSecond: 12
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
          hybridMode: "handoff",
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:14.000Z"
        }
      ],
      providerSessions: [
        {
          composerSessionId: "meta-live-test",
          provider: "codex",
          providerSessionId: "codex-session",
          mode: "handoff",
          role: "handoff",
          lifecycle: "handoff",
          cwd: codexCwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:03.000Z"
        },
        {
          composerSessionId: "meta-live-test",
          provider: "claude",
          providerSessionId: "claude-session",
          mode: "handoff",
          role: "handoff",
          lifecycle: "handoff",
          cwd: claudeCwd,
          createdAt: "2026-05-23T00:00:04.000Z",
          updatedAt: "2026-05-23T00:00:11.000Z"
        },
        {
          composerSessionId: "meta-live-test",
          provider: "codex",
          providerSessionId: "codex-session-followup",
          mode: "handoff",
          role: "handoff",
          lifecycle: "handoff",
          cwd: codexCwd,
          createdAt: "2026-05-23T00:00:12.000Z",
          updatedAt: "2026-05-23T00:00:14.000Z"
        }
      ],
      events: [
        {
          id: "attach-codex",
          composerSessionId: "meta-live-test",
          type: "provider_session_attached",
          provider: "codex",
          providerSessionId: "codex-session",
          timestamp: "2026-05-23T00:00:00.000Z",
          data: { mode: "handoff", role: "handoff", lifecycle: "handoff" }
        },
        {
          id: "attach-codex-followup",
          composerSessionId: "meta-live-test",
          type: "provider_session_attached",
          provider: "codex",
          providerSessionId: "codex-session-followup",
          timestamp: "2026-05-23T00:00:12.000Z",
          data: { mode: "handoff", role: "handoff", lifecycle: "handoff" }
        }
      ]
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const session = (await loadLocalSessions()).sessions["meta-live-test"];

    assert.deepEqual(
      session.items.map((item) =>
        item.type === "tool_group" ? item.summary : item.body
      ),
      [
        "explain this project",
        "Codex initial answer",
        "Preparing handoff context for Claude",
        "what was done in this session?",
        "Claude answered from Codex handoff",
        "Preparing handoff context for Codex",
        "what did claude do?",
        "Codex answered from Claude handoff"
      ]
    );
  });
});

test("Claude array user content reloads as the first user message", async () => {
  await withTempHome(async ({ home }) => {
    const sessionId = "claude-array-session";
    const cwd = "/tmp/source";

    writeClaudeSession(home, {
      sessionId,
      projectPath: `${home}/.claude/projects/-tmp-source`,
      cwd,
      user: [
        {
          type: "text",
          text: [
            "Composer context packet.",
            "Session title: Explain project",
            "User request:",
            "What's this project about?"
          ].join("\n")
        }
      ],
      assistant: "Claude answer"
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const snapshot = await loadLocalSessions();
    const session = snapshot.sessions[`claude-${sessionId}`];

    assert.equal(session.items[0]?.type, "user_message");
    assert.equal(session.items[0]?.body, "What's this project about?");
    assert.equal(session.items[1]?.type, "assistant_message");
  });
});

test("Codex subagent sessions render under their parent thread", async () => {
  await withTempHome(async ({ home }) => {
    const cwd = "/tmp/source";
    writeCodexSession(home, {
      sessionId: "codex-parent",
      cwd,
      user: "Inspect this project",
      assistant: "Parent answer"
    });
    writeCodexSubagentSession(home, {
      sessionId: "codex-child",
      parentSessionId: "codex-parent",
      cwd,
      nickname: "Newton",
      role: "worker",
      user: "Explore the project structure",
      assistant: "Child answer"
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const snapshot = await loadLocalSessions();
    const child = snapshot.sessions["codex-codex-child"];
    const parentThread = snapshot.projects[0]?.threads.find(
      (thread) => thread.id === "codex-codex-parent"
    );

    assert.equal(child.parentSessionId, "codex-codex-parent");
    assert.equal(child.title, "Newton subagent");
    assert.equal(parentThread?.children?.[0]?.id, "codex-codex-child");
    assert.equal(parentThread.children[0].subagent.nickname, "Newton");
  });
});

test("self-parented Codex sessions render as root sessions", async () => {
  await withTempHome(async ({ home }) => {
    const cwd = "/tmp/source";
    writeCodexSubagentSession(home, {
      sessionId: "codex-self-parent",
      parentSessionId: "codex-self-parent",
      cwd,
      nickname: "Kant",
      role: "worker",
      user: "Coordinate this project",
      assistant: "Done"
    });

    const { loadLocalSessionList } = await import(
      "../dist-server/electron/session-loader.js"
    );
    const snapshot = await loadLocalSessionList();
    const session = snapshot.sessions["codex-codex-self-parent"];
    const projectThread = snapshot.projects[0]?.threads.find(
      (thread) => thread.id === "codex-codex-self-parent"
    );

    assert.equal(session.parentSessionId, undefined);
    assert.equal(session.subagent, undefined);
    assert.equal(projectThread?.id, "codex-codex-self-parent");
  });
});

test("Codex parent threads sort by newest child activity", async () => {
  await withTempHome(async ({ home }) => {
    const cwd = "/tmp/source";
    writeCodexSession(home, {
      sessionId: "codex-parent",
      cwd,
      user: "Parent task",
      assistant: "Parent answer",
      startSecond: 0
    });
    writeCodexSession(home, {
      sessionId: "codex-other",
      cwd,
      user: "Other task",
      assistant: "Other answer",
      startSecond: 5
    });
    writeCodexSubagentSession(home, {
      sessionId: "codex-child",
      parentSessionId: "codex-parent",
      cwd,
      nickname: "Newton",
      role: "worker",
      user: "Child task",
      assistant: "Child answer",
      startSecond: 10
    });

    const { loadLocalSessionList } = await import(
      "../dist-server/electron/session-loader.js"
    );
    const snapshot = await loadLocalSessionList();
    const project = snapshot.projects.find((candidate) => candidate.id === cwd);

    assert.equal(project?.threads[0]?.id, "codex-codex-parent");
    assert.equal(project?.threads[0]?.children?.[0]?.id, "codex-codex-child");
    assert.equal(project?.threads[1]?.id, "codex-codex-other");
  });
});

test("Codex standalone chat sessions do not render as project sessions", async () => {
  await withTempHome(async ({ home }) => {
    const chatCwd = path.join(
      home,
      "Documents",
      "Codex",
      "2026-05-23",
      "use-browser-use-to-go-and"
    );
    writeCodexSession(home, {
      sessionId: "codex-chat",
      cwd: chatCwd,
      user: "Delete a remote resource",
      assistant: "Done"
    });

    const { loadLocalSessions, loadLocalSessionList } = await import(
      "../dist-server/electron/session-loader.js"
    );

    assert.equal((await loadLocalSessions()).sessions["codex-codex-chat"], undefined);
    assert.equal((await loadLocalSessionList()).sessions["codex-codex-chat"], undefined);
  });
});

test("registered Codex standalone chat sessions do not render as project sessions", async () => {
  await withTempHome(async ({ home }) => {
    const chatCwd = path.join(
      home,
      "Documents",
      "Codex",
      "2026-05-23",
      "use-browser-use-to-go-and"
    );
    writeCodexSession(home, {
      sessionId: "codex-chat",
      cwd: chatCwd,
      user: "Delete a remote resource",
      assistant: "Done"
    });
    await writeRegistry({
      version: 1,
      sessions: [
        {
          id: "composer-chat",
          title: "Delete remote resource",
          sourceCwd: chatCwd,
          displayCwd: chatCwd,
          activeCwd: chatCwd,
          currentProvider: "codex",
          lastProvider: "codex",
          renderMode: "single",
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:02.000Z"
        }
      ],
      providerSessions: [
        {
          composerSessionId: "composer-chat",
          provider: "codex",
          providerSessionId: "codex-chat",
          role: "primary",
          lifecycle: "active",
          cwd: chatCwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:02.000Z"
        }
      ],
      events: []
    });

    const { loadLocalSessions, loadLocalSessionList } = await import(
      "../dist-server/electron/session-loader.js"
    );

    assert.equal((await loadLocalSessions()).sessions["composer-chat"], undefined);
    assert.equal((await loadLocalSessionList()).sessions["composer-chat"], undefined);
  });
});

test("Claude sidechain sessions render under their parent thread", async () => {
  await withTempHome(async ({ home }) => {
    const cwd = "/tmp/source";
    const projectPath = `${home}/.claude/projects/-tmp-source`;
    writeClaudeSession(home, {
      sessionId: "claude-parent",
      projectPath,
      cwd,
      user: "Inspect this project",
      assistant: "Parent answer"
    });
    writeClaudeSubagentSession({
      projectPath,
      parentSessionId: "claude-parent",
      agentId: "agent-a1",
      cwd,
      agentType: "Explore",
      user: "Explore the project structure",
      assistant: "Child answer"
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const snapshot = await loadLocalSessions();
    const child = snapshot.sessions["claude-agent-a1"];
    const parentThread = snapshot.projects[0]?.threads.find(
      (thread) => thread.id === "claude-claude-parent"
    );

    assert.equal(child.parentSessionId, "claude-claude-parent");
    assert.equal(child.title, "Explore subagent");
    assert.equal(parentThread?.children?.[0]?.id, "claude-agent-a1");
    assert.equal(parentThread.children[0].subagent.type, "Explore");
  });
});

test("registered Claude sidechain sessions keep native subagent metadata", async () => {
  await withTempHome(async ({ home }) => {
    const cwd = "/tmp/source";
    const projectPath = `${home}/.claude/projects/-tmp-source`;
    writeClaudeSession(home, {
      sessionId: "claude-parent",
      projectPath,
      cwd,
      user: "Inspect this project",
      assistant: "Parent answer"
    });
    writeClaudeSubagentSession({
      projectPath,
      parentSessionId: "claude-parent",
      agentId: "agent-a1",
      cwd,
      agentType: "Explore",
      user: "Explore the project structure",
      assistant: "Child answer"
    });
    await writeRegistry({
      version: 1,
      sessions: [
        {
          id: "composer-parent",
          title: "Inspect project",
          sourceCwd: cwd,
          displayCwd: cwd,
          activeCwd: cwd,
          currentProvider: "claude",
          lastProvider: "claude",
          renderMode: "single",
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:02.000Z"
        },
        {
          id: "composer-child",
          title: "Explore subagent",
          sourceCwd: cwd,
          displayCwd: cwd,
          activeCwd: cwd,
          currentProvider: "claude",
          lastProvider: "claude",
          renderMode: "single",
          createdAt: "2026-05-23T00:00:03.000Z",
          updatedAt: "2026-05-23T00:00:04.000Z"
        }
      ],
      providerSessions: [
        {
          composerSessionId: "composer-parent",
          provider: "claude",
          providerSessionId: "claude-parent",
          role: "primary",
          lifecycle: "active",
          cwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:02.000Z"
        },
        {
          composerSessionId: "composer-child",
          provider: "claude",
          providerSessionId: "agent-a1",
          role: "primary",
          lifecycle: "active",
          cwd,
          createdAt: "2026-05-23T00:00:03.000Z",
          updatedAt: "2026-05-23T00:00:04.000Z"
        }
      ],
      events: []
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const snapshot = await loadLocalSessions();
    const child = snapshot.sessions["composer-child"];
    const parentThread = snapshot.projects[0]?.threads.find(
      (thread) => thread.id === "composer-parent"
    );

    assert.equal(child.parentSessionId, "composer-parent");
    assert.equal(child.subagent.type, "Explore");
    assert.equal(parentThread?.children?.[0]?.id, "composer-child");
    assert.equal(parentThread.children[0].subagent.type, "Explore");
  });
});

test("registered Codex subagent sessions keep native subagent metadata", async () => {
  await withTempHome(async ({ home }) => {
    const cwd = "/tmp/source";
    writeCodexSession(home, {
      sessionId: "codex-parent",
      cwd,
      user: "Inspect this project",
      assistant: "Parent answer"
    });
    writeCodexSubagentSession(home, {
      sessionId: "codex-child",
      parentSessionId: "codex-parent",
      cwd,
      nickname: "Newton",
      role: "worker",
      user: "Explore the project structure",
      assistant: "Child answer"
    });
    await writeRegistry({
      version: 1,
      sessions: [
        {
          id: "composer-parent",
          title: "Inspect project",
          sourceCwd: cwd,
          displayCwd: cwd,
          activeCwd: cwd,
          currentProvider: "codex",
          lastProvider: "codex",
          renderMode: "single",
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:02.000Z"
        },
        {
          id: "composer-child",
          title: "Newton subagent",
          sourceCwd: cwd,
          displayCwd: cwd,
          activeCwd: cwd,
          currentProvider: "codex",
          lastProvider: "codex",
          renderMode: "single",
          createdAt: "2026-05-23T00:00:03.000Z",
          updatedAt: "2026-05-23T00:00:04.000Z"
        }
      ],
      providerSessions: [
        {
          composerSessionId: "composer-parent",
          provider: "codex",
          providerSessionId: "codex-parent",
          role: "primary",
          lifecycle: "active",
          cwd,
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:00:02.000Z"
        },
        {
          composerSessionId: "composer-child",
          provider: "codex",
          providerSessionId: "codex-child",
          role: "primary",
          lifecycle: "active",
          cwd,
          createdAt: "2026-05-23T00:00:03.000Z",
          updatedAt: "2026-05-23T00:00:04.000Z"
        }
      ],
      events: []
    });

    const { loadLocalSessions } = await import("../dist-server/electron/session-loader.js");
    const snapshot = await loadLocalSessions();
    const child = snapshot.sessions["composer-child"];
    const parentThread = snapshot.projects[0]?.threads.find(
      (thread) => thread.id === "composer-parent"
    );

    assert.equal(child.parentSessionId, "composer-parent");
    assert.equal(child.subagent.nickname, "Newton");
    assert.equal(child.subagent.role, "worker");
    assert.equal(parentThread?.children?.[0]?.id, "composer-child");
    assert.equal(parentThread.children[0].subagent.nickname, "Newton");
  });
});

test("runtime detects and refreshes local subagent sessions during a parent run", async () => {
  const { AgentRuntime } = await import("../dist-server/server/runtime.js");
  const parentSession = {
    id: "composer-parent",
    provider: "codex",
    providerSessionId: "codex-parent",
    providerSessions: {
      codex: {
        sessionId: "codex-parent",
        cwd: "/tmp/source"
      }
    },
    renderMode: "single",
    contentLoaded: true,
    runtimeStatus: "idle",
    title: "Inspect project",
    cwd: "/tmp/source",
    model: "GPT-5.4 Medium",
    updatedAt: "2026-05-23T00:00:00.000Z",
    items: [],
    pendingItems: []
  };
  let exposeChild = false;
  let childBody = "Initial child answer";
  const childMetadata = {
    id: "codex-codex-child",
    provider: "codex",
    providerSessionId: "codex-child",
    renderMode: "single",
    parentSessionId: "codex-codex-parent",
    subagent: {
      nickname: "Newton",
      role: "worker"
    },
    contentLoaded: false,
    runtimeStatus: "idle",
    title: "Newton subagent",
    cwd: "/tmp/source",
    updatedAt: "2026-05-23T00:00:01.000Z",
    items: [],
    pendingItems: []
  };
  const idleSiblingMetadata = {
    id: "codex-codex-idle-sibling",
    provider: "codex",
    providerSessionId: "codex-idle-sibling",
    renderMode: "single",
    parentSessionId: "codex-codex-parent",
    subagent: {
      nickname: "Curie",
      role: "worker"
    },
    contentLoaded: false,
    runtimeStatus: "idle",
    title: "Curie subagent",
    cwd: "/tmp/source",
    updatedAt: "2026-05-23T00:00:01.000Z",
    items: [],
    pendingItems: []
  };
  const childSession = () => ({
    ...childMetadata,
    contentLoaded: true,
    runtimeStatus: "running",
    updatedAt:
      childBody === "Updated child answer"
        ? "2026-05-23T00:00:03.000Z"
        : "2026-05-23T00:00:02.000Z",
    items: [
      {
        id: "child-assistant",
        type: "assistant_message",
        body: childBody
      }
    ],
    pendingItems: []
  });
  const idleSiblingSession = () => ({
    ...idleSiblingMetadata,
    contentLoaded: true,
    runtimeStatus: "idle",
    items: [
      {
        id: "idle-sibling-assistant",
        type: "assistant_message",
        body: "Already finished"
      }
    ],
    pendingItems: []
  });
  const runtime = new AgentRuntime(
    {
      sessions: {
        "composer-parent": parentSession
      },
      projects: []
    },
    {
      localSessionPollIntervalMs: 5,
      loadSessionList: () => ({
        sessions: exposeChild
          ? {
              // The list walk derives updatedAt from the transcript file mtime
              // (session-loader isoFromMtime on the includeItems:false path), so
              // it advances whenever the subagent appends to its transcript —
              // mirror that here so the monitor's mtime gate sees the change.
              [childMetadata.id]: {
                ...childMetadata,
                updatedAt:
                  childBody === "Updated child answer"
                    ? "2026-05-23T00:00:03.000Z"
                    : "2026-05-23T00:00:02.000Z"
              },
              [idleSiblingMetadata.id]: idleSiblingMetadata
            }
          : {},
        projects: []
      }),
      loadSessionContent: (sessionId) =>
        sessionId === childMetadata.id
          ? childSession()
          : sessionId === idleSiblingMetadata.id
            ? idleSiblingSession()
            : undefined,
      providers: {
        codex: {
          async run(request) {
            exposeChild = true;
            await waitFor(() =>
              Boolean(runtime.snapshot().sessions[childMetadata.id])
            );
            childBody = "Updated child answer";
            await waitFor(() =>
              runtime.snapshot().sessions[childMetadata.id]?.items[0]?.type ===
                "assistant_message" &&
              runtime.snapshot().sessions[childMetadata.id]?.items[0]?.body ===
                "Updated child answer"
            );
            request.emit({
              id: "complete",
              type: "turn.completed",
              sessionId: request.sessionId,
              status: "idle"
            });
          },
          async compact() {
            return undefined;
          },
          async interrupt() {},
          dispose() {}
        }
      }
    }
  );

  const seenChildUpdates = [];
  const unsubscribe = runtime.onBroadcast((event) => {
    if (
      event.type === "session.updated" &&
      event.session.id === childMetadata.id
    ) {
      seenChildUpdates.push(event.session);
    }
  });

  try {
    runtime.sendMessage(
      {
        sessionId: "composer-parent",
        provider: "codex",
        prompt: "Run subagent",
        settings: {
          permissionMode: "Full access",
          intelligence: "Medium",
          model: "gpt-5.5"
        }
      },
      () => {}
    );

    await waitFor(() =>
      seenChildUpdates.some(
        (session) =>
          session.parentSessionId === "composer-parent" &&
          session.runtimeStatus === "running" &&
          session.items[0]?.type === "assistant_message" &&
          session.items[0]?.body === "Updated child answer"
      )
    );

    const child = runtime.snapshot().sessions[childMetadata.id];
    const idleSibling = runtime.snapshot().sessions[idleSiblingMetadata.id];

    assert.equal(child.parentSessionId, "composer-parent");
    assert.equal(child.subagent.nickname, "Newton");
    assert.equal(child.items[0].body, "Updated child answer");
    assert.equal(idleSibling.parentSessionId, "composer-parent");
    assert.equal(idleSibling.runtimeStatus, "idle");
    assert.equal(idleSibling.pendingItems.length, 0);
  } finally {
    unsubscribe();
    await runtime.dispose();
  }
});

test("local session list defers transcript content until selected", async () => {
  await withTempHome(async ({ home }) => {
    writeCodexSession(home, {
      sessionId: "codex-lazy",
      cwd: "/tmp/source",
      user: "Explain this project",
      assistant: "Lazy answer"
    });

    const { loadLocalSessionContent, loadLocalSessionList } = await import(
      "../dist-server/electron/session-loader.js"
    );
    const snapshot = await loadLocalSessionList();
    const listed = snapshot.sessions["codex-codex-lazy"];
    const loaded = await loadLocalSessionContent("codex-codex-lazy");

    assert.equal(listed.contentLoaded, false);
    assert.equal(listed.items.length, 0);
    assert.equal(snapshot.projects[0]?.threads[0]?.id, "codex-codex-lazy");
    assert.equal(loaded.contentLoaded, true);
    assert.equal(loaded.items[0]?.type, "user_message");
    assert.equal(loaded.items[1]?.type, "assistant_message");
  });
});

test("selected local session content is not truncated", async () => {
  await withTempHome(async ({ home }) => {
    writeCodexSession(home, {
      sessionId: "codex-long",
      cwd: "/tmp/source",
      user: "Summarize the project",
      assistant: "Initial answer",
      assistantMessageCount: 145
    });

    const { loadLocalSessionContent } = await import(
      "../dist-server/electron/session-loader.js"
    );
    const loaded = await loadLocalSessionContent("codex-codex-long");

    assert.equal(loaded.items.length, 146);
    assert.equal(
      loaded.items.some((item) =>
        item.type === "notice" &&
        item.label.includes("more transcript events hidden")
      ),
      false
    );
    assert.equal(loaded.items.at(-1)?.type, "assistant_message");
    assert.equal(loaded.items.at(-1)?.body, "Assistant answer 145");
  });
});

test("Claude tool results stay attached to their interleaved tool calls", async () => {
  await withTempHome(async ({ home }) => {
    const projectPath = `${home}/.claude/projects/-tmp-source`;
    const sessionId = "claude-interleaved";
    const cwd = "/tmp/source";
    const timestamp = (offset) =>
      new Date(Date.UTC(2026, 4, 23, 0, 0, offset)).toISOString();

    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, `${sessionId}.jsonl`),
      [
        {
          type: "user",
          sessionId,
          cwd,
          timestamp: timestamp(1),
          message: { role: "user", content: "implement this" }
        },
        {
          type: "assistant",
          sessionId,
          cwd,
          timestamp: timestamp(2),
          message: {
            role: "assistant",
            model: "claude-sonnet-4-6",
            content: [
              { type: "text", text: "I'll inspect first." },
              {
                type: "tool_use",
                id: "toolu_read",
                name: "Read",
                input: { file_path: "/tmp/source/src/App.tsx" }
              }
            ]
          }
        },
        {
          type: "user",
          sessionId,
          cwd,
          timestamp: timestamp(3),
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_read",
                content: "1\tconsole.log('app')"
              }
            ]
          }
        },
        {
          type: "assistant",
          sessionId,
          cwd,
          timestamp: timestamp(4),
          message: {
            role: "assistant",
            model: "claude-sonnet-4-6",
            content: [
              { type: "text", text: "Now I'll edit it." },
              {
                type: "tool_use",
                id: "toolu_edit",
                name: "Edit",
                input: {
                  file_path: "/tmp/source/src/App.tsx",
                  old_string: "app",
                  new_string: "updated"
                }
              }
            ]
          }
        },
        {
          type: "user",
          sessionId,
          cwd,
          timestamp: timestamp(5),
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_edit",
                content: "The file has been updated successfully."
              }
            ]
          }
        },
        {
          type: "assistant",
          sessionId,
          cwd,
          timestamp: timestamp(6),
          message: {
            role: "assistant",
            model: "claude-sonnet-4-6",
            content: [{ type: "text", text: "Done." }]
          }
        }
      ].map((row) => JSON.stringify(row)).join("\n") + "\n"
    );

    const { loadLocalSessionContent } = await import(
      "../dist-server/electron/session-loader.js"
    );
    const loaded = await loadLocalSessionContent(`claude-${sessionId}`);

    assert.equal(loaded.items.length, 6);
    assert.deepEqual(
      loaded.items.map((item) => item.type),
      [
        "user_message",
        "assistant_message",
        "tool_group",
        "assistant_message",
        "tool_group",
        "assistant_message"
      ]
    );
    assert.equal(loaded.items[2]?.details.length, 2);
    assert.equal(loaded.items[4]?.details.length, 2);
    assert.equal(loaded.items[3]?.body, "Now I'll edit it.");
    assert.equal(loaded.items[5]?.body, "Done.");
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

function writeCodexSession(
  home,
  {
    sessionId,
    cwd,
    user,
    assistant,
    startSecond = 0,
    assistantMessageCount = 1
  }
) {
  const dir = path.join(home, ".codex", "sessions", "2026", "05", "23");
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = (offset) =>
    new Date(Date.UTC(2026, 4, 23, 0, 0, startSecond + offset)).toISOString();

  fs.writeFileSync(
    path.join(
      dir,
      `rollout-2026-05-23T00-00-${String(startSecond).padStart(2, "0")}-${sessionId}.jsonl`
    ),
    [
      {
        type: "session_meta",
        timestamp: timestamp(0),
        payload: { id: sessionId, cwd }
      },
      {
        type: "event_msg",
        timestamp: timestamp(1),
        payload: { type: "user_message", message: user }
      },
      ...Array.from({ length: assistantMessageCount }, (_, index) => ({
        type: "response_item",
        timestamp: timestamp(2 + index),
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: index === 0 ? assistant : `Assistant answer ${index + 1}`
            }
          ]
        }
      }))
    ].map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

function writeCodexSubagentSession(
  home,
  {
    sessionId,
    parentSessionId,
    cwd,
    nickname,
    role,
    user,
    assistant,
    startSecond = 3
  }
) {
  const dir = path.join(home, ".codex", "sessions", "2026", "05", "23");
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = (offset) =>
    new Date(Date.UTC(2026, 4, 23, 0, 0, startSecond + offset)).toISOString();

  fs.writeFileSync(
    path.join(
      dir,
      `rollout-2026-05-23T00-00-${String(startSecond).padStart(2, "0")}-${sessionId}.jsonl`
    ),
    [
      {
        type: "session_meta",
        timestamp: timestamp(0),
        payload: {
          id: sessionId,
          cwd,
          thread_source: "subagent",
          agent_nickname: nickname,
          agent_role: role,
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: parentSessionId,
                depth: 1,
                agent_nickname: nickname,
                agent_role: role
              }
            }
          }
        }
      },
      {
        type: "event_msg",
        timestamp: timestamp(1),
        payload: { type: "user_message", message: user }
      },
      {
        type: "response_item",
        timestamp: timestamp(2),
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: assistant }]
        }
      }
    ].map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

function writeClaudeSession(
  home,
  {
    sessionId,
    projectPath,
    cwd,
    user,
    assistant,
    startSecond = 0,
    handoffNoise = false
  }
) {
  const timestamp = (offset) =>
    new Date(Date.UTC(2026, 4, 23, 0, 0, startSecond + offset)).toISOString();
  const hiddenRows = handoffNoise
    ? [
        {
          type: "user",
          sessionId,
          cwd,
          timestamp: timestamp(1),
          message: {
            role: "user",
            content:
              "<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to.</local-command-caveat>"
          }
        },
        {
          type: "user",
          sessionId,
          cwd,
          timestamp: timestamp(2),
          message: {
            role: "user",
            content:
              "<command-name>/compact</command-name> <command-message>compact</command-message> <command-args>Prepare this Claude Code session for a Composer multi-provider handoff. Preserve the session goal, current user intent, important decisions, files changed, commands and tests run, unresolved risks, and what the next provider must know. Reason: handoff from Claude to Codex.</command-args>"
          }
        },
        {
          type: "assistant",
          sessionId,
          cwd,
          timestamp: timestamp(3),
          message: {
            role: "assistant",
            model: "claude-sonnet-4-6",
            content: [
              {
                type: "text",
                text:
                  "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation. Summary:\n\nHidden handoff details"
              }
            ]
          }
        },
        {
          type: "user",
          sessionId,
          cwd,
          timestamp: timestamp(4),
          message: {
            role: "user",
            content:
              "<local-command-stdout>Compacted PostCompact [callback] completed successfully</local-command-stdout>"
          }
        }
      ]
    : [];
  const visibleStart = handoffNoise ? 5 : 1;

  fs.mkdirSync(projectPath, { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, `${sessionId}.jsonl`),
    [
      ...hiddenRows,
      {
        type: "user",
        sessionId,
        cwd,
        timestamp: timestamp(visibleStart),
        message: { role: "user", content: user }
      },
      {
        type: "assistant",
        sessionId,
        cwd,
        timestamp: timestamp(visibleStart + 1),
        message: {
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: assistant }]
        }
      }
    ].map((row) => JSON.stringify(row)).join("\n") + "\n"
  );
}

function writeClaudeSubagentSession({
  projectPath,
  parentSessionId,
  agentId,
  cwd,
  agentType,
  user,
  assistant
}) {
  const dir = path.join(projectPath, parentSessionId, "subagents");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${agentId}.jsonl`),
    [
      {
        type: "user",
        isSidechain: true,
        agentId,
        sessionId: parentSessionId,
        cwd,
        timestamp: "2026-05-23T00:00:03.000Z",
        message: { role: "user", content: user }
      },
      {
        type: "assistant",
        isSidechain: true,
        agentId,
        attributionAgent: agentType,
        sessionId: parentSessionId,
        cwd,
        timestamp: "2026-05-23T00:00:04.000Z",
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

async function waitFor(predicate, timeoutMs = 1_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition");
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
