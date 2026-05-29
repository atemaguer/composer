import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("shared runtime store lets one interface continue another interface session", async () => {
  await withTemporaryHome(async () => {
    const {
      AgentRuntime,
      loadLocalSessions,
      localRuntimePersistence,
      readComposerSessionRegistry
    } = await import("@composer/runtime");

    const firstProvider = createFakeProvider("first-provider-session");
    const firstRuntime = new AgentRuntime(await loadLocalSessions(), {
      persistence: localRuntimePersistence,
      providers: { codex: firstProvider.provider }
    });

    firstRuntime.createSession({
      provider: "codex",
      prompt: "start this in desktop",
      cwd: process.cwd(),
      settings: {
        permissionMode: "Full access",
        intelligence: "Medium",
        model: "gpt-5.5"
      }
    }, () => {});

    await firstProvider.waitForRuns(1);
    const [sessionId] = Object.keys(firstRuntime.snapshot().sessions);
    assert.ok(sessionId);

    await waitFor(() =>
      readComposerSessionRegistry().providerSessions.some((session) =>
        session.composerSessionId === sessionId &&
        session.provider === "codex" &&
        session.providerSessionId === "first-provider-session"
      )
    );
    const registry = readComposerSessionRegistry();
    assert.equal(registry.sessions.some((session) => session.id === sessionId), true);
    assert.equal(
      registry.providerSessions.some((session) =>
        session.composerSessionId === sessionId &&
        session.provider === "codex" &&
        session.providerSessionId === "first-provider-session"
      ),
      true
    );

    const loaded = await loadLocalSessions();
    assert.ok(loaded.sessions[sessionId], "second interface can load the shared session");

    const secondProvider = createFakeProvider("second-provider-session");
    const secondRuntime = new AgentRuntime(loaded, {
      persistence: localRuntimePersistence,
      providers: { codex: secondProvider.provider }
    });

    secondRuntime.sendMessage({
      sessionId,
      provider: "codex",
      prompt: "continue this in cli",
      cwd: process.cwd(),
      settings: {
        permissionMode: "Full access",
        intelligence: "Medium",
        model: "gpt-5.5"
      }
    }, () => {});

    await secondProvider.waitForRuns(1);
    assert.equal(secondProvider.prompts[0], "continue this in cli");

    await waitFor(() =>
      readComposerSessionRegistry().providerSessions.some((session) =>
        session.composerSessionId === sessionId &&
        session.provider === "codex" &&
        session.providerSessionId === "second-provider-session"
      )
    );
    const continuedRegistry = readComposerSessionRegistry();
    assert.equal(
      continuedRegistry.providerSessions.some((session) =>
        session.composerSessionId === sessionId &&
        session.provider === "codex" &&
        session.providerSessionId === "second-provider-session"
      ),
      true
    );
  });
});

function createFakeProvider(providerSessionId) {
  const prompts = [];
  let runCount = 0;
  const waiters = [];

  const notify = () => {
    for (const waiter of waiters.splice(0)) {
      waiter();
    }
  };

  return {
    prompts,
    provider: {
      async run(request) {
        prompts.push(request.prompt);
        request.session.providerSessionId = providerSessionId;
        request.emit({
          id: `${providerSessionId}-turn-started`,
          type: "turn.started",
          sessionId: request.sessionId,
          turnId: `${providerSessionId}-turn`,
          label: "Fake provider running"
        });
        request.emit({
          id: `${providerSessionId}-message`,
          type: "message.completed",
          sessionId: request.sessionId,
          messageId: `${providerSessionId}-message`,
          body: `handled ${request.prompt}`
        });
        request.emit({
          id: `${providerSessionId}-turn-completed`,
          type: "turn.completed",
          sessionId: request.sessionId,
          status: "idle"
        });
        runCount += 1;
        notify();
      },
      async interrupt() {},
      dispose() {}
    },
    waitForRuns(expected) {
      if (runCount >= expected) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timed out waiting for ${expected} fake provider runs`));
        }, 1_000);
        waiters.push(() => {
          if (runCount >= expected) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    }
  };
}

async function withTemporaryHome(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "composer-shared-runtime-"));
  const home = path.join(root, "home");
  const originalHome = process.env.HOME;

  try {
    fs.mkdirSync(home, { recursive: true });
    process.env.HOME = home;
    await callback(home);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function waitFor(predicate) {
  const started = Date.now();

  while (Date.now() - started < 1_000) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for condition");
}
