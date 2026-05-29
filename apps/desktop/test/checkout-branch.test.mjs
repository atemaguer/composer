import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

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

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "composer-checkout-"));
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  run("git", ["init", "-b", "main"], repo);
  run("git", ["config", "user.email", "composer@example.test"], repo);
  run("git", ["config", "user.name", "Composer Test"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
  run("git", ["add", "README.md"], repo);
  run("git", ["commit", "-m", "initial"], repo);
  run("git", ["branch", "feature"], repo);
  return { root, repo };
}

test("loadReviewBranches reports the uncommitted file count for the current branch", async () => {
  const { root, repo } = makeRepo();

  try {
    const { loadReviewBranches } = await import(
      "../dist-server/server/review-diff.js"
    );

    const clean = await loadReviewBranches(repo);
    assert.equal(clean.uncommittedCount, 0);

    // Introduce one tracked modification and one untracked file.
    fs.writeFileSync(path.join(repo, "README.md"), "# Test\nchanged\n");
    fs.writeFileSync(path.join(repo, "new.txt"), "new\n");

    const dirty = await loadReviewBranches(repo);
    assert.equal(dirty.uncommittedCount, 2);
    assert.equal(dirty.currentRef, "main");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkoutReviewBranch switches to a local branch and reports it as current", async () => {
  const { root, repo } = makeRepo();

  try {
    const { checkoutReviewBranch } = await import(
      "../dist-server/server/review-diff.js"
    );

    const result = await checkoutReviewBranch(repo, "feature");

    assert.equal(result.currentRef, "feature");
    assert.equal(run("git", ["branch", "--show-current"], repo), "feature");
    assert.equal(result.gitAvailable, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkoutReviewBranch surfaces a git error when the branch is used by another worktree", async () => {
  const { root, repo } = makeRepo();

  try {
    // Reproduce the reference scenario: 'feature' is checked out in a worktree,
    // so switching the main checkout to it must fail with a clear git error.
    const linkedWorktree = path.join(root, "linked");
    run("git", ["worktree", "add", linkedWorktree, "feature"], repo);

    const { checkoutReviewBranch } = await import(
      "../dist-server/server/review-diff.js"
    );

    await assert.rejects(
      () => checkoutReviewBranch(repo, "feature"),
      (error) => {
        assert.match(error.message, /already used by worktree/i);
        return true;
      }
    );

    // The original checkout was not changed by the failed switch.
    assert.equal(run("git", ["branch", "--show-current"], repo), "main");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
