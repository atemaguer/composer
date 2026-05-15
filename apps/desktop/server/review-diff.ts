import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  ReviewDiff,
  ReviewDiffFile,
  ReviewDiffHunk
} from "../src/types.js";

const execFileAsync = promisify(execFile);

export async function loadReviewDiff(
  cwd: string,
  filePath?: string | string[]
): Promise<ReviewDiff> {
  const relativePaths = normalizeGitPaths(cwd, filePath);
  const [unstaged, staged, untracked] = await Promise.all([
    git(cwd, [
      "diff",
      "--no-ext-diff",
      "--unified=6",
      "--no-color",
      "--",
      ...relativePaths
    ]),
    git(cwd, [
      "diff",
      "--cached",
      "--no-ext-diff",
      "--unified=6",
      "--no-color",
      "--",
      ...relativePaths
    ]),
    loadUntrackedDiff(cwd, relativePaths)
  ]);
  const raw = [staged, unstaged, untracked].filter(Boolean).join("\n");
  const files = combineReviewFiles(parseUnifiedDiff(raw));

  return {
    cwd,
    generatedAt: new Date().toISOString(),
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    raw
  };
}

async function git(cwd: string, args: string[]) {
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

    throw new Error(`Could not read git diff: ${message}`);
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
