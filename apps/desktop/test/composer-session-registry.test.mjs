import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const registryModuleUrl = new URL(
  "../dist-server/electron/composer-session-registry.js",
  import.meta.url
).href;
let importSerial = 0;

test("upsertComposerProviderSessions writes provider records that can be read", async () => {
  await withTemporaryHome(async (home) => {
    const { upsertComposerProviderSessions } = await importRegistryModule();

    upsertComposerProviderSessions([
      {
        composerSessionId: "composer-session-1",
        provider: "codex",
        providerSessionId: "codex-session-1",
        mode: "parallel-initial",
        role: "parallel-initial",
        cwd: "/tmp/worktrees/session/codex",
        lastContextVersion: 2
      },
      {
        composerSessionId: "composer-session-1",
        provider: "claude",
        providerSessionId: "claude-session-1",
        mode: "parallel-initial",
        role: "parallel-initial",
        cwd: "/tmp/worktrees/session/claude",
        lastContextVersion: 3
      }
    ]);

    const registryPath = path.join(home, ".composer", "state.sqlite");
    assert.equal(fs.existsSync(registryPath), true);

    const { readComposerSessionRegistry } = await importRegistryModule();
    const registry = readComposerSessionRegistry();

    assert.equal(registry.version, 1);
    assert.equal(registry.providerSessions.length, 2);
    assertProviderRecord(registry, "codex", {
      composerSessionId: "composer-session-1",
      providerSessionId: "codex-session-1",
      mode: "parallel-initial",
      role: "parallel-initial",
      lifecycle: "active",
      cwd: "/tmp/worktrees/session/codex",
      lastContextVersion: 2
    });
    assertProviderRecord(registry, "claude", {
      composerSessionId: "composer-session-1",
      providerSessionId: "claude-session-1",
      mode: "parallel-initial",
      role: "parallel-initial",
      lifecycle: "active",
      cwd: "/tmp/worktrees/session/claude",
      lastContextVersion: 3
    });
    assert.deepEqual(
      registry.events.map((event) => [
        event.type,
        event.provider,
        event.providerSessionId,
        event.data.lifecycle
      ]),
      [
        [
          "provider_session_attached",
          "codex",
          "codex-session-1",
          "active"
        ],
        [
          "provider_session_attached",
          "claude",
          "claude-session-1",
          "active"
        ]
      ]
    );
  });
});

test("adoptComposerParallelProvider adopts the chosen provider and discards the other parallel provider", async () => {
  await withTemporaryHome(async () => {
    const {
      adoptComposerParallelProvider,
      readComposerSessionRegistry,
      writeComposerSessionRegistry
    } = await importRegistryModule();
    const createdAt = "2026-05-23T20:00:00.000Z";

    writeComposerSessionRegistry({
      version: 1,
      sessions: [
        {
          id: "composer-session-2",
          currentProvider: "meta",
          lastProvider: "meta",
          renderMode: "hybrid",
          hybridMode: "parallel-initial",
          activeCwd: "/tmp/source",
          createdAt,
          updatedAt: createdAt
        }
      ],
      providerSessions: [
        {
          composerSessionId: "composer-session-2",
          provider: "codex",
          providerSessionId: "codex-session-2",
          mode: "parallel-initial",
          role: "parallel-initial",
          lifecycle: "active",
          cwd: "/tmp/worktrees/session/codex",
          createdAt,
          updatedAt: createdAt
        },
        {
          composerSessionId: "composer-session-2",
          provider: "claude",
          providerSessionId: "claude-session-2",
          mode: "parallel-initial",
          role: "parallel-initial",
          lifecycle: "active",
          cwd: "/tmp/worktrees/session/claude",
          createdAt,
          updatedAt: createdAt
        }
      ],
      events: []
    });

    adoptComposerParallelProvider({
      composerSessionId: "composer-session-2",
      provider: "codex",
      providerSessionId: "codex-session-2",
      activeCwd: "/tmp/worktrees/session/codex"
    });

    const registry = readComposerSessionRegistry();
    const session = registry.sessions.find(
      (record) => record.id === "composer-session-2"
    );

    assert.ok(session, "expected composer session to exist");
    assert.deepEqual(
      {
        currentProvider: session.currentProvider,
        lastProvider: session.lastProvider,
        renderMode: session.renderMode,
        parallelAdoptedProvider: session.parallelAdoptedProvider,
        activeCwd: session.activeCwd
      },
      {
        currentProvider: "codex",
        lastProvider: "codex",
        renderMode: "single",
        parallelAdoptedProvider: "codex",
        activeCwd: "/tmp/worktrees/session/codex"
      }
    );
    assertProviderRecord(registry, "codex", {
      providerSessionId: "codex-session-2",
      lifecycle: "adopted",
      cwd: "/tmp/worktrees/session/codex"
    });
    assertProviderRecord(registry, "claude", {
      providerSessionId: "claude-session-2",
      lifecycle: "discarded",
      cwd: "/tmp/worktrees/session/claude"
    });
    assert.equal(registry.events.at(-1).type, "parallel_provider_adopted");
    assert.equal(registry.events.at(-1).provider, "codex");
    assert.equal(registry.events.at(-1).providerSessionId, "codex-session-2");
  });
});

test("archiveComposerSession marks a registry session archived", async () => {
  await withTemporaryHome(async () => {
    const {
      archiveComposerSession,
      readComposerSessionRegistry,
      writeComposerSessionRegistry
    } = await importRegistryModule();
    const createdAt = "2026-05-23T20:00:00.000Z";

    writeComposerSessionRegistry({
      version: 1,
      sessions: [
        {
          id: "composer-session-3",
          currentProvider: "meta",
          lastProvider: "meta",
          renderMode: "hybrid",
          status: "idle",
          createdAt,
          updatedAt: createdAt
        }
      ],
      providerSessions: [],
      events: []
    });

    assert.equal(archiveComposerSession("composer-session-3"), true);

    const registry = readComposerSessionRegistry();
    const session = registry.sessions.find(
      (record) => record.id === "composer-session-3"
    );

    assert.equal(session.status, "archived");
    assert.equal(registry.events.at(-1).type, "session_archived");
    assert.deepEqual(registry.events.at(-1).data, { previousStatus: "idle" });
  });
});

test("provider session file metadata is stored outside transcript scans", async () => {
  await withTemporaryHome(async () => {
    const {
      deleteComposerProviderSessionFile,
      readComposerProviderSessionFile,
      upsertComposerProviderSessionFile,
      upsertComposerProviderSessionFiles
    } = await importRegistryModule();

    upsertComposerProviderSessionFile({
      provider: "codex",
      providerSessionId: "codex-session-file",
      filePath: "/tmp/.codex/sessions/codex-session-file.jsonl",
      fileMtimeMs: 1234.5,
      fileSizeBytes: 4096,
      cwd: "/tmp/source",
      title: "Cached transcript"
    });
    upsertComposerProviderSessionFiles([
      {
        provider: "claude",
        providerSessionId: "claude-session-file",
        filePath: "/tmp/.claude/projects/source/claude-session-file.jsonl"
      }
    ]);

    assert.deepEqual(
      pick(readComposerProviderSessionFile("codex", "codex-session-file"), [
        "provider",
        "providerSessionId",
        "filePath",
        "fileMtimeMs",
        "fileSizeBytes",
        "cwd",
        "title"
      ]),
      {
        provider: "codex",
        providerSessionId: "codex-session-file",
        filePath: "/tmp/.codex/sessions/codex-session-file.jsonl",
        fileMtimeMs: 1234.5,
        fileSizeBytes: 4096,
        cwd: "/tmp/source",
        title: "Cached transcript"
      }
    );
    assert.equal(
      readComposerProviderSessionFile("claude", "claude-session-file").filePath,
      "/tmp/.claude/projects/source/claude-session-file.jsonl"
    );

    deleteComposerProviderSessionFile("codex", "codex-session-file");

    assert.equal(
      readComposerProviderSessionFile("codex", "codex-session-file"),
      undefined
    );
  });
});

async function withTemporaryHome(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "composer-session-registry-"));
  const home = path.join(root, "home");
  const originalHome = process.env.HOME;

  try {
    fs.mkdirSync(home, { recursive: true });
    process.env.HOME = home;
    await callback(home);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function importRegistryModule() {
  return import(`${registryModuleUrl}?test=${importSerial++}`);
}

function assertProviderRecord(registry, provider, expected) {
  const record = registry.providerSessions.find(
    (candidate) => candidate.provider === provider
  );

  assert.ok(record, `expected ${provider} provider session to exist`);
  assert.deepEqual(pick(record, Object.keys(expected)), expected);
}

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}
