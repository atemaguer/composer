import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type DelegateProvider = "codex" | "claude";

type ExistingWorktrees = Partial<Record<DelegateProvider, string>>;

export type ParallelDelegateWorktree = {
  provider: DelegateProvider;
  cwd: string;
};

export function createParallelDelegateWorktrees({
  baseCwd,
  parentSessionId,
  existing
}: {
  baseCwd: string;
  parentSessionId: string;
  existing?: ExistingWorktrees;
}): Record<DelegateProvider, ParallelDelegateWorktree> {
  const gitRoot = git(baseCwd, ["rev-parse", "--show-toplevel"]);
  git(gitRoot, ["rev-parse", "--verify", "HEAD"]);

  const rootKey = `${path.basename(gitRoot)}-${hashText(gitRoot).slice(0, 10)}`;
  const sessionKey = safePathSegment(parentSessionId);
  const root = path.join(os.homedir(), ".composer", "worktrees", rootKey, sessionKey);

  return {
    codex: ensureDelegateWorktree(gitRoot, root, "codex", existing?.codex),
    claude: ensureDelegateWorktree(gitRoot, root, "claude", existing?.claude)
  };
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
  git(gitRoot, ["worktree", "add", "--detach", cwd, "HEAD"]);

  return { provider, cwd };
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

function isGitWorktree(cwd: string) {
  try {
    return git(cwd, ["rev-parse", "--is-inside-work-tree"]) === "true";
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
    throw new Error(`Could not create isolated parallel worktree: git ${args.join(" ")} failed. ${message}`);
  }
}

function safePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 96) || "session";
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
