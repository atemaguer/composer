import path from "node:path";

type ReviewDiffLine = {
  kind: "context" | "add" | "delete";
  oldLine: number | null;
  newLine: number | null;
  content: string;
};

type ReviewDiffHunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ReviewDiffLine[];
};

export type PatchReviewFile = {
  path: string;
  oldPath?: string;
  status?: "added" | "deleted" | "modified" | "renamed" | "binary";
  additions: number;
  deletions: number;
  hunks: ReviewDiffHunk[];
  isBinary?: boolean;
};

type PatchReviewFileStatus = NonNullable<PatchReviewFile["status"]>;

export function extractPatchReviewFiles(input?: string): PatchReviewFile[] {
  if (!input?.includes("*** Begin Patch")) {
    return [];
  }

  const files: PatchReviewFile[] = [];
  const lines = input.split(/\r?\n/);
  let current: PatchReviewFile | null = null;
  let hunk: ReviewDiffHunk | null = null;
  let oldLine = 1;
  let newLine = 1;

  const finishFile = () => {
    if (current) {
      files.push(current);
    }

    current = null;
    hunk = null;
    oldLine = 1;
    newLine = 1;
  };

  const ensureHunk = (header = "") => {
    if (!current) {
      return null;
    }

    if (!hunk) {
      hunk = {
        header,
        oldStart: oldLine,
        oldLines: 0,
        newStart: newLine,
        newLines: 0,
        lines: []
      };
      current.hunks.push(hunk);
    }

    return hunk;
  };

  for (const line of lines) {
    const updateMatch = line.match(/^\*\*\* Update File:\s+(.+)$/);
    const addMatch = line.match(/^\*\*\* Add File:\s+(.+)$/);
    const deleteMatch = line.match(/^\*\*\* Delete File:\s+(.+)$/);
    const moveMatch = line.match(/^\*\*\* Move to:\s+(.+)$/);

    if (updateMatch || addMatch || deleteMatch) {
      finishFile();
      const filePath = updateMatch?.[1] ?? addMatch?.[1] ?? deleteMatch?.[1] ?? "Unknown file";
      current = {
        path: filePath.trim(),
        status: addMatch ? "added" : deleteMatch ? "deleted" : "modified",
        additions: 0,
        deletions: 0,
        hunks: []
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (moveMatch) {
      current.oldPath = current.path;
      current.path = moveMatch[1].trim();
      current.status = "renamed";
      continue;
    }

    if (line.startsWith("*** End Patch")) {
      finishFile();
      continue;
    }

    if (line.startsWith("@@")) {
      hunk = null;
      ensureHunk(line.replace(/^@@\s*/, "").trim());
      continue;
    }

    if (line.startsWith("***")) {
      continue;
    }

    const target = ensureHunk();

    if (!target) {
      continue;
    }

    if (line.startsWith("+")) {
      target.lines.push({
        kind: "add",
        oldLine: null,
        newLine,
        content: line.slice(1)
      });
      current.additions += 1;
      target.newLines += 1;
      newLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      target.lines.push({
        kind: "delete",
        oldLine,
        newLine: null,
        content: line.slice(1)
      });
      current.deletions += 1;
      target.oldLines += 1;
      oldLine += 1;
      continue;
    }

    const content = line.startsWith(" ") ? line.slice(1) : line;
    target.lines.push({
      kind: "context",
      oldLine,
      newLine,
      content
    });
    target.oldLines += 1;
    target.newLines += 1;
    oldLine += 1;
    newLine += 1;
  }

  finishFile();
  return mergePatchReviewFiles(files);
}

export function reviewFileFromCodexChange(
  filePath: string,
  change: {
    type?: string;
    kind?: string;
    unified_diff?: string;
    diff?: string;
    content?: string;
    move_path?: string | null;
  }
): PatchReviewFile {
  const status = statusFromCodexChange(change.type ?? change.kind);
  const movedPath = typeof change.move_path === "string" && change.move_path
    ? change.move_path
    : undefined;
  const pathValue = movedPath ?? filePath;
  const oldPath = movedPath ? filePath : undefined;
  const diff = change.unified_diff ?? change.diff;
  const fromDiff = diff
    ? reviewFileFromUnifiedDiff(pathValue, diff, status, oldPath)
    : null;

  if (fromDiff) {
    return fromDiff;
  }

  if (status === "added" && typeof change.content === "string") {
    return reviewFileFromAddedContent(pathValue, change.content, oldPath);
  }

  return {
    path: pathValue,
    oldPath,
    status,
    additions: 0,
    deletions: 0,
    hunks: []
  };
}

export function patchReviewLabel(files: PatchReviewFile[]) {
  if (files.length === 0) {
    return "Edited file";
  }

  if (files.length === 1) {
    return `Edited ${path.basename(files[0].path)}`;
  }

  return `Edited ${files.length} files`;
}

function reviewFileFromUnifiedDiff(
  filePath: string,
  diff: string,
  status: PatchReviewFileStatus,
  oldPath?: string
) {
  const file: PatchReviewFile = {
    path: filePath,
    oldPath,
    status,
    additions: 0,
    deletions: 0,
    hunks: []
  };
  let hunk: ReviewDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of diff.split(/\r?\n/)) {
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

  return file.hunks.length > 0 ? file : null;
}

function reviewFileFromAddedContent(
  filePath: string,
  content: string,
  oldPath?: string
): PatchReviewFile {
  const lines = content.split(/\r?\n/);

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return {
    path: filePath,
    oldPath,
    status: "added",
    additions: lines.length,
    deletions: 0,
    hunks: [
      {
        header: "",
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: lines.length,
        lines: lines.map((line, index) => ({
          kind: "add",
          oldLine: null,
          newLine: index + 1,
          content: line
        }))
      }
    ]
  };
}

function statusFromCodexChange(value?: string): PatchReviewFileStatus {
  if (value === "add" || value === "added") {
    return "added";
  }

  if (value === "delete" || value === "deleted") {
    return "deleted";
  }

  if (value === "rename" || value === "renamed" || value === "move") {
    return "renamed";
  }

  return "modified";
}

function mergePatchReviewFiles(files: PatchReviewFile[]) {
  const merged = new Map<string, PatchReviewFile>();

  for (const file of files) {
    const existing = merged.get(file.path);

    if (!existing) {
      merged.set(file.path, file);
      continue;
    }

    existing.additions += file.additions;
    existing.deletions += file.deletions;
    existing.hunks.push(...file.hunks);
    existing.status = existing.status ?? file.status;
    existing.oldPath = existing.oldPath ?? file.oldPath;
  }

  return [...merged.values()];
}
