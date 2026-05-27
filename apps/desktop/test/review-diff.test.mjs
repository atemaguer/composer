import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("review diff returns an empty non-git state outside git repositories", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "composer-review-non-git-"));

  try {
    const { loadReviewDiff } = await import("../dist-server/server/review-diff.js");
    const diff = await loadReviewDiff(cwd);

    assert.equal(diff.cwd, cwd);
    assert.equal(diff.gitAvailable, false);
    assert.equal(diff.raw, "");
    assert.equal(diff.additions, 0);
    assert.equal(diff.deletions, 0);
    assert.deepEqual(diff.files, []);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("review branches return an empty non-git state outside git repositories", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "composer-branches-non-git-"));

  try {
    const { loadReviewBranches } = await import("../dist-server/server/review-diff.js");
    const branches = await loadReviewBranches(cwd);

    assert.deepEqual(branches, {
      currentRef: "",
      defaultBaseRef: null,
      branches: [],
      gitAvailable: false
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
