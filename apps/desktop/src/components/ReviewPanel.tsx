import {
  ChevronDown,
  ExternalLink,
  FileCode2,
  Folder,
  GitBranch,
  LoaderCircle,
  MoreHorizontal,
  PanelRight,
  Plus
} from "lucide-react";

import { cn } from "../lib/cn";
import type { DiffRowData, FilePreview } from "../types";
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
  filePath: string;
  diffRows: DiffRowData[];
  filePreview?: FilePreview | null;
  filePreviewError?: string | null;
  filePreviewLoading?: boolean;
  onClose?: () => void;
};

export function ReviewPanel({
  className,
  open,
  present,
  filePath,
  diffRows,
  filePreview,
  filePreviewError,
  filePreviewLoading,
  onClose
}: ReviewPanelProps) {
  const activePath = filePreview?.path ?? filePath;

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
                tooltip={
                  filePreview || filePreviewLoading || filePreviewError
                    ? "File preview"
                    : "Last turn"
                }
              >
                {filePreview || filePreviewLoading || filePreviewError
                  ? "File preview"
                  : "Last turn"}
              </TooltipButton>
              {!filePreview && !filePreviewLoading && !filePreviewError && (
                <>
                  <ChevronDown size={14} className="text-app-dim" />
                  <span className="ml-2 text-app-green">+33</span>
                  <span className="text-destructive">-5</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3.5 text-app-dim">
              <MoreHorizontal size={14} />
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
              {!filePreview && !filePreviewLoading && !filePreviewError && (
                <>
                  {" "}
                  <span className="text-app-green">+33</span>{" "}
                  <span className="text-destructive">-5</span>
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
          {!filePreview && !filePreviewLoading && !filePreviewError && (
            <DiffPreview diffRows={diffRows} />
          )}
        </div>
      </div>
    </aside>
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

function DiffPreview({ diffRows }: { diffRows: DiffRowData[] }) {
  return (
    <div className={cn("overflow-hidden font-mono text-[12px] leading-5", cardSurface)}>
      {diffRows.slice(0, 4).map(([line, tone, code]) => (
        <DiffRow key={`${line}-${code}`} line={line} tone={tone} code={code} />
      ))}
      <div className="bg-app-line-strong px-3 py-0.5 font-sans text-[11px] text-app-dim">
        22 unmodified lines
      </div>
      {diffRows.slice(4, 9).map(([line, tone, code]) => (
        <DiffRow key={`${line}-${code}`} line={line} tone={tone} code={code} />
      ))}
      <div className="bg-app-line-strong px-3 py-0.5 font-sans text-[11px] text-app-dim">
        18 unmodified lines
      </div>
      {diffRows.slice(9).map(([line, tone, code]) => (
        <DiffRow key={`${line}-${code}`} line={line} tone={tone} code={code} />
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

function DiffRow({
  line,
  tone,
  code
}: {
  line: string;
  tone: string;
  code: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[44px_20px_minmax(0,1fr)] border-l-4 px-2",
        tone === "+"
          ? "border-app-green bg-app-green/15"
          : tone === "-"
            ? "border-destructive bg-destructive/14"
            : "border-transparent"
      )}
    >
      <span
        className={cn(
          "text-right",
          tone === "+"
            ? "text-app-green"
            : tone === "-"
              ? "text-destructive"
              : "text-app-dim"
        )}
      >
        {line}
      </span>
      <span className="text-app-dim">{tone}</span>
      <code className="truncate text-app-muted">{code}</code>
    </div>
  );
}
