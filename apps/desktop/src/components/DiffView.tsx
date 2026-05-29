import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  parseDiffFromFile,
  type FileDiffMetadata,
  type SelectedLineRange
} from "@pierre/diffs";
import { FileDiff, PatchDiff } from "@pierre/diffs/react";
import { Check, MessageSquare, MessageSquarePlus, X } from "lucide-react";

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
  enableGutterUtility: true,
  lineHoverHighlight: "line",
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

  const selectedLines = useMemo<SelectedLineRange | null>(() => {
    if (!draft) {
      return null;
    }

    const side = reviewSideToAnnotationSide(draft.side);

    return {
      start: draft.lineNumber,
      end: draft.lineNumber,
      side,
      endSide: side
    };
  }, [draft]);

  const diffProps = {
    disableWorkerPool: true,
    options: DIFF_OPTIONS,
    lineAnnotations,
    selectedLines,
    renderAnnotation: (annotation: DiffLineAnnotation) =>
      annotation.metadata.draft ? (
        <DiffCommentForm
          lineNumber={annotation.lineNumber}
          side={annotationSideToReviewSide(annotation.side)}
          onSubmit={submitDraft}
          onCancel={() => setDraft(null)}
        />
      ) : annotation.metadata.comment ? (
        <DiffCommentDisplay
          comment={annotation.metadata.comment}
          lineNumber={annotation.lineNumber}
          side={annotationSideToReviewSide(annotation.side)}
        />
      ) : null,
    renderGutterUtility: (getHoveredLine: () => DiffHoveredLine | undefined) => (
      <button
        type="button"
        data-utility-button=""
        aria-label="Comment on line"
        className="grid h-7 w-7 place-items-center rounded-md bg-app-text text-app-bg opacity-90 shadow-sm transition hover:opacity-100"
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
  comment,
  lineNumber,
  side
}: {
  comment: ComposerReviewCommentAttachment;
  lineNumber: number;
  side: "L" | "R";
}) {
  return (
    <CommentCard lineNumber={lineNumber} side={side}>
      <div className="whitespace-pre-wrap px-6 py-5 text-[14px] leading-6 text-app-text">
        {comment.body}
      </div>
    </CommentCard>
  );
}

function DiffCommentForm({
  lineNumber,
  side,
  onSubmit,
  onCancel
}: {
  lineNumber: number;
  side: "L" | "R";
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");

  return (
    <CommentCard lineNumber={lineNumber} side={side}>
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
        rows={3}
        placeholder="Request change"
        className="min-h-[96px] w-full resize-none bg-transparent px-6 py-5 text-[15px] leading-6 text-app-text outline-none placeholder:text-app-dim"
      />
      <div className="flex items-center justify-end gap-3 px-6 pb-4 text-[14px]">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-app-muted transition hover:bg-app-text/[0.06] hover:text-app-text"
        >
          <X size={15} />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(value)}
          disabled={!value.trim()}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md px-4 font-medium transition",
            value.trim()
              ? "bg-app-text text-app-bg hover:bg-app-text/90"
              : "cursor-not-allowed bg-app-text/[0.08] text-app-dim"
          )}
        >
          <Check size={15} />
          Comment
        </button>
      </div>
    </CommentCard>
  );
}

function CommentCard({
  lineNumber,
  side,
  children
}: {
  lineNumber: number;
  side: "L" | "R";
  children: ReactNode;
}) {
  return (
    <div className="mx-4 my-3 overflow-hidden rounded-[18px] border border-app-line bg-app-panel font-sans shadow-2xl shadow-black/25">
      <div className="flex min-h-16 items-center justify-between gap-4 border-b border-app-line px-6 text-[15px]">
        <div className="inline-flex min-w-0 items-center gap-3 font-semibold text-app-text">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-bg text-app-text shadow-sm">
            <MessageSquare size={16} />
          </span>
          <span className="truncate">Local comment</span>
        </div>
        <span className="shrink-0 text-app-muted">
          Comment on line {side}
          {lineNumber}
        </span>
      </div>
      {children}
    </div>
  );
}
