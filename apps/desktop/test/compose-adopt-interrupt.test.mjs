import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Stopping a parallel compose run mid-stream must finalize providerSessions so
// the user can adopt a thread to continue — even though the run only writes
// providerSessions after both delegates settle. The meta provider's interrupt()
// captures the delegates' (early-populated) providerSessionIds.

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "composer-compose-adopt-"));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  git(["init"], repo);
  git(["config", "user.email", "composer@example.test"], repo);
  git(["config", "user.name", "Composer Test"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
  git(["add", "README.md"], repo);
  git(["commit", "-m", "initial"], repo);
  return { root, repo, home };
}

async function waitFor(predicate, ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("Timed out waiting for condition");
}

test("interrupting a running parallel compose finalizes providerSessions for adoption", async () => {
  const { root, repo, home } = makeRepo();
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = home;
    const { MetaProvider } = await import("../dist-server/server/providers/meta.js");
    const provider = new MetaProvider();

    // Mock the delegate engines: each sets its providerSessionId early (as the
    // real codex/claude providers do on thread/session start) then never
    // completes — simulating both still streaming when the user hits Stop.
    const hang = new Promise(() => {});
    provider.codex.run = async (req) => {
      req.session.providerSessionId = "codex-thread-1";
      await hang;
    };
    provider.claude.run = async (req) => {
      req.session.providerSessionId = "claude-session-1";
      await hang;
    };
    provider.codex.interrupt = async () => {};
    provider.claude.interrupt = async () => {};

    const session = {
      id: "meta-live-compose",
      provider: "meta",
      renderMode: "hybrid",
      providerSessions: {},
      cwd: repo,
      items: [],
      pendingItems: []
    };

    void provider.run({
      sessionId: session.id,
      session,
      prompt: "build the thing",
      settings: {
        permissionMode: "Full access",
        intelligence: "Medium",
        model: "Compare agents"
      },
      emit: () => {},
      askApproval: async () => "accept"
    });

    // Both delegates have started and captured their providerSessionIds.
    await waitFor(() => {
      const active = provider.activeDelegates.get(session.id);
      return (
        active?.codex?.providerSessionId === "codex-thread-1" &&
        active?.claude?.providerSessionId === "claude-session-1"
      );
    });

    // Stop mid-run.
    await provider.interrupt(session.id);

    assert.equal(
      session.providerSessions.codex?.sessionId,
      "codex-thread-1",
      "codex thread is recorded for adoption"
    );
    assert.equal(
      session.providerSessions.claude?.sessionId,
      "claude-session-1",
      "claude thread is recorded for adoption"
    );
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
