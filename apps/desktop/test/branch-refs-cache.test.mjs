import assert from "node:assert/strict";
import test from "node:test";

const {
  BranchRefsCache,
  resolveCurrentBranchRef,
  resolveSelectedBranchRef,
  resolveBranchComparison,
  describeUncommitted,
  blockedBranchSwitchReason
} = await import("../dist-server/src/state/branch-refs-cache.js");

const gitData = {
  currentRef: "main",
  defaultBaseRef: "origin/main",
  gitAvailable: true,
  branches: [
    { name: "main", kind: "local" },
    { name: "feature", kind: "local" },
    { name: "origin/main", kind: "remote" }
  ]
};

test("BranchRefsCache stores and returns entries per workspace", () => {
  const cache = new BranchRefsCache();

  assert.equal(cache.has("/repo/a"), false);
  assert.equal(cache.get("/repo/a"), undefined);

  cache.set("/repo/a", gitData);

  assert.equal(cache.has("/repo/a"), true);
  assert.deepEqual(cache.get("/repo/a"), gitData);
  // a different workspace remains independent
  assert.equal(cache.has("/repo/b"), false);
});

test("BranchRefsCache delete and clear remove entries", () => {
  const cache = new BranchRefsCache();
  cache.set("/repo/a", gitData);
  cache.set("/repo/b", gitData);

  cache.delete("/repo/a");
  assert.equal(cache.has("/repo/a"), false);
  assert.equal(cache.has("/repo/b"), true);

  cache.clear();
  assert.equal(cache.has("/repo/b"), false);
});

test("resolveCurrentBranchRef returns the current ref, or null when git is unavailable", () => {
  assert.equal(resolveCurrentBranchRef(gitData), "main");
  assert.equal(
    resolveCurrentBranchRef({ ...gitData, gitAvailable: false }),
    null
  );
});

test("resolveSelectedBranchRef keeps a still-valid local selection", () => {
  assert.equal(resolveSelectedBranchRef("feature", gitData), "feature");
});

test("resolveSelectedBranchRef falls back to current ref when selection vanished", () => {
  // "deleted" is no longer in the branch list -> fall back to current ref
  assert.equal(resolveSelectedBranchRef("deleted", gitData), "main");
});

test("resolveSelectedBranchRef does not keep a remote ref selection", () => {
  // a remote-only ref is not a valid local selection -> fall back
  assert.equal(resolveSelectedBranchRef("origin/main", gitData), "main");
});

test("resolveSelectedBranchRef returns null when git is unavailable", () => {
  assert.equal(
    resolveSelectedBranchRef("feature", { ...gitData, gitAvailable: false }),
    null
  );
});

test("resolveBranchComparison preserves an existing comparison", () => {
  const existing = { headRef: "feature", baseRef: "main" };
  assert.deepEqual(resolveBranchComparison(existing, gitData), existing);
});

test("resolveBranchComparison derives from defaultBaseRef when none set", () => {
  assert.deepEqual(resolveBranchComparison(null, gitData), {
    headRef: "main",
    baseRef: "origin/main"
  });
});

test("resolveBranchComparison is null without a default base or git", () => {
  assert.equal(
    resolveBranchComparison(null, { ...gitData, defaultBaseRef: null }),
    null
  );
  assert.equal(
    resolveBranchComparison(null, { ...gitData, gitAvailable: false }),
    null
  );
});

test("describeUncommitted pluralizes and hides zero", () => {
  assert.equal(describeUncommitted(0), undefined);
  assert.equal(describeUncommitted(undefined), undefined);
  assert.equal(describeUncommitted(1), "Uncommitted: 1 file");
  assert.equal(describeUncommitted(3), "Uncommitted: 3 files");
});

test("blockedBranchSwitchReason allows switching with a clean tree", () => {
  assert.equal(blockedBranchSwitchReason("feature", "main", 0), null);
  assert.equal(blockedBranchSwitchReason("feature", "main", undefined), null);
});

test("blockedBranchSwitchReason blocks switching away from a dirty branch", () => {
  const reason = blockedBranchSwitchReason("feature", "main", 2);
  assert.match(reason, /2 uncommitted files/);
  assert.match(reason, /before switching branches/i);
});

test("blockedBranchSwitchReason allows re-selecting the current dirty branch", () => {
  assert.equal(blockedBranchSwitchReason("main", "main", 5), null);
});
