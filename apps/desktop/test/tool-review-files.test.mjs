import assert from "node:assert/strict";
import test from "node:test";

const {
  patchReviewLabel,
  reviewFilesFromToolCall
} = await import("../../../packages/composer-runtime/dist/patch-review.js");

test("Claude Write tool input maps to an added review file", () => {
  const files = reviewFilesFromToolCall("Write", {
    file_path: "/tmp/example.ts",
    content: "export const value = 1;\n"
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].path, "/tmp/example.ts");
  assert.equal(files[0].status, "added");
  assert.equal(files[0].additions, 1);
  assert.equal(files[0].deletions, 0);
  assert.equal(files[0].hunks[0].lines[0].kind, "add");
  assert.equal(files[0].hunks[0].lines[0].content, "export const value = 1;");
  assert.equal(patchReviewLabel(files), "Edited example.ts");
});

test("Claude Edit tool input maps old and new strings to a modified review file", () => {
  const files = reviewFilesFromToolCall("Edit", {
    file_path: "src/example.ts",
    old_string: "const value = 1;",
    new_string: "const value = 2;"
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].path, "src/example.ts");
  assert.equal(files[0].status, "modified");
  assert.equal(files[0].additions, 1);
  assert.equal(files[0].deletions, 1);
  assert.deepEqual(files[0].hunks[0].lines, [
    {
      kind: "delete",
      oldLine: 1,
      newLine: null,
      content: "const value = 1;"
    },
    {
      kind: "add",
      oldLine: null,
      newLine: 1,
      content: "const value = 2;"
    }
  ]);
});

test("Claude MultiEdit tool input maps each edit to a review hunk", () => {
  const files = reviewFilesFromToolCall("MultiEdit", {
    file_path: "src/example.ts",
    edits: [
      {
        old_string: "const one = 1;",
        new_string: "const one = 11;"
      },
      {
        old_string: "const two = 2;",
        new_string: "const two = 22;"
      }
    ]
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].hunks.length, 2);
  assert.equal(files[0].additions, 2);
  assert.equal(files[0].deletions, 2);
  assert.equal(files[0].hunks[1].oldStart, 2);
  assert.equal(files[0].hunks[1].newStart, 2);
});

test("Codex file_change records still map through the shared review file path", () => {
  const files = reviewFilesFromToolCall("file_change", {
    type: "file_change",
    changes: [
      {
        path: "src/example.ts",
        type: "modify",
        unified_diff: [
          "@@ -1 +1 @@",
          "-const value = 1;",
          "+const value = 2;"
        ].join("\n")
      }
    ]
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].path, "src/example.ts");
  assert.equal(files[0].additions, 1);
  assert.equal(files[0].deletions, 1);
});
