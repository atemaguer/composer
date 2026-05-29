import { useEffect, useMemo, useState } from "react";
import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff, PatchDiff } from "@pierre/diffs/react";
import { MessageSquarePlus } from "lucide-react";

import { cn } from "../lib/cn";
import type {
  ComposerReviewCommentAttachment,
  ReviewDiffFile
} from "../types";
import {
  annotationSideToReviewSide,
  reconstructReviewFileContents,
  reviewFileToPatch,
  reviewSideToAnnotationSide,
  type DiffAnnotationSide
} from "./diff-view-data";

type DraftComment = {
  lineNumber: number;
  side: "L" | "R";
};

// Metadata carried on each diff line annotation: an existing pending review
// comment, or the inline draft form for a new one. Kept as a single object
// (not a union) so it doesn't distribute over @pierre's conditional metadata
// type.
type DiffAnnotationMeta = {
  comment?: ComposerReviewCommentAttachment;
  draft?: DraftComment;
};

type DiffLineAnnotation = {
  side: DiffAnnotationSide;
  lineNumber: number;
  metadata: DiffAnnotationMeta;
};

const DIFF_OPTIONS = {
  diffStyle: "unified",
  overflow: "wrap",
  theme: "pierre-dark",
  // The surrounding section already renders the file header.
  disableFileHeader: true
} as const;

export function DiffView({
  cwd,
  file,
  comments = [],
  onAddReviewComment
}: {
  cwd: string;
  file: ReviewDiffFile;
  comments?: ReadonlyArray<ComposerReviewCommentAttachment>;
  onAddReviewComment?: (
    attachment: Omit<ComposerReviewCommentAttachment, "id">
  ) => void;
}) {
  const [draft, setDraft] = useState<DraftComment | null>(null);
  const [fullFileDiff, setFullFileDiff] = useState<FileDiffMetadata | null>(null);
  const patch = useMemo(() => reviewFileToPatch(file), [file]);

  useEffect(() => {
    let cancelled = false;

    async function loadFullFileDiff() {
      setFullFileDiff(null);

      if (
        file.isBinary ||
        file.status === "binary" ||
        file.status === "deleted" ||
        file.hunks.length === 0 ||
        !window.composer?.readTextFile
      ) {
        return;
      }

      try {
        const currentFile = await window.composer.readTextFile(
          resolveReviewFilePath(cwd, file.path)
        );
        const oldPath = file.oldPath ?? file.path;
        const contents =
          file.status === "added"
            ? { oldContent: "", newContent: currentFile.content }
            : reconstructReviewFileContents(file, currentFile.content);
        const nextFileDiff = parseDiffFromFile(
          { name: oldPath, contents: contents.oldContent },
          { name: file.path, contents: contents.newContent },
          undefined,
          true
        );

        if (!cancelled) {
          setFullFileDiff(nextFileDiff);
        }
      } catch {
        if (!cancelled) {
          setFullFileDiff(null);
        }
      }
    }

    void loadFullFileDiff();

    return () => {
      cancelled = true;
    };
  }, [cwd, file]);

  const lineAnnotations = useMemo<DiffLineAnnotation[]>(() => {
    const fileComments = comments.filter(
      (comment) => comment.filePath === file.path
    );
    const annotations: DiffLineAnnotation[] = fileComments.map((comment) => ({
      side: reviewSideToAnnotationSide(comment.side),
      lineNumber: comment.lineNumber,
      metadata: { comment }
    }));

    if (draft) {
      annotations.push({
        side: reviewSideToAnnotationSide(draft.side),
        lineNumber: draft.lineNumber,
        metadata: { draft }
      });
    }

    return annotations;
  }, [comments, draft, file.path]);

  function submitDraft(body: string) {
    if (!draft) {
      return;
    }

    const trimmed = body.trim();

    if (trimmed) {
      const reviewLine = findReviewLine(file, draft);

      onAddReviewComment?.({
        filePath: file.path,
        lineNumber: draft.lineNumber,
        side: draft.side,
        body: trimmed,
        lineContent: reviewLine?.content,
        lineKind: reviewLine?.kind
      });
    }

    setDraft(null);
  }

  const diffProps = {
    disableWorkerPool: true,
    options: DIFF_OPTIONS,
    lineAnnotations,
    renderAnnotation: (annotation: DiffLineAnnotation) =>
      annotation.metadata.draft ? (
        <DiffCommentForm
          onSubmit={submitDraft}
          onCancel={() => setDraft(null)}
        />
      ) : annotation.metadata.comment ? (
        <DiffCommentDisplay comment={annotation.metadata.comment} />
      ) : null,
    renderGutterUtility: (getHoveredLine: () => DiffHoveredLine | undefined) => (
      <button
        type="button"
        aria-label="Comment on line"
        className="grid h-4 w-4 place-items-center rounded text-app-dim opacity-60 transition-opacity hover:text-app-text hover:opacity-100"
        onClick={() => {
          const hovered = getHoveredLine();

          if (hovered) {
            setDraft({
              lineNumber: hovered.lineNumber,
              side: annotationSideToReviewSide(hovered.side)
            });
          }
        }}
      >
        <MessageSquarePlus size={13} />
      </button>
    )
  } as const;

  return fullFileDiff ? (
    <FileDiff<DiffAnnotationMeta>
      fileDiff={fullFileDiff}
      {...diffProps}
    />
  ) : (
    <PatchDiff<DiffAnnotationMeta>
      patch={patch}
      {...diffProps}
    />
  );
}

type DiffHoveredLine = {
  lineNumber: number;
  side: DiffAnnotationSide;
};

function resolveReviewFilePath(cwd: string, filePath: string) {
  if (filePath.startsWith("/")) {
    return filePath;
  }

  return `${cwd.replace(/\/+$/u, "")}/${filePath}`;
}

function findReviewLine(file: ReviewDiffFile, draft: DraftComment) {
  for (const hunk of file.hunks) {
    const match = hunk.lines.find((line) =>
      draft.side === "L"
        ? line.oldLine === draft.lineNumber
        : line.newLine === draft.lineNumber
    );

    if (match) {
      return match;
    }
  }

  return undefined;
}

function DiffCommentDisplay({
  comment
}: {
  comment: ComposerReviewCommentAttachment;
}) {
  return (
    <div className="mx-2 my-1.5 rounded-md border border-app-line bg-app-panel/70 px-3 py-2 text-[13px] leading-5 text-app-text">
      {comment.body}
    </div>
  );
}

function DiffCommentForm({
  onSubmit,
  onCancel
}: {
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="mx-2 my-1.5 grid gap-2 rounded-md border border-app-line bg-app-panel/70 p-2">
      <textarea
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }

          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit(value);
          }
        }}
        rows={2}
        placeholder="Add a review comment…"
        className="w-full resize-none rounded bg-app-shell/60 px-2 py-1.5 text-[13px] text-app-text outline-none placeholder:text-app-dim"
      />
      <div className="flex items-center justify-end gap-2 text-[12px]">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-app-muted hover:text-app-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(value)}
          className={cn(
            "rounded px-2 py-1 font-medium",
            value.trim()
              ? "bg-app-text/[0.1] text-app-text hover:bg-app-text/[0.16]"
              : "text-app-dim"
          )}
        >
          Comment
        </button>
      </div>
    </div>
  );
}
