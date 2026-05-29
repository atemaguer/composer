import assert from "node:assert/strict";
import test from "node:test";
import { parseDiffFromFile, parsePatchFiles } from "@pierre/diffs";

const {
  reconstructOldFileContent,
  reconstructReviewFileContents,
  reviewFileToPatch,
  reviewSideToAnnotationSide,
  annotationSideToReviewSide,
  reviewCommentsToAnnotations
} = await import("../dist-server/src/components/diff-view-data.js");

const modifiedFile = {
  path: "src/app.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
  hunks: [
    {
      header: "context",
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 3,
      lines: [
        { kind: "context", oldLine: 1, newLine: 1, content: "const a = 1;" },
        { kind: "delete", oldLine: 2, newLine: null, content: "const b = 2;" },
        { kind: "add", oldLine: null, newLine: 2, content: "const b = 3;" },
        { kind: "context", oldLine: 3, newLine: 3, content: "export { a };" }
      ]
    }
  ]
};

test("reviewFileToPatch reconstructs a valid unified patch for a modified file", () => {
  const patch = reviewFileToPatch(modifiedFile);
  assert.equal(
    patch,
    [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,3 +1,3 @@ context",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 3;",
      " export { a };",
      ""
    ].join("\n")
  );
});

test("reviewFileToPatch output is accepted by @pierre/diffs", () => {
  const parsed = parsePatchFiles(reviewFileToPatch(modifiedFile), undefined, true);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].files.length, 1);
  assert.equal(parsed[0].files[0].name, "src/app.ts");
  assert.equal(parsed[0].files[0].hunks.length, 1);
  assert.equal(parsed[0].files[0].hunks[0].hunkContext, "context");
});

test("reconstructOldFileContent rebuilds hidden context around hunks", () => {
  const oldContent = reconstructOldFileContent(modifiedFile, [
    "const a = 1;",
    "const b = 3;",
    "export { a };",
    "const c = 4;",
    ""
  ].join("\n"));

  assert.equal(oldContent, [
    "const a = 1;",
    "const b = 2;",
    "export { a };",
    "const c = 4;",
    ""
  ].join("\n"));
});

test("reconstructReviewFileContents preserves reviewed hunk lines over current file drift", () => {
  const contents = reconstructReviewFileContents(modifiedFile, [
    "const a = 1;",
    "const b = 99;",
    "export { a };",
    "const c = 4;",
    ""
  ].join("\n"));

  assert.equal(contents.oldContent, [
    "const a = 1;",
    "const b = 2;",
    "export { a };",
    "const c = 4;",
    ""
  ].join("\n"));
  assert.equal(contents.newContent, [
    "const a = 1;",
    "const b = 3;",
    "export { a };",
    "const c = 4;",
    ""
  ].join("\n"));
});

test("reconstructed contents create a non-partial @pierre/diffs file diff", () => {
  const contents = reconstructReviewFileContents(modifiedFile, [
    "const a = 1;",
    "const b = 3;",
    "export { a };",
    "const c = 4;",
    ""
  ].join("\n"));
  const fileDiff = parseDiffFromFile(
    { name: "src/app.ts", contents: contents.oldContent },
    { name: "src/app.ts", contents: contents.newContent },
    undefined,
    true
  );

  assert.equal(fileDiff.isPartial, false);
  assert.equal(fileDiff.additionLines.at(-1), "const c = 4;\n");
  assert.equal(fileDiff.deletionLines.at(-1), "const c = 4;\n");
});

test("reviewFileToPatch marks added files with /dev/null old side", () => {
  const patch = reviewFileToPatch({
    path: "new.ts",
    status: "added",
    additions: 1,
    deletions: 0,
    hunks: [
      {
        header: "",
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: "add", oldLine: null, newLine: 1, content: "hi" }]
      }
    ]
  });
  assert.match(patch, /^diff --git a\/new\.ts b\/new\.ts$/m);
  assert.match(patch, /^--- \/dev\/null$/m);
  assert.match(patch, /^\+\+\+ b\/new\.ts$/m);
  assert.match(patch, /^@@ -0,0 \+1 @@$/m);
  assert.match(patch, /^\+hi$/m);
});

test("reviewFileToPatch handles renames and binary files", () => {
  const renamed = reviewFileToPatch({
    path: "b.ts",
    oldPath: "a.ts",
    status: "renamed",
    additions: 0,
    deletions: 0,
    hunks: []
  });
  assert.match(renamed, /^rename from a\.ts$/m);
  assert.match(renamed, /^rename to b\.ts$/m);

  const binary = reviewFileToPatch({
    path: "img.png",
    status: "binary",
    additions: 0,
    deletions: 0,
    hunks: [],
    isBinary: true
  });
  assert.match(binary, /Binary files a\/img\.png and b\/img\.png differ/);
});

test("review side maps to annotation side and back", () => {
  assert.equal(reviewSideToAnnotationSide("L"), "deletions");
  assert.equal(reviewSideToAnnotationSide("R"), "additions");
  assert.equal(annotationSideToReviewSide("deletions"), "L");
  assert.equal(annotationSideToReviewSide("additions"), "R");
});

test("reviewCommentsToAnnotations filters by file and maps fields", () => {
  const comments = [
    { id: "1", filePath: "src/app.ts", lineNumber: 2, side: "R", body: "fix" },
    { id: "2", filePath: "other.ts", lineNumber: 5, side: "L", body: "nope" },
    { id: "3", filePath: "src/app.ts", lineNumber: 2, side: "L", body: "old" }
  ];

  const annotations = reviewCommentsToAnnotations(comments, "src/app.ts");

  assert.equal(annotations.length, 2);
  assert.deepEqual(annotations[0], {
    side: "additions",
    lineNumber: 2,
    metadata: comments[0]
  });
  assert.deepEqual(annotations[1], {
    side: "deletions",
    lineNumber: 2,
    metadata: comments[2]
  });
});
