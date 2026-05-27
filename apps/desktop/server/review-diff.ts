import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  ReviewBranchList,
  ReviewDiff,
  ReviewDiffFile,
  ReviewDiffHunk,
  ReviewDiffScope
} from "../src/types.js";

const execFileAsync = promisify(execFile);

export async function loadReviewDiff(
  cwd: string,
  options: {
    filePath?: string | string[];
    scope?: Exclude<ReviewDiffScope, "last-turn">;
    branchHeadRef?: string;
    branchBaseRef?: string;
  } = {}
): Promise<ReviewDiff> {
  const scope = options.scope ?? "unstaged";
  const relativePaths = normalizeGitPaths(cwd, options.filePath);
  const { raw, comparison } = await loadRawDiff(cwd, scope, relativePaths, {
    branchHeadRef: options.branchHeadRef,
    branchBaseRef: options.branchBaseRef
  });
  const files = combineReviewFiles(parseUnifiedDiff(raw));

  return {
    cwd,
    generatedAt: new Date().toISOString(),
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    raw,
    comparison
  };
}

export async function loadReviewBranches(cwd: string): Promise<ReviewBranchList> {
  if (!(await isGitRepository(cwd))) {
    throw new Error("This folder is not a git repository.");
  }

  const [currentRef, defaultBaseRef, refsOutput] = await Promise.all([
    gitOptional(cwd, ["branch", "--show-current"]),
    resolveBranchBase(cwd),
    git(cwd, [
      "for-each-ref",
      "--format=%(refname:short)\t%(refname)",
      "refs/heads",
      "refs/remotes"
    ])
  ]);
  const seen = new Set<string>();
  const branches = refsOutput
    .split(/\r?\n/)
    .map((line) => {
      const [name, fullRef] = line.split("\t");
      const trimmedName = name?.trim();

      if (
        !trimmedName ||
        trimmedName.endsWith("/HEAD") ||
        fullRef?.endsWith("/HEAD") ||
        seen.has(trimmedName)
      ) {
        return null;
      }

      seen.add(trimmedName);
      return {
        name: trimmedName,
        kind: fullRef?.startsWith("refs/remotes/")
          ? ("remote" as const)
          : ("local" as const)
      };
    })
    .filter((branch): branch is ReviewBranchList["branches"][number] => Boolean(branch))
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "local" ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });

  return {
    currentRef: currentRef ?? "HEAD",
    defaultBaseRef,
    branches
  };
}

export async function checkoutReviewBranch(
  cwd: string,
  requestedBranch: string
): Promise<ReviewBranchList> {
  const branchName = normalizeGitRef(requestedBranch);

  if (!branchName) {
    throw new Error("Expected branch name.");
  }

  const branchList = await loadReviewBranches(cwd);
  const branch = branchList.branches.find((candidate) => candidate.name === branchName);

  if (!branch) {
    throw new Error(`Unknown branch ${branchName}.`);
  }

  if (branch.kind === "remote") {
    const localName = remoteBranchLocalName(branch.name);

    if (!localName) {
      throw new Error(`Cannot check out remote branch ${branch.name}.`);
    }

    const localExists = await gitOptional(cwd, [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${localName}`
    ]);

    if (localExists) {
      await git(cwd, ["checkout", localName], "Could not check out branch");
    } else {
      await git(cwd, ["checkout", "--track", branch.name], "Could not check out branch");
    }
  } else {
    await git(cwd, ["checkout", branch.name], "Could not check out branch");
  }

  return loadReviewBranches(cwd);
}

async function loadRawDiff(
  cwd: string,
  scope: Exclude<ReviewDiffScope, "last-turn">,
  relativePaths: string[],
  options: {
    branchHeadRef?: string;
    branchBaseRef?: string;
  }
): Promise<{
  raw: string;
  comparison?: ReviewDiff["comparison"];
}> {
  if (scope === "staged") {
    return {
      raw: await git(cwd, [
        "diff",
        "--cached",
        "--no-ext-diff",
        "--unified=6",
        "--no-color",
        "--",
        ...relativePaths
      ])
    };
  }

  if (scope === "branch") {
    return loadBranchDiff(
      cwd,
      relativePaths,
      options.branchHeadRef,
      options.branchBaseRef
    );
  }

  if (scope === "commit") {
    return {
      raw: await git(cwd, [
        "show",
        "--format=",
        "--no-ext-diff",
        "--unified=6",
        "--no-color",
        "HEAD",
        "--",
        ...relativePaths
      ])
    };
  }

  const [unstaged, untracked] = await Promise.all([
    git(cwd, [
      "diff",
      "--no-ext-diff",
      "--unified=6",
      "--no-color",
      "--",
      ...relativePaths
    ]),
    loadUntrackedDiff(cwd, relativePaths)
  ]);

  return { raw: [unstaged, untracked].filter(Boolean).join("\n") };
}

async function loadBranchDiff(
  cwd: string,
  relativePaths: string[],
  requestedHeadRef?: string,
  requestedBaseRef?: string
) {
  const headRef =
    normalizeGitRef(requestedHeadRef) ??
    (await gitOptional(cwd, ["branch", "--show-current"])) ??
    "HEAD";
  const baseRef = normalizeGitRef(requestedBaseRef) ?? (await resolveBranchBase(cwd));

  if (!baseRef) {
    throw new Error("Could not find a base branch for branch diff.");
  }

  const mergeBase = await git(cwd, ["merge-base", headRef, baseRef]);
  const baseSha = mergeBase.trim();

  if (!baseSha) {
    throw new Error(`Could not find merge base with ${baseRef}.`);
  }

  return {
    raw: await git(cwd, [
      "diff",
      "--no-ext-diff",
      "--unified=6",
      "--no-color",
      `${baseSha}..${headRef}`,
      "--",
      ...relativePaths
    ]),
    comparison: {
      headRef,
      baseRef
    }
  };
}

function normalizeGitRef(ref?: string) {
  const trimmed = ref?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("-") || /[\0\r\n]/.test(trimmed)) {
    throw new Error("Invalid branch ref.");
  }

  return trimmed;
}

function remoteBranchLocalName(branchName: string) {
  const slashIndex = branchName.indexOf("/");
  const localName = slashIndex === -1 ? "" : branchName.slice(slashIndex + 1);

  return normalizeGitRef(localName);
}

async function resolveBranchBase(cwd: string) {
  const upstream = await gitOptional(cwd, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}"
  ]);

  if (upstream) {
    return upstream;
  }

  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    const ref = await gitOptional(cwd, [
      "rev-parse",
      "--verify",
      "--quiet",
      candidate
    ]);

    if (ref) {
      return candidate;
    }
  }

  return null;
}

async function git(
  cwd: string,
  args: string[],
  errorPrefix = "Could not read git diff"
) {
  try {
    const result = await execFileAsync("git", ["-c", "core.quotepath=false", ...args], {
      cwd,
      maxBuffer: 25 * 1024 * 1024
    });

    return String(result.stdout);
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
    const message =
      stderr.trim() || (error instanceof Error ? error.message : String(error));

    throw new Error(`${errorPrefix}: ${message}`);
  }
}

async function gitOptional(cwd: string, args: string[]) {
  try {
    const output = await git(cwd, args);

    return output.trim() || null;
  } catch {
    return null;
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

function normalizeGitPaths(cwd: string, filePath?: string | string[]) {
  const candidates = Array.isArray(filePath) ? filePath : filePath ? [filePath] : [];

  return candidates
    .map((value) => value.trim())
    .filter(Boolean)
    .map((candidate) => normalizeGitPath(cwd, candidate));
}

function normalizeGitPath(cwd: string, candidate: string) {
  if (!path.isAbsolute(candidate)) {
    return candidate;
  }

  const relative = path.relative(cwd, candidate);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("File is outside the active workspace");
  }

  return relative;
}

async function loadUntrackedDiff(cwd: string, filePaths: string[]) {
  const output = await git(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...filePaths
  ]);
  const paths = output.split(/\r?\n/).filter(Boolean);
  const chunks = await Promise.all(
    paths.map((relativePath) => buildUntrackedFileDiff(cwd, relativePath))
  );

  return chunks.filter(Boolean).join("\n");
}

async function buildUntrackedFileDiff(cwd: string, relativePath: string) {
  const absolutePath = path.join(cwd, relativePath);
  const fileStat = await stat(absolutePath).catch(() => null);

  if (!fileStat?.isFile()) {
    return "";
  }

  if (fileStat.size > 1024 * 1024) {
    return binaryFileDiff(relativePath);
  }

  const buffer = await readFile(absolutePath);

  if (buffer.includes(0)) {
    return binaryFileDiff(relativePath);
  }

  const lines = buffer.toString("utf8").split(/\r?\n/);

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`)
  ].join("\n");
}

function binaryFileDiff(relativePath: string) {
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "Binary files /dev/null and b/" + relativePath + " differ"
  ].join("\n");
}

function parseUnifiedDiff(raw: string): ReviewDiffFile[] {
  const files: ReviewDiffFile[] = [];
  const lines = raw.split(/\r?\n/);
  let file: ReviewDiffFile | null = null;
  let hunk: ReviewDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  const finishFile = () => {
    if (file) {
      files.push(file);
    }

    file = null;
    hunk = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      const paths = parseDiffGitPaths(line);
      file = {
        path: paths.newPath,
        oldPath: paths.oldPath === paths.newPath ? undefined : paths.oldPath,
        additions: 0,
        deletions: 0,
        hunks: []
      };
      continue;
    }

    if (!file) {
      continue;
    }

    if (line.startsWith("new file mode ")) {
      file.status = "added";
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      file.status = "deleted";
      continue;
    }

    if (line.startsWith("similarity index ")) {
      file.status = "renamed";
      continue;
    }

    if (line.startsWith("rename from ")) {
      file.oldPath = line.replace(/^rename from /, "");
      continue;
    }

    if (line.startsWith("rename to ")) {
      file.path = line.replace(/^rename to /, "");
      continue;
    }

    if (line.startsWith("Binary files ")) {
      file.isBinary = true;
      file.status = file.status ?? "binary";
      continue;
    }

    if (line.startsWith("+++ ")) {
      const nextPath = line.replace(/^\+\+\+\s+/, "").replace(/^b\//, "");

      if (nextPath !== "/dev/null") {
        file.path = nextPath;
      }
      continue;
    }

    if (line.startsWith("@@")) {
      const match = line.match(
        /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/
      );

      if (!match) {
        continue;
      }

      oldLine = Number(match[1]);
      newLine = Number(match[3]);
      hunk = {
        header: match[5]?.trim() ?? "",
        oldStart: oldLine,
        oldLines: Number(match[2] ?? 1),
        newStart: newLine,
        newLines: Number(match[4] ?? 1),
        lines: []
      };
      file.hunks.push(hunk);
      continue;
    }

    if (!hunk) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      hunk.lines.push({
        kind: "add",
        oldLine: null,
        newLine,
        content: line.slice(1)
      });
      file.additions += 1;
      newLine += 1;
      file.status = file.status ?? "modified";
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      hunk.lines.push({
        kind: "delete",
        oldLine,
        newLine: null,
        content: line.slice(1)
      });
      file.deletions += 1;
      oldLine += 1;
      file.status = file.status ?? "modified";
      continue;
    }

    if (line.startsWith(" ")) {
      hunk.lines.push({
        kind: "context",
        oldLine,
        newLine,
        content: line.slice(1)
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  finishFile();
  return files;
}

function combineReviewFiles(files: ReviewDiffFile[]) {
  const merged = new Map<string, ReviewDiffFile>();

  for (const file of files) {
    const existing = merged.get(file.path);

    if (!existing) {
      merged.set(file.path, file);
      continue;
    }

    existing.additions += file.additions;
    existing.deletions += file.deletions;
    existing.hunks.push(...file.hunks);
    existing.isBinary = existing.isBinary || file.isBinary;
    existing.status = existing.status ?? file.status;
    existing.oldPath = existing.oldPath ?? file.oldPath;
  }

  return [...merged.values()];
}

function parseDiffGitPaths(line: string) {
  const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);

  if (!match) {
    return { oldPath: "Unknown file", newPath: "Unknown file" };
  }

  return { oldPath: match[1], newPath: match[2] };
}
