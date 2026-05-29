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

export function reviewFilesFromToolCall(
  toolName: string | undefined,
  input: Record<string, unknown> = {},
  rawInput?: string
): PatchReviewFile[] {
  const patchFiles = extractPatchReviewFilesFromToolInput(input, rawInput);

  if (patchFiles.length > 0) {
    return patchFiles;
  }

  const parsedInput = parseNestedToolInput(input);

  if (parsedInput) {
    const parsedFiles = reviewFilesFromToolCall(toolName, parsedInput);

    if (parsedFiles.length > 0) {
      return parsedFiles;
    }
  }

  const codexFiles = reviewFilesFromCodexFileChange(input);

  if (codexFiles.length > 0) {
    return codexFiles;
  }

  return reviewFilesFromClaudeEditTool(toolName, input);
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

function extractPatchReviewFilesFromToolInput(
  input: Record<string, unknown>,
  rawInput?: string
) {
  const candidates = [
    rawInput,
    asString(input.input),
    asString(input.patch),
    asString(input.command),
    asString(input.arguments)
  ];

  for (const candidate of candidates) {
    const files = extractPatchReviewFiles(candidate);

    if (files.length > 0) {
      return files;
    }
  }

  return [];
}

function parseNestedToolInput(input: Record<string, unknown>) {
  const raw = asString(input.arguments) ?? asString(input.input);

  if (!raw?.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function reviewFilesFromCodexFileChange(input: Record<string, unknown>) {
  const type = asString(input.type);

  if (type !== "file_change" || !Array.isArray(input.changes)) {
    return [];
  }

  return input.changes
    .map((change) => asRecord(change))
    .map((change) => {
      const diff = asString(change.diff);
      const files = extractPatchReviewFiles(diff);

      if (files.length > 0) {
        return files[0];
      }

      const filePath = asString(change.path) ?? asString(change.file_path);

      if (!filePath) {
        return null;
      }

      return reviewFileFromCodexChange(filePath, {
        type: asString(change.type),
        kind: asString(change.kind),
        unified_diff: asString(change.unified_diff),
        diff,
        content: asString(change.content),
        move_path: asString(change.move_path)
      });
    })
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
}

function reviewFilesFromClaudeEditTool(
  toolName: string | undefined,
  input: Record<string, unknown>
) {
  const normalized = normalizeToolName(toolName ?? "");
  const filePath = toolFilePath(input);

  if (!filePath) {
    return [];
  }

  if (normalized === "write" || normalized.endsWith("_write")) {
    const content = asString(input.content);

    return content === undefined
      ? []
      : [reviewFileFromAddedContent(filePath, content)];
  }

  if (normalized === "multi_edit" || normalized.endsWith("_multi_edit")) {
    const edits = Array.isArray(input.edits)
      ? input.edits
          .map((edit) => {
            const record = asRecord(edit);
            const oldString = asString(record.old_string);
            const newString = asString(record.new_string);

            return oldString === undefined || newString === undefined
              ? null
              : { oldString, newString };
          })
          .filter((edit): edit is { oldString: string; newString: string } =>
            Boolean(edit)
          )
      : [];

    return edits.length > 0
      ? [reviewFileFromStringEdits(filePath, edits)]
      : [];
  }

  if (normalized === "edit" || normalized.endsWith("_edit")) {
    const oldString = asString(input.old_string);
    const newString = asString(input.new_string);

    return oldString === undefined || newString === undefined
      ? []
      : [reviewFileFromStringEdits(filePath, [{ oldString, newString }])];
  }

  return [];
}

function reviewFileFromStringEdits(
  filePath: string,
  edits: { oldString: string; newString: string }[]
): PatchReviewFile {
  const file: PatchReviewFile = {
    path: filePath,
    status: "modified",
    additions: 0,
    deletions: 0,
    hunks: []
  };
  let oldStart = 1;
  let newStart = 1;

  for (const edit of edits) {
    const oldLines = contentLines(edit.oldString);
    const newLines = contentLines(edit.newString);

    if (oldLines.length === 0 && newLines.length === 0) {
      continue;
    }

    const hunk: ReviewDiffHunk = {
      header: "",
      oldStart,
      oldLines: oldLines.length,
      newStart,
      newLines: newLines.length,
      lines: []
    };

    oldLines.forEach((line, index) => {
      hunk.lines.push({
        kind: "delete",
        oldLine: oldStart + index,
        newLine: null,
        content: line
      });
    });

    newLines.forEach((line, index) => {
      hunk.lines.push({
        kind: "add",
        oldLine: null,
        newLine: newStart + index,
        content: line
      });
    });

    file.additions += newLines.length;
    file.deletions += oldLines.length;
    file.hunks.push(hunk);
    oldStart += Math.max(oldLines.length, 1);
    newStart += Math.max(newLines.length, 1);
  }

  return file;
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

function contentLines(content: string) {
  const lines = content.split(/\r?\n/);

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
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

function toolFilePath(input: Record<string, unknown>) {
  return (
    asString(input.file_path) ??
    asString(input.path) ??
    asString(input.abs_path) ??
    asString(input.filename)
  );
}

function normalizeToolName(toolName: string) {
  return toolName
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/^_+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
