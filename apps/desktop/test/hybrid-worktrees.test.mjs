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
    const snapshot = loadLocalSessions();

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
    const snapshot = loadLocalSessions();
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
    const snapshot = loadLocalSessions();
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
    const snapshot = loadLocalSessionList();
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
    const snapshot = loadLocalSessionList();
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

    assert.equal(loadLocalSessions().sessions["codex-codex-chat"], undefined);
    assert.equal(loadLocalSessionList().sessions["codex-codex-chat"], undefined);
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

    assert.equal(loadLocalSessions().sessions["composer-chat"], undefined);
    assert.equal(loadLocalSessionList().sessions["composer-chat"], undefined);
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
    const snapshot = loadLocalSessions();
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
    const snapshot = loadLocalSessions();
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
    const snapshot = loadLocalSessions();
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
              [childMetadata.id]: childMetadata,
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
          model: "gpt-5.4-codex"
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
    const snapshot = loadLocalSessionList();
    const listed = snapshot.sessions["codex-codex-lazy"];
    const loaded = loadLocalSessionContent("codex-codex-lazy");

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
    const loaded = loadLocalSessionContent("codex-codex-long");

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
