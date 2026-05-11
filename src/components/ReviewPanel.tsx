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
          <div className="flex h-11 items-center justify-between border-b border-white/[0.09] px-4">
            <div className="flex items-center gap-2">
              <button className="inline-flex h-8 items-center gap-2 rounded-lg bg-white/[0.06] px-3 text-[14px] font-semibold text-zinc-200">
                <FileCode2 size={14} />
                <span>Review</span>
              </button>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70">
                <Plus size={16} />
              </button>
            </div>
            <div className="flex items-center text-zinc-500">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.04] text-zinc-300 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
                aria-label="Hide inspector"
                onClick={onClose}
              >
                <PanelRight size={15} />
              </button>
            </div>
          </div>
          <div className="flex h-11 items-center justify-between border-b border-white/[0.09] px-4 text-[13px]">
            <div className="flex items-center gap-2">
              <button className="text-zinc-500">
                {filePreview || filePreviewLoading || filePreviewError
                  ? "File preview"
                  : "Last turn"}
              </button>
              {!filePreview && !filePreviewLoading && !filePreviewError && (
                <>
                  <ChevronDown size={14} className="text-zinc-500" />
                  <span className="ml-2 text-app-green">+33</span>
                  <span className="text-red-400">-5</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3.5 text-zinc-500">
              <MoreHorizontal size={14} />
              <FileCode2 size={13} className="text-app-green" />
              <GitBranch size={14} />
              <Folder size={14} />
            </div>
          </div>
        </div>

        <div className="grid min-h-[calc(100%-88px)] grid-rows-[auto_minmax(0,1fr)] px-4 py-3">
          <div className="mb-2.5 flex items-center justify-between text-[13px] text-zinc-300">
            <span className="truncate">
              {activePath}
              {!filePreview && !filePreviewLoading && !filePreviewError && (
                <>
                  {" "}
                  <span className="text-app-green">+33</span>{" "}
                  <span className="text-red-400">-5</span>
                </>
              )}
            </span>
            <div className="flex items-center gap-4 text-zinc-500">
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
    <div className="grid min-h-[260px] place-items-center rounded-md bg-app-bg/35 text-[13px] text-zinc-500">
      <div className="inline-flex items-center gap-2">
        <LoaderCircle size={14} className="animate-spin" />
        <span>Opening file</span>
      </div>
    </div>
  );
}

function FilePreviewError({ message }: { message: string }) {
  return (
    <div className="rounded-md bg-red-500/10 p-4 text-[13px] text-red-200">
      {message}
    </div>
  );
}

function FilePreviewEditor({ file }: { file: FilePreview }) {
  return (
    <div className="grid min-h-0 overflow-hidden rounded-md border border-white/[0.06] bg-app-bg/35">
      {file.truncated && (
        <div className="border-b border-white/[0.06] bg-yellow-500/10 px-3 py-2 text-[12px] text-yellow-100/80">
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
    <div className="overflow-hidden rounded-md border border-white/[0.06] bg-app-bg/35 font-mono text-[12px] leading-5">
      {diffRows.slice(0, 4).map(([line, tone, code]) => (
        <DiffRow key={`${line}-${code}`} line={line} tone={tone} code={code} />
      ))}
      <div className="bg-white/[0.18] px-3 py-0.5 font-sans text-[11px] text-zinc-400">
        22 unmodified lines
      </div>
      {diffRows.slice(4, 9).map(([line, tone, code]) => (
        <DiffRow key={`${line}-${code}`} line={line} tone={tone} code={code} />
      ))}
      <div className="bg-white/[0.18] px-3 py-0.5 font-sans text-[11px] text-zinc-400">
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
            ? "border-red-400 bg-red-500/14"
            : "border-transparent"
      )}
    >
      <span
        className={cn(
          "text-right",
          tone === "+"
            ? "text-app-green"
            : tone === "-"
              ? "text-red-400"
              : "text-zinc-500"
        )}
      >
        {line}
      </span>
      <span className="text-zinc-500">{tone}</span>
      <code className="truncate text-zinc-300">{code}</code>
    </div>
  );
}
