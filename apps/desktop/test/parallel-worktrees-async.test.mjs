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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "composer-parallel-async-"));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  run("git", ["init"], repo);
  run("git", ["config", "user.email", "composer@example.test"], repo);
  run("git", ["config", "user.name", "Composer Test"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
  run("git", ["add", "README.md"], repo);
  run("git", ["commit", "-m", "initial"], repo);
  return { root, repo, home };
}

test("createCodexParallelWorktree returns a promise (async, non-blocking git)", async () => {
  const { root, repo, home } = makeRepo();
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = home;
    const { createCodexParallelWorktree } = await import(
      "../dist-server/server/parallel-worktrees.js"
    );

    const pending = createCodexParallelWorktree({
      baseCwd: repo,
      parentSessionId: "session/async"
    });

    // The whole point of the async conversion: this must be awaitable, not a
    // synchronous (event-loop-blocking) return value.
    assert.equal(typeof pending.then, "function");

    const worktree = await pending;
    assert.equal(worktree.provider, "codex");
    assert.equal(
      run("git", ["rev-parse", "--is-inside-work-tree"], worktree.cwd),
      "true"
    );
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("createCodexParallelWorktree reuses an existing worktree when provided", async () => {
  const { root, repo, home } = makeRepo();
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = home;
    const { createCodexParallelWorktree } = await import(
      "../dist-server/server/parallel-worktrees.js"
    );

    const first = await createCodexParallelWorktree({
      baseCwd: repo,
      parentSessionId: "session/reuse"
    });

    const second = await createCodexParallelWorktree({
      baseCwd: repo,
      parentSessionId: "session/reuse",
      existing: { codex: first.cwd }
    });

    // A valid existing worktree should be reused, not recreated.
    assert.equal(second.cwd, first.cwd);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
