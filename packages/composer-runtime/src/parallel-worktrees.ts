import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type DelegateProvider = "codex";

type ExistingWorktrees = Partial<Record<DelegateProvider, string>>;

export type ParallelDelegateWorktree = {
  provider: DelegateProvider;
  cwd: string;
};

export async function createCodexParallelWorktree({
  baseCwd,
  parentSessionId,
  existing
}: {
  baseCwd: string;
  parentSessionId: string;
  existing?: ExistingWorktrees;
}): Promise<ParallelDelegateWorktree> {
  const gitRoot = await ensureGitRepository(baseCwd);
  await git(gitRoot, ["rev-parse", "--verify", "HEAD"]);

  const rootKey = `${path.basename(gitRoot)}-${hashText(gitRoot).slice(0, 10)}`;
  const sessionKey = safePathSegment(parentSessionId);
  const root = path.join(os.homedir(), ".composer", "worktrees", rootKey, sessionKey);

  return ensureDelegateWorktree(gitRoot, root, "codex", existing?.codex);
}

async function ensureDelegateWorktree(
  gitRoot: string,
  root: string,
  provider: DelegateProvider,
  existingCwd?: string
): Promise<ParallelDelegateWorktree> {
  if (existingCwd && (await isGitWorktree(existingCwd))) {
    return { provider, cwd: existingCwd };
  }

  await fs.mkdir(root, { recursive: true });
  const cwd = await uniqueWorktreePath(path.join(root, provider));
  const baseBranch = (await currentBranch(gitRoot)) ?? "HEAD";
  const worktreeBranch = await uniqueBranchName(
    gitRoot,
    `composer/parallel-${provider}-${safePathSegment(path.basename(root)).slice(0, 48)}`
  );
  await git(gitRoot, ["worktree", "add", "-b", worktreeBranch, cwd, baseBranch]);

  return { provider, cwd };
}

async function ensureGitRepository(baseCwd: string) {
  const existingRoot = await gitOptional(baseCwd, ["rev-parse", "--show-toplevel"]);

  if (existingRoot) {
    if (!(await hasGitHead(existingRoot))) {
      await ensureMainBranch(existingRoot);
      await createBaselineCommit(existingRoot);
    }

    return existingRoot;
  }

  if (!(await pathExists(baseCwd))) {
    throw new Error(`Could not create isolated parallel worktree: ${baseCwd} does not exist.`);
  }

  await git(baseCwd, ["init"]);
  const gitRoot = await git(baseCwd, ["rev-parse", "--show-toplevel"]);
  await ensureMainBranch(gitRoot);
  await createBaselineCommit(gitRoot);

  return gitRoot;
}

async function hasGitHead(gitRoot: string) {
  return Boolean(await gitOptional(gitRoot, ["rev-parse", "--verify", "HEAD"]));
}

async function createBaselineCommit(gitRoot: string) {
  await ensureGitIdentity(gitRoot);
  await ensureInfoExclude(gitRoot);
  await git(gitRoot, ["add", "-A"]);

  const status = await git(gitRoot, ["status", "--porcelain"]);

  if (status) {
    await git(gitRoot, ["commit", "-m", "Initialize Composer workspace"]);
  } else {
    await git(gitRoot, ["commit", "--allow-empty", "-m", "Initialize Composer workspace"]);
  }
}

async function ensureMainBranch(gitRoot: string) {
  await git(gitRoot, ["checkout", "-B", "main"]);
}

async function currentBranch(gitRoot: string) {
  return gitOptional(gitRoot, ["branch", "--show-current"]);
}

async function ensureGitIdentity(gitRoot: string) {
  if (!(await gitOptional(gitRoot, ["config", "user.email"]))) {
    await git(gitRoot, ["config", "user.email", "composer@example.local"]);
  }

  if (!(await gitOptional(gitRoot, ["config", "user.name"]))) {
    await git(gitRoot, ["config", "user.name", "Composer"]);
  }
}

async function ensureInfoExclude(gitRoot: string) {
  const excludePath = path.join(gitRoot, ".git", "info", "exclude");
  const existing = (await pathExists(excludePath))
    ? await fs.readFile(excludePath, "utf8")
    : "";
  const patterns = [
    "node_modules/",
    "dist/",
    "build/",
    ".next/",
    ".turbo/",
    "coverage/",
    ".DS_Store",
    "*.tsbuildinfo"
  ];
  const missing = patterns.filter((pattern) => !existing.split(/\r?\n/).includes(pattern));

  if (missing.length > 0) {
    await fs.appendFile(
      excludePath,
      `${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${missing.join("\n")}\n`
    );
  }
}

async function uniqueWorktreePath(basePath: string) {
  if (!(await pathExists(basePath))) {
    return basePath;
  }

  for (let index = 1; index < 100; index += 1) {
    const candidate = `${basePath}-${index}`;

    if (!(await pathExists(candidate))) {
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
  return Boolean(await gitOptional(gitRoot, ["show-ref", "--verify", `refs/heads/${branch}`]));
}

async function isGitWorktree(cwd: string) {
  try {
    return (await git(cwd, ["rev-parse", "--is-inside-work-tree"])) === "true";
  } catch {
    return false;
  }
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function gitOptional(cwd: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8"
    });
    return stdout.trim();
  } catch {
    return undefined;
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
    throw new Error(`Could not create isolated parallel worktree: git ${args.join(" ")} failed. ${message}`);
  }
}

function safePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96) || "session";
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
