import {
  Check,
  ChevronDown,
  ExternalLink,
  FileCode2,
  Folder,
  GitBranch,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Plus,
  RefreshCw,
  X
} from "lucide-react";
import { useState } from "react";

import { cn } from "../lib/cn";
import type {
  ComposerReviewCommentAttachment,
  FilePreview,
  ReviewDiff,
  ReviewDiffFile,
  ReviewDiffLine
} from "../types";
import { CodeEditor } from "./CodeEditor";
import {
  cardSurface,
  pillButton,
  subtleCardSurface,
  subtleIconButton
} from "./style-tokens";
import { TooltipButton } from "./ui/tooltip-button";

type ReviewPanelProps = {
  className?: string;
  open: boolean;
  present: boolean;
  review?: ReviewDiff | null;
  reviewLoading?: boolean;
  reviewError?: string | null;
  selectedReviewPath?: string | null;
  filePreview?: FilePreview | null;
  filePreviewError?: string | null;
  filePreviewLoading?: boolean;
  onSelectReviewFile?: (filePath: string) => void;
  onAddReviewComment?: (attachment: Omit<ComposerReviewCommentAttachment, "id">) => void;
  onRefreshReview?: () => void;
  onClose?: () => void;
};

export function ReviewPanel({
  className,
  open,
  present,
  review,
  reviewLoading,
  reviewError,
  selectedReviewPath,
  filePreview,
  filePreviewError,
  filePreviewLoading,
  onSelectReviewFile,
  onAddReviewComment,
  onRefreshReview,
  onClose
}: ReviewPanelProps) {
  const activeReviewFile =
    review?.files.find((file) => file.path === selectedReviewPath) ??
    review?.files[0] ??
    null;
  const activePath = filePreview?.path ?? activeReviewFile?.path ?? "Changes";
  const showingFilePreview = Boolean(filePreview || filePreviewLoading || filePreviewError);
  const additions = review?.additions ?? 0;
  const deletions = review?.deletions ?? 0;

  return (
    <aside
      aria-label="Review changes"
      aria-hidden={!open}
      hidden={!present}
      className={cn(
        "min-h-0 min-w-0 overflow-hidden bg-app-shell/94 transition-opacity duration-[220ms] ease-in-out motion-reduce:transition-none",
        open ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
    >
      <div className="thin-scrollbar h-full w-[var(--review-content-width)] min-w-[var(--review-content-width)] overflow-auto">
        <div className="sticky top-0 z-10 bg-app-shell/95">
          <div className="flex h-11 items-center justify-between border-b border-app-line px-4">
            <div className="flex items-center gap-2">
              <TooltipButton
                className={cn("h-8 gap-2 px-3 text-[14px] font-semibold", pillButton)}
                tooltip="Review changes"
              >
                <FileCode2 size={14} />
                <span>Review</span>
              </TooltipButton>
              <TooltipButton
                className={subtleIconButton}
                tooltip="New review"
              >
                <Plus size={16} />
              </TooltipButton>
            </div>
            <div className="flex items-center text-app-dim">
              <TooltipButton
                className={subtleIconButton}
                aria-label="Hide inspector"
                tooltip="Hide inspector"
                onClick={onClose}
              >
                <PanelRight size={15} />
              </TooltipButton>
            </div>
          </div>
          <div className="flex h-11 items-center justify-between border-b border-app-line px-4 text-[13px]">
            <div className="flex items-center gap-2">
              <TooltipButton
                className="text-app-dim"
                tooltip={showingFilePreview ? "File preview" : "Working tree"}
              >
                {showingFilePreview ? "File preview" : "Working tree"}
              </TooltipButton>
              {!showingFilePreview && (
                <>
                  <ChevronDown size={14} className="text-app-dim" />
                  <span className="ml-2 text-app-green">+{additions}</span>
                  <span className="text-destructive">-{deletions}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3.5 text-app-dim">
              <MoreHorizontal size={14} />
              {!showingFilePreview && (
                <TooltipButton
                  className={subtleIconButton}
                  aria-label="Refresh review"
                  tooltip="Refresh review"
                  onClick={onRefreshReview}
                >
                  <RefreshCw
                    size={13}
                    className={cn(reviewLoading && "animate-spin")}
                  />
                </TooltipButton>
              )}
              <FileCode2 size={13} className="text-app-green" />
              <GitBranch size={14} />
              <Folder size={14} />
            </div>
          </div>
        </div>

        <div className="grid min-h-[calc(100%-88px)] grid-rows-[auto_minmax(0,1fr)] px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between text-[13px] text-app-muted">
            <span className="truncate">
              {activePath}
              {!showingFilePreview && activeReviewFile && (
                <>
                  {" "}
                  <span className="text-app-green">
                    +{activeReviewFile.additions}
                  </span>{" "}
                  <span className="text-destructive">
                    -{activeReviewFile.deletions}
                  </span>
                </>
              )}
            </span>
            <div className="flex items-center gap-4 text-app-dim">
              <ExternalLink size={13} />
              <ChevronDown size={13} />
            </div>
          </div>

          {filePreviewLoading && <FilePreviewLoading />}
          {filePreviewError && !filePreviewLoading && (
            <FilePreviewError message={filePreviewError} />
          )}
          {filePreview && !filePreviewLoading && !filePreviewError && (
            <FilePreviewEditor file={filePreview} />
          )}
          {!showingFilePreview && (
            <ReviewDiffPreview
              review={review}
              selectedFile={activeReviewFile}
              loading={Boolean(reviewLoading)}
              error={reviewError}
              onSelectFile={onSelectReviewFile}
              onAddReviewComment={onAddReviewComment}
              onRefresh={onRefreshReview}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

function ReviewDiffPreview({
  review,
  selectedFile,
  loading,
  error,
  onSelectFile,
  onAddReviewComment,
  onRefresh
}: {
  review?: ReviewDiff | null;
  selectedFile?: ReviewDiffFile | null;
  loading: boolean;
  error?: string | null;
  onSelectFile?: (filePath: string) => void;
  onAddReviewComment?: (attachment: Omit<ComposerReviewCommentAttachment, "id">) => void;
  onRefresh?: () => void;
}) {
  if (loading) {
    return (
      <div className={cn("grid min-h-[260px] place-items-center text-[13px] text-app-dim", subtleCardSurface)}>
        <div className="inline-flex items-center gap-2">
          <LoaderCircle size={14} className="animate-spin" />
          <span>Loading changes</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[14px] border border-destructive/20 bg-destructive/10 p-4 text-[13px] text-destructive">
        {error}
      </div>
    );
  }

  if (!review || review.files.length === 0) {
    return (
      <div className={cn("grid min-h-[260px] place-items-center p-6 text-center text-[13px] text-app-dim", subtleCardSurface)}>
        <div className="grid gap-3">
          <div>No workspace changes to review.</div>
          {onRefresh && (
            <TooltipButton
              className={cn("mx-auto h-8 gap-2 px-3 text-app-muted", pillButton)}
              tooltip="Refresh review"
              onClick={onRefresh}
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </TooltipButton>
          )}
        </div>
      </div>
    );
  }

  if (!selectedFile) {
    return null;
  }

  return (
    <div className="grid min-h-0 gap-2.5">
      {review.files.length > 1 && (
        <div className={cn("thin-scrollbar max-h-[170px] overflow-auto", subtleCardSurface)}>
          {review.files.map((file) => (
            <TooltipButton
              key={file.path}
              className={cn(
                "grid min-h-[34px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-app-line px-3 text-left text-[12px] last:border-b-0 hover:bg-app-text/[0.045]",
                file.path === selectedFile.path && "bg-app-text/[0.065] text-app-text"
              )}
              tooltip={`Review ${file.path}`}
              onClick={() => onSelectFile?.(file.path)}
            >
              <span className="min-w-0 truncate">{file.path}</span>
              <span className="whitespace-nowrap">
                <span className="text-app-green">+{file.additions}</span>{" "}
                <span className="text-destructive">-{file.deletions}</span>
              </span>
            </TooltipButton>
          ))}
        </div>
      )}
      <DiffFileView file={selectedFile} onAddReviewComment={onAddReviewComment} />
    </div>
  );
}

function FilePreviewLoading() {
  return (
    <div className={cn("grid min-h-[260px] place-items-center text-[13px] text-app-dim", subtleCardSurface)}>
      <div className="inline-flex items-center gap-2">
        <LoaderCircle size={14} className="animate-spin" />
        <span>Opening file</span>
      </div>
    </div>
  );
}

function FilePreviewError({ message }: { message: string }) {
  return (
    <div className="rounded-[14px] border border-destructive/20 bg-destructive/10 p-4 text-[13px] text-destructive">
      {message}
    </div>
  );
}

function FilePreviewEditor({ file }: { file: FilePreview }) {
  return (
    <div className={cn("grid min-h-0 overflow-hidden", cardSurface)}>
      {file.truncated && (
        <div className="border-b border-app-line bg-app-orange/10 px-3 py-2 text-[12px] text-app-orange">
          Showing the first {formatBytes(file.content.length)} of{" "}
          {formatBytes(file.size)}.
        </div>
      )}
      <CodeEditor path={file.path} value={file.content} />
    </div>
  );
}

function DiffFileView({
  file,
  onAddReviewComment
}: {
  file: ReviewDiffFile;
  onAddReviewComment?: (attachment: Omit<ComposerReviewCommentAttachment, "id">) => void;
}) {
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");

  if (file.isBinary) {
    return (
      <div className={cn("grid min-h-[160px] place-items-center p-6 text-center text-[13px] text-app-dim", cardSurface)}>
        Binary file changed.
      </div>
    );
  }

  if (file.hunks.length === 0) {
    return (
      <div className={cn("grid min-h-[160px] place-items-center p-6 text-center text-[13px] text-app-dim", cardSurface)}>
        No text diff available for this file.
      </div>
    );
  }

  return (
    <div className={cn("thin-scrollbar min-h-0 overflow-auto font-mono text-[12px] leading-5", cardSurface)}>
      {file.hunks.map((hunk, hunkIndex) => (
        <div key={`${hunk.oldStart}-${hunk.newStart}-${hunkIndex}`}>
          <div className="border-b border-app-line bg-app-line-strong px-3 py-0.5 font-sans text-[11px] text-app-dim">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            {hunk.header ? ` ${hunk.header}` : ""}
          </div>
          {hunk.lines.map((line, lineIndex) => {
            const lineKey = `${hunkIndex}-${lineIndex}-${line.oldLine ?? "x"}-${line.newLine ?? "x"}`;
            const lineNumber = line.newLine ?? line.oldLine;
            const side = line.newLine === null ? "L" : "R";

            return (
              <div key={lineKey}>
                <DiffLineRow
                  line={line}
                  onAddComment={
                    lineNumber && onAddReviewComment
                      ? () => {
                          setDraftKey(lineKey);
                          setDraftValue("");
                        }
                      : undefined
                  }
                />
                {draftKey === lineKey && lineNumber && (
                  <ReviewCommentForm
                    filePath={file.path}
                    lineNumber={lineNumber}
                    side={side}
                    value={draftValue}
                    onChange={setDraftValue}
                    onCancel={() => {
                      setDraftKey(null);
                      setDraftValue("");
                    }}
                    onSubmit={() => {
                      const body = draftValue.trim();

                      if (!body) {
                        return;
                      }

                      onAddReviewComment?.({
                        filePath: file.path,
                        lineNumber,
                        side,
                        body,
                        lineContent: line.content,
                        lineKind: line.kind
                      });
                      setDraftKey(null);
                      setDraftValue("");
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function DiffLineRow({
  line,
  onAddComment
}: {
  line: ReviewDiffLine;
  onAddComment?: () => void;
}) {
  const marker =
    line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " ";

  return (
    <div
      className={cn(
        "group/diff-line grid min-w-max grid-cols-[26px_46px_46px_20px_minmax(0,1fr)] border-l-4 px-2",
        line.kind === "add"
          ? "border-app-green bg-app-green/15"
          : line.kind === "delete"
            ? "border-destructive bg-destructive/14"
            : "border-transparent"
          )}
    >
      <span className="flex items-center justify-center">
        {onAddComment && (
          <TooltipButton
            className="grid h-5 w-5 place-items-center rounded-md bg-app-panel text-app-muted opacity-0 shadow-sm ring-1 ring-app-line transition hover:text-app-text group-hover/diff-line:opacity-100"
            aria-label="Add review comment"
            tooltip="Add review comment"
            onClick={onAddComment}
            type="button"
          >
            <Plus size={13} />
          </TooltipButton>
        )}
      </span>
      <span
        className={cn(
          "select-none text-right",
          line.kind === "add"
            ? "text-app-green"
            : line.kind === "delete"
              ? "text-destructive"
              : "text-app-dim"
        )}
      >
        {line.oldLine ?? ""}
      </span>
      <span
        className={cn(
          "select-none text-right",
          line.kind === "add"
            ? "text-app-green"
            : line.kind === "delete"
              ? "text-destructive"
              : "text-app-dim"
        )}
      >
        {line.newLine ?? ""}
      </span>
      <span className="select-none text-app-dim">{marker}</span>
      <code className="whitespace-pre pr-4 text-app-muted">{line.content}</code>
    </div>
  );
}

function ReviewCommentForm({
  filePath,
  lineNumber,
  side,
  value,
  onChange,
  onCancel,
  onSubmit
}: {
  filePath: string;
  lineNumber: number;
  side: "L" | "R";
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid min-w-max grid-cols-[26px_46px_minmax(0,1fr)] border-l-4 border-app-accent bg-app-accent/15 px-2 py-2">
      <div />
      <div className="pt-2 text-right text-app-accent">{lineNumber}</div>
      <div className={cn("mr-3 overflow-hidden font-sans", cardSurface)}>
        <div className="flex items-center justify-between border-b border-app-line px-3 py-2 text-[12px] text-app-muted">
          <div className="inline-flex min-w-0 items-center gap-2 font-medium text-app-text">
            <MessageSquare size={14} />
            <span>Local comment</span>
          </div>
          <span className="shrink-0">Comment on line {side}{lineNumber}</span>
        </div>
        <textarea
          className="min-h-[72px] w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-5 text-app-text outline-none placeholder:text-app-dim"
          autoFocus
          placeholder="Request change"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }

            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex items-center justify-end gap-2 px-3 pb-3">
          <TooltipButton
            className={cn("h-8 gap-1.5 px-3 text-[12px]", pillButton)}
            tooltip="Cancel comment"
            onClick={onCancel}
            type="button"
          >
            <X size={13} />
            <span>Cancel</span>
          </TooltipButton>
          <TooltipButton
            className={cn("h-8 gap-1.5 px-3 text-[12px]", pillButton, value.trim() && "bg-app-accent text-white hover:bg-app-accent/90")}
            tooltip="Add comment"
            disabled={!value.trim()}
            onClick={onSubmit}
            type="button"
          >
            <Check size={13} />
            <span>Comment</span>
          </TooltipButton>
        </div>
      </div>
    </div>
  );
}
