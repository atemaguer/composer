import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Regression: Claude thinking blocks render as ordinary assistant_message text.
// Because an assistant_message sits between tool calls, the renderer's
// consecutive-tool grouping no longer merges reasoning-separated calls into one
// group — while a rapid burst with no reasoning between stays consecutive.

function row(obj) {
  return JSON.stringify(obj);
}

function assistant(blocks, ts) {
  return row({ type: "assistant", timestamp: ts, message: { role: "assistant", content: blocks } });
}

function user(blocks, ts) {
  return row({ type: "user", timestamp: ts, message: { role: "user", content: blocks } });
}

function toolUse(id, name) {
  return { type: "tool_use", id, name, input: { path: `/x/${id}` } };
}

function toolResult(id) {
  return { type: "tool_result", tool_use_id: id, content: `output for ${id}` };
}

test("Claude parser renders thinking as assistant text between tool calls", async () => {
  const { parseClaudeSession } = await import(
    "../../../packages/composer-runtime/dist/session-loader/claude-adapter.js"
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-grouping-"));
  const file = path.join(dir, "11111111-2222-3333-4444-555555555555.jsonl");

  // user -> thinking -> Glob -> Read (no reasoning between Glob/Read) ->
  // thinking -> Bash -> text. The Glob+Read are a rapid burst; Bash follows a
  // reasoning step.
  const lines = [
    user([{ type: "text", text: "What is this project?" }], "2026-06-02T00:00:00.000Z"),
    assistant([{ type: "thinking", thinking: "Let me look around." }], "2026-06-02T00:00:01.000Z"),
    assistant([toolUse("call-glob", "Glob")], "2026-06-02T00:00:02.000Z"),
    user([toolResult("call-glob")], "2026-06-02T00:00:02.100Z"),
    assistant([toolUse("call-read", "Read")], "2026-06-02T00:00:03.000Z"),
    user([toolResult("call-read")], "2026-06-02T00:00:03.100Z"),
    assistant([{ type: "thinking", thinking: "Now check the build." }], "2026-06-02T00:00:04.000Z"),
    assistant([toolUse("call-bash", "Bash")], "2026-06-02T00:00:05.000Z"),
    user([toolResult("call-bash")], "2026-06-02T00:00:05.100Z"),
    assistant([{ type: "text", text: "It's a Todo app." }], "2026-06-02T00:00:06.000Z")
  ];

  try {
    fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
    const session = await parseClaudeSession(file, { includeItems: true });
    const items = session?.items ?? [];
    const types = items.map((i) => i.type);

    // Thinking → assistant_message; one sits between Read and Bash, but
    // Glob→Read (no thinking between) stay consecutive so the renderer keeps
    // them in one group. The trailing answer is also an assistant_message.
    assert.deepEqual(types, [
      "user_message",
      "assistant_message", // thinking #1
      "tool_group", // Glob
      "tool_group", // Read (consecutive with Glob — same group)
      "assistant_message", // thinking #2
      "tool_group", // Bash (separated by assistant text — its own group)
      "assistant_message" // the answer
    ]);

    // The thinking content is preserved verbatim as assistant text.
    assert.match(items[1].body, /look around/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
