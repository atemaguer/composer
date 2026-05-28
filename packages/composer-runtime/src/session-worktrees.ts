import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type SessionWorktree = {
  cwd: string;
  branch: string;
  originalCwd: string;
  originalBranch?: string;
  originalHead?: string;
};

export function checkoutSessionBranch(cwd: string, branch?: string) {
  if (!branch) {
    return;
  }

  const gitRoot = git(cwd, ["rev-parse", "--show-toplevel"]);
  verifyLocalBranch(gitRoot, branch);
  git(gitRoot, ["checkout", branch]);
}

export function createSessionWorktree({
  baseCwd,
  baseBranch,
  sessionId
}: {
  baseCwd: string;
  baseBranch?: string;
  sessionId: string;
}): SessionWorktree {
  if (!isGitRepository(baseCwd)) {
    throw new Error("New worktree requires a git repository.");
  }

  const gitRoot = git(baseCwd, ["rev-parse", "--show-toplevel"]);
  const originalBranch = currentBranch(gitRoot);
  const originalHead = git(gitRoot, ["rev-parse", "HEAD"]);
  const branch = baseBranch ?? originalBranch;

  if (!branch) {
    throw new Error("Could not create worktree because the current checkout is detached.");
  }

  verifyLocalBranch(gitRoot, branch);

  const rootKey = `${path.basename(gitRoot)}-${hashText(gitRoot).slice(0, 10)}`;
  const sessionKey = safePathSegment(sessionId);
  const root = path.join(os.homedir(), ".composer", "worktrees", rootKey, sessionKey);
  const cwd = uniqueWorktreePath(path.join(root, "workspace"));
  const worktreeBranch = uniqueBranchName(
    gitRoot,
    `composer/${safePathSegment(branch).slice(0, 36)}-${sessionKey.slice(0, 24)}`
  );

  fs.mkdirSync(root, { recursive: true });
  git(gitRoot, ["worktree", "add", "-b", worktreeBranch, cwd, branch]);

  return {
    cwd,
    branch: worktreeBranch,
    originalCwd: gitRoot,
    originalBranch,
    originalHead
  };
}

function verifyLocalBranch(gitRoot: string, branch: string) {
  git(gitRoot, ["show-ref", "--verify", `refs/heads/${branch}`]);
}

function currentBranch(cwd: string) {
  try {
    return git(cwd, ["branch", "--show-current"]) || undefined;
  } catch {
    return undefined;
  }
}

function uniqueWorktreePath(basePath: string) {
  if (!fs.existsSync(basePath)) {
    return basePath;
  }

  for (let index = 1; index < 100; index += 1) {
    const candidate = `${basePath}-${index}`;

    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return `${basePath}-${Date.now()}`;
}

function uniqueBranchName(gitRoot: string, baseName: string) {
  if (!branchExists(gitRoot, baseName)) {
    return baseName;
  }

  for (let index = 1; index < 100; index += 1) {
    const candidate = `${baseName}-${index}`;

    if (!branchExists(gitRoot, candidate)) {
      return candidate;
    }
  }

  return `${baseName}-${Date.now()}`;
}

function branchExists(gitRoot: string, branch: string) {
  try {
    git(gitRoot, ["show-ref", "--verify", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

function isGitRepository(cwd: string) {
  try {
    git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

function git(cwd: string, args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(" ")} failed. ${message}`);
  }
}

function safePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96) || "session";
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
