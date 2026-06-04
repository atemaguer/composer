import assert from "node:assert/strict";
import test from "node:test";

// A clarifying question (AskUserQuestion / request_user_input) must surface as
// the session's pendingQuestion, pause the turn, deliver the user's selection
// back to the provider, and then clear.

const SETTINGS = {
  permissionMode: "Full access",
  intelligence: "Medium",
  model: "claude-sonnet-4-6"
};

function seededSession(id) {
  return {
    id,
    provider: "claude",
    renderMode: "single",
    providerSessions: {},
    contextVersion: 0,
    runtimeStatus: "idle",
    title: "Question test",
    cwd: process.cwd(),
    contentLoaded: true,
    items: [],
    pendingItems: []
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function waitFor(predicate, ms = 2000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Timed out waiting for condition");
}

test("a clarifying question round-trips to pendingQuestion and back", async () => {
  const { AgentRuntime } = await import("@composer/runtime");

  let receivedAnswers = null;
  const provider = {
    async run(req) {
      req.emit({
        id: "started",
        type: "turn.started",
        sessionId: req.sessionId,
        turnId: "qt",
        label: "working"
      });
      receivedAnswers = await req.askQuestion({
        provider: "claude",
        sessionId: req.sessionId,
        turnId: "qt",
        questions: [
          {
            id: "q1",
            question: "Which approach?",
            options: [{ label: "A" }, { label: "B" }]
          }
        ]
      });
      req.emit({
        id: "completed",
        type: "turn.completed",
        sessionId: req.sessionId,
        turnId: "qt",
        status: "idle"
      });
    },
    async interrupt() {},
    dispose() {}
  };

  const id = "claude-live-question";
  const runtime = new AgentRuntime(
    { sessions: { [id]: seededSession(id) }, projects: [] },
    { providers: { claude: provider } }
  );

  runtime.sendMessage(
    { sessionId: id, provider: "claude", prompt: "go", cwd: process.cwd(), settings: SETTINGS },
    () => {}
  );

  await waitFor(() => runtime.snapshot().sessions[id].pendingQuestion);
  const pending = runtime.snapshot().sessions[id].pendingQuestion;
  assert.equal(pending.questions[0].question, "Which approach?");
  assert.equal(
    runtime.snapshot().sessions[id].runtimeStatus,
    "awaiting_approval",
    "the turn pauses while the question is open"
  );

  runtime.resolveQuestion(pending.id, [{ questionId: "q1", selected: ["B"] }]);

  await waitFor(() => receivedAnswers !== null);
  assert.deepEqual(
    receivedAnswers,
    [{ questionId: "q1", selected: ["B"] }],
    "the provider receives the user's selection"
  );
  await tick();
  assert.equal(
    runtime.snapshot().sessions[id].pendingQuestion,
    undefined,
    "pendingQuestion clears once answered"
  );
});
