import assert from "node:assert/strict";
import test from "node:test";

// Verifies the runtime-level message queue: messages sent while a run is active
// are parked in a FIFO and drained one per turn completion; queued messages can
// be cancelled; and "steer" either injects via the provider (Codex turn/steer)
// or interrupts so the queue drains (Claude).

const SETTINGS = {
  permissionMode: "Full access",
  intelligence: "Medium",
  model: "gpt-5.5"
};

function seededSession(id) {
  return {
    id,
    provider: "codex",
    renderMode: "single",
    providerSessions: {},
    contextVersion: 0,
    runtimeStatus: "idle",
    title: "Queue test",
    cwd: process.cwd(),
    model: "gpt-5.5",
    contentLoaded: true,
    items: [],
    pendingItems: []
  };
}

// A provider whose turns stay open until the test completes them, so a second
// message can be queued behind the first.
function createControllableProvider({ steerable = false } = {}) {
  const prompts = [];
  const steered = [];
  const active = new Map();
  let seq = 0;

  const provider = {
    async run(request) {
      prompts.push(request.prompt);
      const turnId = `turn-${(seq += 1)}`;
      active.set(request.sessionId, { turnId, emit: request.emit });
      request.emit({
        id: `${turnId}-started`,
        type: "turn.started",
        sessionId: request.sessionId,
        turnId,
        label: "running"
      });
    },
    async interrupt(sessionId) {
      const current = active.get(sessionId);
      if (!current) {
        return;
      }
      // Real providers abort asynchronously, so the provider's turn.completed
      // lands AFTER the runtime's synthetic interrupt completion. Mimic that
      // ordering with a deferred (non-awaited) emit.
      active.delete(sessionId);
      queueMicrotask(() => {
        current.emit({
          id: `${current.turnId}-completed`,
          type: "turn.completed",
          sessionId,
          turnId: current.turnId,
          status: "idle"
        });
      });
    },
    dispose() {}
  };

  if (steerable) {
    provider.steer = async (_sessionId, input) => {
      steered.push(input.prompt);
      return true;
    };
  }

  return {
    provider,
    prompts,
    steered,
    completeActive(sessionId) {
      const current = active.get(sessionId);
      if (!current) {
        throw new Error("no active turn to complete");
      }
      active.delete(sessionId);
      current.emit({
        id: `${current.turnId}-completed`,
        type: "turn.completed",
        sessionId,
        turnId: current.turnId,
        status: "idle"
      });
    }
  };
}

async function makeRuntime(fake) {
  const { AgentRuntime } = await import("@composer/runtime");
  const id = "codex-live-queue";
  const runtime = new AgentRuntime(
    { sessions: { [id]: seededSession(id) }, projects: [] },
    { providers: { codex: fake.provider } }
  );
  return { runtime, id };
}

function send(runtime, id, prompt) {
  return runtime.sendMessage(
    { sessionId: id, provider: "codex", prompt, cwd: process.cwd(), settings: SETTINGS },
    () => {}
  );
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a message sent while running is queued, then drained on completion (FIFO)", async () => {
  const fake = createControllableProvider();
  const { runtime, id } = await makeRuntime(fake);

  await send(runtime, id, "first");
  await tick();
  assert.deepEqual(fake.prompts, ["first"], "first runs immediately");

  await send(runtime, id, "second");
  await send(runtime, id, "third");
  await tick();
  assert.deepEqual(fake.prompts, ["first"], "later messages are queued, not run");
  assert.deepEqual(
    runtime.snapshot().sessions[id].queuedMessages.map((m) => m.body),
    ["second", "third"]
  );

  fake.completeActive(id);
  await tick();
  assert.deepEqual(fake.prompts, ["first", "second"], "second drains on completion");
  assert.deepEqual(
    runtime.snapshot().sessions[id].queuedMessages.map((m) => m.body),
    ["third"]
  );

  fake.completeActive(id);
  await tick();
  assert.deepEqual(fake.prompts, ["first", "second", "third"], "third drains next");
  assert.equal(runtime.snapshot().sessions[id].queuedMessages.length, 0);
});

test("a queued message can be cancelled before it runs", async () => {
  const fake = createControllableProvider();
  const { runtime, id } = await makeRuntime(fake);

  await send(runtime, id, "first");
  await tick();
  await send(runtime, id, "second");
  await send(runtime, id, "third");
  await tick();

  const queued = runtime.snapshot().sessions[id].queuedMessages;
  const secondId = queued.find((m) => m.body === "second").id;
  runtime.cancelQueuedMessage(id, secondId);

  assert.deepEqual(
    runtime.snapshot().sessions[id].queuedMessages.map((m) => m.body),
    ["third"]
  );

  fake.completeActive(id);
  await tick();
  assert.deepEqual(fake.prompts, ["first", "third"], "cancelled message is skipped");
});

test("the queue can be reordered to reprioritize messages", async () => {
  const fake = createControllableProvider();
  const { runtime, id } = await makeRuntime(fake);

  await send(runtime, id, "first");
  await tick();
  await send(runtime, id, "second");
  await send(runtime, id, "third");
  await send(runtime, id, "fourth");
  await tick();

  const queued = runtime.snapshot().sessions[id].queuedMessages;
  const byBody = Object.fromEntries(queued.map((m) => [m.body, m.id]));
  // Move "fourth" to the front, ahead of second/third.
  runtime.reorderQueue(id, [byBody.fourth, byBody.second, byBody.third]);

  assert.deepEqual(
    runtime.snapshot().sessions[id].queuedMessages.map((m) => m.body),
    ["fourth", "second", "third"]
  );

  fake.completeActive(id);
  await tick();
  assert.deepEqual(fake.prompts, ["first", "fourth"], "reordered front drains first");
});

test("steer injects into the running turn when the provider supports it (Codex)", async () => {
  const fake = createControllableProvider({ steerable: true });
  const { runtime, id } = await makeRuntime(fake);

  await send(runtime, id, "first");
  await tick();
  await send(runtime, id, "second");
  await tick();

  await runtime.steer(id);
  await tick();

  assert.deepEqual(fake.steered, ["second"], "queued message is injected via steer");
  assert.deepEqual(fake.prompts, ["first"], "no new turn started — injected into current");
  assert.equal(runtime.snapshot().sessions[id].queuedMessages.length, 0, "queue drained");
  assert.ok(
    runtime.snapshot().sessions[id].items.some(
      (item) => item.type === "user_message" && item.body === "second"
    ),
    "steered message appears in the transcript"
  );
});

test("steer interrupts and drains when the provider has no steer (Claude path)", async () => {
  const fake = createControllableProvider(); // not steerable
  const { runtime, id } = await makeRuntime(fake);

  await send(runtime, id, "first");
  await tick();
  await send(runtime, id, "second");
  await tick();

  await runtime.steer(id);
  await tick();
  await tick();

  assert.deepEqual(fake.prompts, ["first", "second"], "interrupt drains the queued message");
  assert.equal(runtime.snapshot().sessions[id].queuedMessages.length, 0);
});
