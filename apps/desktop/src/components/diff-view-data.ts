import type {
  ComposerReviewCommentAttachment,
  ReviewDiffFile
} from "../types.js";

// Structurally compatible with @pierre/diffs' DiffLineAnnotation<T>. Kept local
// so this module stays dependency-free and unit-testable without the renderer.
export type DiffAnnotationSide = "deletions" | "additions";

export type ReviewLineAnnotation = {
  side: DiffAnnotationSide;
  lineNumber: number;
  metadata: ComposerReviewCommentAttachment;
};

export function reviewSideToAnnotationSide(side: "L" | "R"): DiffAnnotationSide {
  return side === "L" ? "deletions" : "additions";
}

export function annotationSideToReviewSide(side: DiffAnnotationSide): "L" | "R" {
  return side === "deletions" ? "L" : "R";
}

export function reconstructOldFileContent(
  file: ReviewDiffFile,
  newContent: string
): string {
  return reconstructReviewFileContents(file, newContent).oldContent;
}

export function reconstructReviewFileContents(
  file: ReviewDiffFile,
  currentNewContent: string
): { oldContent: string; newContent: string } {
  const { lines: newLines, trailingNewline } = splitContentLines(currentNewContent);
  const oldLines: string[] = [];
  const reconstructedNewLines: string[] = [];
  let newCursor = 0;

  for (const hunk of file.hunks) {
    const hunkNewStart = Math.max(hunk.newStart - 1, 0);

    while (newCursor < hunkNewStart && newCursor < newLines.length) {
      oldLines.push(newLines[newCursor]);
      reconstructedNewLines.push(newLines[newCursor]);
      newCursor += 1;
    }

    for (const line of hunk.lines) {
      if (line.kind === "delete") {
        oldLines.push(line.content);
        continue;
      }

      if (line.kind === "context") {
        oldLines.push(line.content);
        reconstructedNewLines.push(line.content);
      } else {
        reconstructedNewLines.push(line.content);
      }

      newCursor += 1;
    }
  }

  while (newCursor < newLines.length) {
    oldLines.push(newLines[newCursor]);
    reconstructedNewLines.push(newLines[newCursor]);
    newCursor += 1;
  }

  return {
    oldContent: `${oldLines.join("\n")}${trailingNewline ? "\n" : ""}`,
    newContent: `${reconstructedNewLines.join("\n")}${trailingNewline ? "\n" : ""}`
  };
}

function splitContentLines(content: string) {
  const trailingNewline = /\r?\n$/u.test(content);
  const lines = content.split(/\r?\n/u);

  if (trailingNewline) {
    lines.pop();
  }

  return { lines, trailingNewline };
}

/**
 * Reconstruct a single-file unified-diff patch from our structured
 * ReviewDiffFile so it can be fed to @pierre/diffs' <PatchDiff>, which renders
 * one file per instance (getSingularPatch).
 */
export function reviewFileToPatch(file: ReviewDiffFile): string {
  const newPath = file.path;
  const oldPath = file.oldPath ?? file.path;
  const lines: string[] = [`diff --git a/${oldPath} b/${newPath}`];

  if (file.status === "added") {
    lines.push("new file mode 100644", "--- /dev/null", `+++ b/${newPath}`);
  } else if (file.status === "deleted") {
    lines.push("deleted file mode 100644", `--- a/${oldPath}`, "+++ /dev/null");
  } else if (file.status === "renamed") {
    lines.push(
      `rename from ${oldPath}`,
      `rename to ${newPath}`,
      `--- a/${oldPath}`,
      `+++ b/${newPath}`
    );
  } else {
    lines.push(`--- a/${oldPath}`, `+++ b/${newPath}`);
  }

  if (file.isBinary || file.status === "binary") {
    lines.push(`Binary files a/${oldPath} and b/${newPath} differ`);
    return `${lines.join("\n")}\n`;
  }

  for (const hunk of file.hunks) {
    lines.push(formatHunkHeader(hunk));

    for (const line of hunk.lines) {
      const prefix =
        line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " ";
      lines.push(`${prefix}${line.content}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatHunkHeader(fileHunk: ReviewDiffFile["hunks"][number]) {
  const oldRange = formatHunkRange(fileHunk.oldStart, fileHunk.oldLines);
  const newRange = formatHunkRange(fileHunk.newStart, fileHunk.newLines);
  const context = fileHunk.header.trim();

  return `@@ -${oldRange} +${newRange} @@${context ? ` ${context}` : ""}`;
}

function formatHunkRange(start: number, lineCount: number) {
  return lineCount === 1 ? String(start) : `${start},${lineCount}`;
}

/**
 * Map the review comments for a single file into the per-line annotations the
 * diff renderer understands. Comments for other files are filtered out.
 */
export function reviewCommentsToAnnotations(
  comments: ReadonlyArray<ComposerReviewCommentAttachment>,
  filePath: string
): ReviewLineAnnotation[] {
  return comments
    .filter((comment) => comment.filePath === filePath)
    .map((comment) => ({
      side: reviewSideToAnnotationSide(comment.side),
      lineNumber: comment.lineNumber,
      metadata: comment
    }));
}
