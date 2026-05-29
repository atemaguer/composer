import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SessionWorktree = {
  cwd: string;
  branch: string;
  originalCwd: string;
  originalBranch?: string;
  originalHead?: string;
};

export async function checkoutSessionBranch(cwd: string, branch?: string) {
  if (!branch) {
    return;
  }

  const gitRoot = await git(cwd, ["rev-parse", "--show-toplevel"]);

  if ((await currentBranch(gitRoot)) === branch) {
    return;
  }

  await verifyLocalBranch(gitRoot, branch);

  try {
    await git(gitRoot, ["checkout", branch]);
  } catch (error) {
    if (await isWorkingTreeDirty(gitRoot)) {
      throw new Error(
        `Cannot switch to branch "${branch}" because the workspace has uncommitted changes. ` +
          "Commit or stash them, or start the session in a new worktree."
      );
    }

    throw error;
  }
}

export async function createSessionWorktree({
  baseCwd,
  baseBranch,
  sessionId
}: {
  baseCwd: string;
  baseBranch?: string;
  sessionId: string;
}): Promise<SessionWorktree> {
  if (!(await isGitRepository(baseCwd))) {
    throw new Error("New worktree requires a git repository.");
  }

  const gitRoot = await git(baseCwd, ["rev-parse", "--show-toplevel"]);
  const originalBranch = await currentBranch(gitRoot);
  const originalHead = await git(gitRoot, ["rev-parse", "HEAD"]);
  const branch = baseBranch ?? originalBranch;

  if (!branch) {
    throw new Error("Could not create worktree because the current checkout is detached.");
  }

  await verifyLocalBranch(gitRoot, branch);

  const rootKey = `${path.basename(gitRoot)}-${hashText(gitRoot).slice(0, 10)}`;
  const sessionKey = safePathSegment(sessionId);
  const root = path.join(os.homedir(), ".composer", "worktrees", rootKey, sessionKey);
  const cwd = uniqueWorktreePath(path.join(root, "workspace"));
  const worktreeBranch = await uniqueBranchName(
    gitRoot,
    `composer/${safePathSegment(branch).slice(0, 36)}-${sessionKey.slice(0, 24)}`
  );

  fs.mkdirSync(root, { recursive: true });
  await git(gitRoot, ["worktree", "add", "-b", worktreeBranch, cwd, branch]);

  return {
    cwd,
    branch: worktreeBranch,
    originalCwd: gitRoot,
    originalBranch,
    originalHead
  };
}

async function verifyLocalBranch(gitRoot: string, branch: string) {
  await git(gitRoot, ["show-ref", "--verify", `refs/heads/${branch}`]);
}

async function currentBranch(cwd: string) {
  try {
    return (await git(cwd, ["branch", "--show-current"])) || undefined;
  } catch {
    return undefined;
  }
}

async function isWorkingTreeDirty(gitRoot: string) {
  try {
    return (await git(gitRoot, ["status", "--porcelain"])).length > 0;
  } catch {
    return false;
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

async function uniqueBranchName(gitRoot: string, baseName: string) {
  if (!(await branchExists(gitRoot, baseName))) {
    return baseName;
  }

  for (let index = 1; index < 100; index += 1) {
    const candidate = `${baseName}-${index}`;

    if (!(await branchExists(gitRoot, candidate))) {
      return candidate;
    }
  }

  return `${baseName}-${Date.now()}`;
}

async function branchExists(gitRoot: string, branch: string) {
  try {
    await git(gitRoot, ["show-ref", "--verify", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepository(cwd: string) {
  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

async function git(cwd: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8"
    });
    return stdout.trim();
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
