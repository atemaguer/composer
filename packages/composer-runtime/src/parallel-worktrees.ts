import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type DelegateProvider = "codex";

type ExistingWorktrees = Partial<Record<DelegateProvider, string>>;

export type ParallelDelegateWorktree = {
  provider: DelegateProvider;
  cwd: string;
};

export function createCodexParallelWorktree({
  baseCwd,
  parentSessionId,
  existing
}: {
  baseCwd: string;
  parentSessionId: string;
  existing?: ExistingWorktrees;
}): ParallelDelegateWorktree {
  const gitRoot = ensureGitRepository(baseCwd);
  git(gitRoot, ["rev-parse", "--verify", "HEAD"]);

  const rootKey = `${path.basename(gitRoot)}-${hashText(gitRoot).slice(0, 10)}`;
  const sessionKey = safePathSegment(parentSessionId);
  const root = path.join(os.homedir(), ".composer", "worktrees", rootKey, sessionKey);

  return ensureDelegateWorktree(gitRoot, root, "codex", existing?.codex);
}

function ensureDelegateWorktree(
  gitRoot: string,
  root: string,
  provider: DelegateProvider,
  existingCwd?: string
): ParallelDelegateWorktree {
  if (existingCwd && isGitWorktree(existingCwd)) {
    return { provider, cwd: existingCwd };
  }

  fs.mkdirSync(root, { recursive: true });
  const cwd = uniqueWorktreePath(path.join(root, provider));
  const baseBranch = currentBranch(gitRoot) ?? "HEAD";
  const worktreeBranch = uniqueBranchName(
    gitRoot,
    `composer/parallel-${provider}-${safePathSegment(path.basename(root)).slice(0, 48)}`
  );
  git(gitRoot, ["worktree", "add", "-b", worktreeBranch, cwd, baseBranch]);

  return { provider, cwd };
}

function ensureGitRepository(baseCwd: string) {
  const existingRoot = gitOptional(baseCwd, ["rev-parse", "--show-toplevel"]);

  if (existingRoot) {
    if (!hasGitHead(existingRoot)) {
      ensureMainBranch(existingRoot);
      createBaselineCommit(existingRoot);
    }

    return existingRoot;
  }

  if (!fs.existsSync(baseCwd)) {
    throw new Error(`Could not create isolated parallel worktree: ${baseCwd} does not exist.`);
  }

  git(baseCwd, ["init"]);
  const gitRoot = git(baseCwd, ["rev-parse", "--show-toplevel"]);
  ensureMainBranch(gitRoot);
  createBaselineCommit(gitRoot);

  return gitRoot;
}

function hasGitHead(gitRoot: string) {
  return Boolean(gitOptional(gitRoot, ["rev-parse", "--verify", "HEAD"]));
}

function createBaselineCommit(gitRoot: string) {
  ensureGitIdentity(gitRoot);
  ensureInfoExclude(gitRoot);
  git(gitRoot, ["add", "-A"]);

  const status = git(gitRoot, ["status", "--porcelain"]);

  if (status) {
    git(gitRoot, ["commit", "-m", "Initialize Composer workspace"]);
  } else {
    git(gitRoot, ["commit", "--allow-empty", "-m", "Initialize Composer workspace"]);
  }
}

function ensureMainBranch(gitRoot: string) {
  git(gitRoot, ["checkout", "-B", "main"]);
}

function currentBranch(gitRoot: string) {
  return gitOptional(gitRoot, ["branch", "--show-current"]);
}

function ensureGitIdentity(gitRoot: string) {
  if (!gitOptional(gitRoot, ["config", "user.email"])) {
    git(gitRoot, ["config", "user.email", "composer@example.local"]);
  }

  if (!gitOptional(gitRoot, ["config", "user.name"])) {
    git(gitRoot, ["config", "user.name", "Composer"]);
  }
}

function ensureInfoExclude(gitRoot: string) {
  const excludePath = path.join(gitRoot, ".git", "info", "exclude");
  const existing = fs.existsSync(excludePath)
    ? fs.readFileSync(excludePath, "utf8")
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
    fs.appendFileSync(
      excludePath,
      `${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${missing.join("\n")}\n`
    );
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
  return Boolean(gitOptional(gitRoot, ["show-ref", "--verify", `refs/heads/${branch}`]));
}

function isGitWorktree(cwd: string) {
  try {
    return git(cwd, ["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return false;
  }
}

function gitOptional(cwd: string, args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
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
    throw new Error(`Could not create isolated parallel worktree: git ${args.join(" ")} failed. ${message}`);
  }
}

function safePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96) || "session";
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
