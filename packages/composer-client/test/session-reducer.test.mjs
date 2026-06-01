import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyLiveSessionEvent,
  applyLiveSessionEvents,
  settleRunningToolGroups
} from "../dist/index.js";

function makeSession(overrides = {}) {
  return {
    id: "s1",
    provider: "claude",
    title: "Test session",
    items: [],
    pendingItems: [],
    ...overrides
  };
}

let eventSeq = 0;
function ev(event) {
  return { id: `evt-${eventSeq++}`, ...event };
}

const toolStarted = (toolId, label = "Tool") =>
  ev({ type: "tool.started", sessionId: "s1", toolId, label });
const toolCompleted = (toolId) =>
  ev({ type: "tool.completed", sessionId: "s1", toolId });
const turnCompleted = (status = "idle") =>
  ev({ type: "turn.completed", sessionId: "s1", status });
const errorEvent = (message = "boom") =>
  ev({ type: "error", sessionId: "s1", message });
const messageDelta = (messageId, delta) =>
  ev({ type: "message.delta", sessionId: "s1", messageId, delta });

function runningToolGroups(session) {
  return session.items.filter(
    (item) => item.type === "tool_group" && item.status === "running"
  );
}

function runningToolDetails(session) {
  return session.items
    .filter((item) => item.type === "tool_group")
    .flatMap((item) => item.details)
    .filter((detail) => detail.status === "running");
}

test("repeated tool.started does not create duplicate item ids", () => {
  let session = makeSession();
  session = applyLiveSessionEvent(session, toolStarted("tool-a"));
  session = applyLiveSessionEvent(session, toolStarted("tool-a"));
  session = applyLiveSessionEvent(session, toolStarted("tool-a"));

  const ids = session.items.map((item) => item.id);
  assert.deepEqual(ids, ["tool-a"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("a completed tool_group never reverts to running", () => {
  let session = makeSession();
  session = applyLiveSessionEvent(session, toolStarted("tool-a"));
  session = applyLiveSessionEvent(session, toolCompleted("tool-a"));

  const completed = session.items.find((item) => item.id === "tool-a");
  assert.equal(completed.status, "completed");

  // Re-issuing tool.started for the same id must NOT re-open it.
  session = applyLiveSessionEvent(session, toolStarted("tool-a"));
  const after = session.items.find((item) => item.id === "tool-a");
  assert.equal(after.status, "completed");
});

test("after turn.completed no tool_group or detail stays running", () => {
  let session = makeSession();
  session = applyLiveSessionEvent(session, toolStarted("tool-a"));
  session = applyLiveSessionEvent(session, toolStarted("tool-b"));
  // tool-b never gets a tool.completed (Claude-style missing completion).
  session = applyLiveSessionEvent(session, turnCompleted("idle"));

  assert.equal(runningToolGroups(session).length, 0);
  assert.equal(runningToolDetails(session).length, 0);
});

test("after error no tool_group or detail stays running (CLI bug guard)", () => {
  let session = makeSession();
  session = applyLiveSessionEvent(session, toolStarted("tool-a"));
  session = applyLiveSessionEvent(session, toolStarted("tool-b"));
  session = applyLiveSessionEvent(session, errorEvent("kaboom"));

  assert.equal(runningToolGroups(session).length, 0);
  assert.equal(runningToolDetails(session).length, 0);
  assert.equal(session.runtimeStatus, "error");
  assert.equal(session.pendingItems.length, 0);
});

test("error with errorNotice 'default' pushes a notice; 'none' does not", () => {
  let withNotice = makeSession();
  withNotice = applyLiveSessionEvent(withNotice, toolStarted("tool-a"));
  withNotice = applyLiveSessionEvent(withNotice, errorEvent("oops"));
  assert.equal(
    withNotice.items.filter((item) => item.type === "notice").length,
    1
  );

  let withoutNotice = makeSession();
  withoutNotice = applyLiveSessionEvent(withoutNotice, toolStarted("tool-a"));
  withoutNotice = applyLiveSessionEvent(withoutNotice, errorEvent("oops"), {
    errorNotice: "none"
  });
  assert.equal(
    withoutNotice.items.filter((item) => item.type === "notice").length,
    0
  );
  // status/pending/settle still happen in 'none' mode.
  assert.equal(withoutNotice.runtimeStatus, "error");
  assert.equal(runningToolGroups(withoutNotice).length, 0);
});

test("immutable:true does not mutate input session or its items array", () => {
  const session = makeSession();
  const originalItems = session.items;

  const result = applyLiveSessionEvent(session, toolStarted("tool-a"), {
    immutable: true
  });

  // Input untouched (referential and structural).
  assert.notEqual(result, session);
  assert.equal(session.items, originalItems);
  assert.equal(session.items.length, 0);
  assert.notEqual(result.items, session.items);
  assert.equal(result.items.length, 1);
});

test("immutable:false returns the SAME session reference and mutates it", () => {
  const session = makeSession();

  const result = applyLiveSessionEvent(session, toolStarted("tool-a"), {
    immutable: false
  });

  assert.equal(result, session);
  assert.equal(session.items.length, 1);
  assert.equal(session.items[0].id, "tool-a");
});

test("applyLiveSessionEvents folds equal to applying sequentially", () => {
  const a = toolStarted("tool-a");
  const b = toolStarted("tool-b");

  const folded = applyLiveSessionEvents(makeSession(), [a, b]);

  let stepwise = makeSession();
  stepwise = applyLiveSessionEvent(stepwise, a);
  stepwise = applyLiveSessionEvent(stepwise, b);

  // Ignore updatedAt timestamps which depend on wall clock.
  const strip = (s) => ({ ...s, updatedAt: undefined });
  assert.deepEqual(strip(folded), strip(stepwise));
});

test("two message.delta events equal one concatenated delta", () => {
  let split = makeSession();
  split = applyLiveSessionEvent(split, messageDelta("m1", "Hello, "));
  split = applyLiveSessionEvent(split, messageDelta("m1", "world"));

  let single = makeSession();
  single = applyLiveSessionEvent(single, messageDelta("m1", "Hello, world"));

  const bodyOf = (s) =>
    s.items.find((item) => item.id === "m1" && item.type === "assistant_message")
      .body;

  assert.equal(bodyOf(split), "Hello, world");
  assert.equal(bodyOf(split), bodyOf(single));
});

test("settleRunningToolGroups returns a new array and settles running groups", () => {
  const items = [
    {
      id: "tg",
      type: "tool_group",
      summary: "x",
      status: "running",
      details: [{ id: "d", label: "d", status: "running" }]
    }
  ];
  const settled = settleRunningToolGroups(items);
  assert.notEqual(settled, items);
  assert.equal(items[0].status, "running"); // input untouched
  assert.equal(settled[0].status, "completed");
  assert.equal(settled[0].details[0].status, "completed");
});
