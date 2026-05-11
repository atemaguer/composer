import {
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  Anchor,
  ArrowDown,
  ChevronDown,
  Copy,
  ExternalLink,
  History,
  Maximize2,
  Square,
  TerminalSquare
} from "lucide-react";

import { cn } from "../lib/cn";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  getAttachmentLabel,
  getMediaCategory
} from "@/components/ai-elements/attachments";
import { MessageResponse } from "@/components/ai-elements/message";
import type {
  ConversationAttachment,
  ConversationItem,
  FileChangeRow,
  PendingConversationItem,
  ToolDetail
} from "../types";
import { Composer, type ComposerProps } from "./Composer";

type ConversationProps = {
  className?: string;
  cwd?: string;
  inspectorOpen: boolean;
  items: ConversationItem[];
  pendingItems: PendingConversationItem[];
  composer: ComposerProps;
  onOpenFile?: (filePath: string) => void;
};

export function Conversation({
  className,
  cwd,
  items,
  pendingItems,
  composer,
  onOpenFile
}: ConversationProps) {
  const timelineItems = useMemo(
    () =>
      groupConsecutiveToolActivity(
        items.filter((item) => item.type !== "jump_marker")
      ),
    [items]
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const updateJumpVisibility = () => {
    const scroller = scrollRef.current;

    if (!scroller) {
      setShowJumpToLatest(false);
      return;
    }

    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const threshold = Math.min(700, Math.max(360, scroller.clientHeight * 0.55));

    setShowJumpToLatest(distanceFromBottom > threshold);
  };

  useLayoutEffect(() => {
    const scroller = scrollRef.current;

    if (!scroller) {
      return;
    }

    scroller.scrollTop = scroller.scrollHeight;
    updateJumpVisibility();
  }, [timelineItems.length, pendingItems.length]);

  const scrollToLatest = () => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  };

  return (
    <section
      className={cn(
        "relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden",
        className
      )}
      aria-label="Agent conversation"
    >
      <div
        ref={scrollRef}
        className="thin-scrollbar overflow-auto px-5 pb-[220px]"
        onScroll={updateJumpVisibility}
      >
        <ConversationTimeline
          items={timelineItems}
          cwd={cwd}
          onOpenFile={onOpenFile}
        />
      </div>

      {showJumpToLatest && (
        <JumpToLatestOverlay
          hasPendingWork={pendingItems.length > 0}
          onJump={scrollToLatest}
        />
      )}
      <Composer {...composer} pendingItems={pendingItems} />
    </section>
  );
}

type ToolGroupItem = Extract<ConversationItem, { type: "tool_group" }>;

function groupConsecutiveToolActivity(
  items: ConversationItem[]
): ConversationItem[] {
  const grouped: ConversationItem[] = [];
  let index = 0;

  while (index < items.length) {
    const item = items[index];

    if (item.type !== "tool_group") {
      grouped.push(item);
      index += 1;
      continue;
    }

    const batch: ToolGroupItem[] = [];

    while (items[index]?.type === "tool_group") {
      batch.push(items[index] as ToolGroupItem);
      index += 1;
    }

    grouped.push(batch.length === 1 ? batch[0] : mergeToolActivityBatch(batch));
  }

  return grouped;
}

function mergeToolActivityBatch(batch: ToolGroupItem[]): ToolGroupItem {
  return {
    id: `${batch[0].id}-grouped-${batch.length}`,
    type: "tool_group",
    summary: summarizeToolActivityBatch(batch),
    details: batch
      .flatMap((tool) =>
        tool.details.map((detail) => ({
        ...detail,
        id: `${tool.id}-${detail.id}`
        }))
      )
      .filter(isInformativeToolDetail),
    defaultOpen: batch.some((tool) => tool.defaultOpen)
  };
}

function summarizeToolActivityBatch(batch: ToolGroupItem[]) {
  const details = batch.flatMap((tool) => tool.details);
  const callDetails = details.filter((detail) => detail.kind === "call");
  const readCount = callDetails.filter((detail) => detail.action === "read").length;
  const editCount = callDetails.filter((detail) => detail.action === "edit").length;
  const searchCount = callDetails.filter(
    (detail) => detail.action === "search"
  ).length;
  const commandCount = callDetails.filter(
    (detail) => detail.action === "command"
  ).length;
  const generatedCount = callDetails.filter(
    (detail) => detail.action === "generate"
  ).length;
  const otherToolCount = callDetails.filter(
    (detail) => detail.action === "other" || !detail.action
  ).length;
  const outputCount = details.filter(
    (detail) => detail.kind === "output" && isInformativeToolDetail(detail)
  ).length;

  const parts = [
    pluralize(readCount, "read", "file"),
    pluralize(editCount, "edited", "file"),
    pluralize(searchCount, "searched", "query"),
    pluralize(commandCount, "ran", "command"),
    pluralize(otherToolCount, "used", "tool"),
    pluralize(outputCount, "", "output"),
    pluralize(generatedCount, "generated", "image")
  ].filter(Boolean);

  if (parts.length === 0) {
    return `${batch.length} tool calls`;
  }

  return capitalizeFirst(parts.join(", "));
}

function isInformativeToolDetail(detail: ToolDetail) {
  if (detail.kind === "output") {
    return Boolean(detail.output?.trim()) && detail.label !== "Output returned";
  }

  if (detail.kind === "call") {
    return true;
  }

  return !/^Tool (output|result) returned$/i.test(detail.label);
}

function pluralize(count: number, verb: string, noun: string) {
  if (count === 0) {
    return "";
  }

  const nounText = `${noun}${count === 1 ? "" : "s"}`;
  return verb ? `${verb} ${count} ${nounText}` : `${count} ${nounText}`;
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ConversationTimeline({
  items,
  cwd,
  onOpenFile
}: {
  items: ConversationItem[];
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}) {
  return (
    <div data-conversation-content className="mx-auto w-full max-w-[820px]">
      <div data-conversation-stream className="grid gap-5 pt-3">
        {items.map((item) => (
          <ConversationItemView
            key={item.id}
            item={item}
            cwd={cwd}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </div>
  );
}

function ConversationItemView({
  item,
  cwd,
  onOpenFile
}: {
  item: ConversationItem;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}) {
  if (item.type === "assistant_message") {
    return <AssistantMessageBlock item={item} onOpenFile={onOpenFile} />;
  }

  if (item.type === "user_message") {
    return (
      <UserMessageBubble
        body={item.body}
        timestamp={item.timestamp}
        steered={item.steered}
        onOpenFile={onOpenFile}
      />
    );
  }

  if (item.type === "turn_status") {
    return <TurnStatusDivider label={item.label} />;
  }

  if (item.type === "tool_group") {
    return (
      <ToolActivityGroup item={item} cwd={cwd} onOpenFile={onOpenFile} />
    );
  }

  if (item.type === "running_tool") {
    return <RunningToolCard label={item.label} overlay={false} />;
  }

  if (item.type === "attachment_group") {
    return <AttachmentGroup item={item} />;
  }

  if (item.type === "file_change_summary") {
    return <FileChangeSummaryCard item={item} />;
  }

  if (item.type === "hook_event") {
    return <HookEventRow label={item.label} />;
  }

  if (item.type === "jump_marker") {
    return <JumpToLatestButton label={item.label} />;
  }

  return <NoticeRow label={item.label} />;
}

export function TurnStatusDivider({ label }: { label: string }) {
  return (
    <div className="grid gap-3">
      <div className="text-[15px] text-app-muted">{label}</div>
      <div className="h-px bg-app-line" />
    </div>
  );
}

export function UserMessageBubble({
  body,
  timestamp,
  steered,
  onOpenFile
}: {
  body: string;
  timestamp?: string;
  steered?: boolean;
  onOpenFile?: (filePath: string) => void;
}) {
  return (
    <div className="grid justify-items-end gap-1.5">
      {steered && (
        <div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
          <History size={12} />
          <span>Steered conversation</span>
        </div>
      )}
      <div className="max-w-[620px] rounded-2xl bg-white/[0.065] px-4 py-3 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <ChatMessageMarkdown tone="user" onOpenFile={onOpenFile}>
          {body}
        </ChatMessageMarkdown>
      </div>
      <div className="flex items-center gap-2.5 pr-1 text-[11px] text-zinc-500">
        {timestamp && <span>{timestamp}</span>}
        <button
          className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/[0.06]"
          aria-label="Copy user message"
        >
          <Copy size={13} />
        </button>
      </div>
    </div>
  );
}

export function AssistantMessageBlock({
  item,
  onOpenFile
}: {
  item: Extract<ConversationItem, { type: "assistant_message" }>;
  onOpenFile?: (filePath: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <ChatMessageMarkdown tone="assistant" onOpenFile={onOpenFile}>
        {item.body}
      </ChatMessageMarkdown>
      {item.attachments?.map((attachment) => (
        <FileChangeSummaryCard key={attachment.id} item={attachment} />
      ))}
    </div>
  );
}

export function AttachmentGroup({
  item
}: {
  item: Extract<ConversationItem, { type: "attachment_group" }>;
}) {
  const [previewAttachment, setPreviewAttachment] =
    useState<ConversationAttachment | null>(null);
  const imageAttachments = item.attachments.filter(
    (attachment) => getMediaCategory(attachment) === "image" && attachment.url
  );
  const fileAttachments = item.attachments.filter(
    (attachment) => !imageAttachments.includes(attachment)
  );

  return (
    <div className="grid justify-items-end gap-1.5">
      {imageAttachments.length > 0 && (
        <Attachments
          variant="grid"
          className="max-w-[620px] justify-end gap-2"
          aria-label="User image attachments"
        >
          {imageAttachments.map((attachment) => (
            <Attachment
              data={attachment}
              key={attachment.id}
              role="button"
              tabIndex={0}
              title={getAttachmentLabel(attachment)}
              onClick={() => setPreviewAttachment(attachment)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPreviewAttachment(attachment);
                }
              }}
              className={cn(
                "size-[64px] cursor-zoom-in rounded-lg border border-app-line-strong",
                "bg-app-panel-2/70 p-0.5 shadow-[0_12px_32px_rgba(0,0,0,0.24)]",
                "ring-1 ring-white/[0.03] transition hover:border-app-line-bright hover:bg-app-panel-2"
              )}
            >
              <AttachmentPreview className="rounded-md bg-white/[0.04]" />
            </Attachment>
          ))}
        </Attachments>
      )}
      {fileAttachments.length > 0 && (
        <Attachments
          variant="inline"
          className="max-w-[620px] justify-end gap-2"
          aria-label="User file attachments"
        >
          {fileAttachments.map((attachment) => (
            <Attachment
              data={attachment}
              key={attachment.id}
              title={attachment.title ?? attachment.filename}
              className={cn(
                "h-8 max-w-[220px] rounded-full border-app-line-strong bg-white/[0.07] px-2",
                "text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                "hover:bg-white/[0.09]"
              )}
            >
              <AttachmentPreview className="bg-white/[0.06] text-zinc-400 [&_svg]:text-zinc-400" />
              <AttachmentInfo className="text-[12px]" />
            </Attachment>
          ))}
        </Attachments>
      )}
      {item.timestamp && (
        <div className="pr-1 text-xs text-zinc-500">{item.timestamp}</div>
      )}
      <AttachmentPreviewDialog
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  );
}

function AttachmentPreviewDialog({
  attachment,
  onClose
}: {
  attachment: ConversationAttachment | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!attachment) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attachment, onClose]);

  if (!attachment || getMediaCategory(attachment) !== "image" || !attachment.url) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={getAttachmentLabel(attachment)}
      onClick={onClose}
    >
      <div
        className="grid max-h-full max-w-[min(1200px,94vw)] gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          alt={getAttachmentLabel(attachment)}
          className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
          src={attachment.url}
        />
        <div className="mx-auto max-w-[80vw] truncate rounded-full bg-black/45 px-3 py-1 text-center text-xs text-zinc-300">
          {getAttachmentLabel(attachment)}
        </div>
      </div>
    </div>
  );
}

function ChatMessageMarkdown({
  children,
  tone,
  onOpenFile
}: {
  children: string;
  tone: "assistant" | "user";
  onOpenFile?: (filePath: string) => void;
}) {
  return (
    <MessageResponse
      className={cn(
        "composer-message-markdown min-w-0 text-[13.5px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_a]:text-app-blue [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_blockquote]:my-2.5 [&_blockquote]:border-l-2 [&_blockquote]:border-app-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-app-muted",
        "[&_code]:rounded [&_code]:bg-white/[0.07] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
        "[&_h1]:mb-2.5 [&_h1]:mt-4 [&_h1]:text-[18px] [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-3.5 [&_h3]:text-[14px] [&_h3]:font-semibold",
        "[&_li]:my-0.5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-3 [&_pre]:my-2.5 [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-app-line [&_pre]:bg-black/25 [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_table]:my-2.5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-app-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-app-line [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5",
        tone === "assistant"
          ? "leading-[1.54] text-zinc-100/95"
          : "leading-[1.4] text-zinc-100"
      )}
      controls={{
        code: { copy: false, download: false },
        table: { copy: false, download: false, fullscreen: false }
      }}
      components={{
        a: (props) => (
          <MarkdownLink {...props} onOpenFile={onOpenFile} />
        ),
        code: MarkdownCode
      }}
      parseIncompleteMarkdown={false}
    >
      {tone === "user" ? escapeHtmlLikeTags(children) : children}
    </MessageResponse>
  );
}

function escapeHtmlLikeTags(value: string) {
  return value.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function MarkdownLink({
  children,
  href,
  onOpenFile,
  node: _node,
  ...props
}: {
  children?: ReactNode;
  href?: string;
  onOpenFile?: (filePath: string) => void;
  node?: unknown;
}) {
  const filePath = normalizeLocalFileHref(href);

  if (filePath && onOpenFile) {
    return (
      <button
        className="inline text-left text-app-blue underline-offset-4 hover:underline"
        type="button"
        onClick={() => onOpenFile(filePath)}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      {...props}
      href={href}
      rel="noreferrer"
      target={href?.startsWith("#") ? undefined : "_blank"}
    >
      {children}
    </a>
  );
}

function normalizeLocalFileHref(href?: string) {
  if (!href) {
    return null;
  }

  let value = href.trim();

  if (value.startsWith("file://")) {
    try {
      value = decodeURIComponent(new URL(value).pathname);
    } catch {
      value = value.replace(/^file:\/\//, "");
    }
  } else {
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the original href when it is not URI encoded.
    }
  }

  if (!value.startsWith("/")) {
    return null;
  }

  return value.replace(/:\d+(?::\d+)?$/, "");
}

function resolveToolDetailFilePath(detail: ToolDetail, cwd?: string) {
  const candidate =
    detail.path ??
    detail.args?.file_path ??
    detail.args?.path ??
    pathFromLabel(formatToolDetailLabel(detail));

  if (!candidate || !looksLikeFilePath(candidate)) {
    return null;
  }

  if (candidate.startsWith("/")) {
    return candidate;
  }

  if (!cwd) {
    return null;
  }

  return resolvePosixPath(cwd, candidate);
}

function pathFromLabel(label: string) {
  const cleaned = label
    .replace(/^Read\s+/i, "")
    .replace(/^Edited\s+/i, "")
    .replace(/^Created\s+/i, "")
    .trim();

  return cleaned.includes(" ") ? null : cleaned;
}

function looksLikeFilePath(value: string) {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    (value.includes("/") && /\.[a-z0-9]+$/i.test(value))
  );
}

function resolvePosixPath(basePath: string, relativePath: string) {
  const parts = `${basePath.replace(/\/+$/, "")}/${relativePath}`
    .split("/")
    .filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === ".") {
      continue;
    }

    if (part === "..") {
      resolved.pop();
      continue;
    }

    resolved.push(part);
  }

  return `/${resolved.join("/")}`;
}

function MarkdownCode({
  children,
  className,
  ...props
}: {
  children?: ReactNode;
  className?: string;
  node?: unknown;
  "data-block"?: boolean | string;
}) {
  const isBlock = "data-block" in props;

  if (!isBlock) {
    return (
      <code className={className} data-streamdown="inline-code">
        {children}
      </code>
    );
  }

  return (
    <CollapsedCodeBlock
      code={extractTextContent(children)}
      language={getCodeLanguage(className)}
    />
  );
}

function CollapsedCodeBlock({
  code,
  language
}: {
  code: string;
  language: string;
}) {
  const [open, setOpen] = useState(false);
  const label = language || "code";
  const lineCount = code.trimEnd().split("\n").filter(Boolean).length || 1;

  return (
    <div
      className="composer-code-accordion"
      data-language={label}
      data-composer-code-accordion
    >
      <button
        className="composer-code-accordion-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        type="button"
      >
        <span className="font-mono lowercase">{label}</span>
        <span className="text-app-dim">
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <ChevronDown
          size={14}
          className={cn("transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open && <CodeSheet code={code} language={language} />}
    </div>
  );
}

function CodeSheet({ code, language }: { code: string; language: string }) {
  const lines = code.replace(/\n$/, "").split("\n");

  return (
    <div className="composer-code-sheet" data-language={language}>
      <div className="composer-code-sheet-glow" />
      <pre aria-label={`${language || "code"} block`}>
        {lines.map((line, index) => (
          <span className="composer-code-line" key={`${index}-${line}`}>
            <span className="composer-code-line-number">{index + 1}</span>
            <code>{line || " "}</code>
          </span>
        ))}
      </pre>
    </div>
  );
}

function getCodeLanguage(className?: string) {
  return className?.match(/language-([^\s]+)/)?.[1] ?? "text";
}

function extractTextContent(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(extractTextContent).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(value)) {
    return extractTextContent(value.props.children);
  }

  return "";
}

export function ToolActivityGroup({
  item,
  cwd,
  onOpenFile
}: {
  item: Extract<ConversationItem, { type: "tool_group" }>;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}) {
  const [open, setOpen] = useState(Boolean(item.defaultOpen));
  const defaultExpandedCommandIndex = item.details.findIndex(
    (detail) => detail.tone === "command"
  );

  return (
    <div className="grid gap-2.5" data-tool-activity-group>
      <button
        className="grid w-fit max-w-full grid-cols-[18px_minmax(0,1fr)_18px] items-center gap-2 text-left text-[13.5px] text-zinc-500 transition-colors hover:text-app-muted"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <TerminalSquare size={13} className="text-zinc-500" />
        <span className="truncate">{item.summary}</span>
        <ChevronDown
          size={16}
          className={cn(
            "text-zinc-500 transition-transform",
            !open && "-rotate-90"
          )}
        />
      </button>

      {open && (
        <div className="grid gap-2 text-[13px] text-zinc-500">
          {item.details.map((detail, index) => (
            <ToolDetailRow
              key={detail.id}
              detail={detail}
              cwd={cwd}
              onOpenFile={onOpenFile}
              defaultOpen={
                Boolean(item.defaultOpen) &&
                index === defaultExpandedCommandIndex
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolDetailRow({
  detail,
  cwd,
  onOpenFile,
  defaultOpen = false
}: {
  detail: ToolDetail;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  defaultOpen?: boolean;
}) {
  const expandable =
    detail.tone === "command" ||
    detail.tone === "output" ||
    (detail.kind === "call" &&
      detail.action !== "read" &&
      Boolean(detail.args && Object.keys(detail.args).length > 0));
  const [open, setOpen] = useState(defaultOpen);
  const rowLabel = formatToolDetailLabel(detail);
  const filePath = resolveToolDetailFilePath(detail, cwd);

  if (expandable) {
    return (
      <div className="grid gap-2">
        <button
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_18px] items-center gap-2 text-left text-zinc-400 transition-colors hover:text-zinc-300"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title={detail.label}
        >
          <span
            className={cn(
              "truncate",
              detail.tone === "command" && "font-mono text-[12px]",
              detail.tone === "output" && "text-zinc-500",
              detail.action === "edit" && "text-zinc-400"
            )}
          >
            {rowLabel}
          </span>
          <ChevronDown
            className={cn("text-zinc-500 transition-transform", !open && "-rotate-90")}
            size={15}
          />
        </button>
        {open && <ToolPayloadCard detail={detail} />}
      </div>
    );
  }

  return (
    <button
      className={cn(
        "min-w-0 truncate text-left",
        filePath && onOpenFile && "transition-colors hover:text-app-blue",
        detail.tone === "error" && "text-red-300/80",
        detail.tone === "summary" && "text-zinc-500"
      )}
      type="button"
      disabled={!filePath || !onOpenFile}
      onClick={() => filePath && onOpenFile?.(filePath)}
      title={detail.label}
    >
      {rowLabel}
    </button>
  );
}

function ToolPayloadCard({ detail }: { detail: ToolDetail }) {
  const isCommand = detail.tone === "command";
  const isOutput = detail.kind === "output";
  const payload = isCommand
    ? detail.command ?? commandPayload(detail.label)
    : isOutput
      ? detail.output ?? detail.label
      : formatToolArgs(detail.args);

  return (
    <div className="overflow-hidden rounded-xl bg-white/[0.065] px-4 py-3 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="mb-3 text-[12px] text-zinc-500">
        {isCommand ? "Shell" : isOutput ? "Output" : "Details"}
      </div>
      <pre className="thin-scrollbar max-h-[260px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-5 text-zinc-200">
        {isCommand ? `$ ${payload}` : payload}
      </pre>
      <div className="mt-3 flex justify-end text-[12px] text-zinc-500">
        <span>{detail.status === "failed" ? "Failed" : "Success"}</span>
      </div>
    </div>
  );
}

function formatToolDetailLabel(detail: ToolDetail) {
  if (detail.kind === "call") {
    return detail.label;
  }

  if (detail.tone === "command") {
    return detail.label.startsWith("Ran ")
      ? detail.label
      : `Ran ${commandPayload(detail.label)}`;
  }

  if (detail.kind === "output") {
    return detail.label || "Output returned";
  }

  return detail.label;
}

function commandPayload(value: string) {
  return value
    .replace(/^Ran\s+/i, "")
    .replace(/^(cmd|command):\s*/i, "")
    .trim();
}

function formatToolArgs(args?: Record<string, string>) {
  if (!args || Object.keys(args).length === 0) {
    return "No additional details";
  }

  return Object.entries(args)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function RunningToolCard({
  label,
  overlay = true
}: {
  label: string;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[22px_minmax(0,1fr)_22px_22px] items-center gap-2.5 border border-app-line bg-app-panel/92 px-3.5 text-[14px] text-zinc-400 shadow-[0_12px_34px_rgba(0,0,0,0.24)]",
        overlay
          ? "h-[58px] rounded-t-2xl border-b-0 pb-1.5"
          : "h-[50px] rounded-lg"
      )}
    >
      <TerminalSquare size={15} />
      <span className="truncate">{label}</span>
      <button
        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06]"
        aria-label="Stop running tool"
      >
        <Square size={10} fill="currentColor" />
      </button>
      <button
        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06]"
        aria-label="Expand running tool"
      >
        <ChevronDown className="-rotate-90" size={15} />
      </button>
    </div>
  );
}

export function FileChangeSummaryCard({
  item
}: {
  item: Extract<ConversationItem, { type: "file_change_summary" }>;
}) {
  const [open, setOpen] = useState(Boolean(item.defaultOpen));

  return (
    <div className="overflow-hidden rounded-lg border border-app-line bg-app-panel/94 shadow-[0_14px_34px_rgba(0,0,0,0.24)]">
      <div className="grid min-h-[46px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-app-line px-3.5">
        <div className="min-w-0 truncate text-[14px] text-zinc-100">
          {item.summary}{" "}
          <span className="text-app-green">+{item.additions}</span>{" "}
          <span className="text-red-400">-{item.deletions}</span>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-zinc-500">
          <button className="inline-flex items-center gap-1.5 hover:text-zinc-300">
            <span>Undo</span>
          </button>
          <button className="inline-flex items-center gap-1.5 hover:text-zinc-300">
            <span>Review</span>
            <ExternalLink size={13} />
          </button>
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06]"
            aria-label={open ? "Collapse file changes" : "Expand file changes"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown
              size={15}
              className={cn("transition-transform", !open && "-rotate-90")}
            />
          </button>
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/[0.06]"
            aria-label="Expand review card"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {open && (
        <div className="grid">
          {item.files.map((file) => (
            <FileChangeRowView key={file.path} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileChangeRowView({ file }: { file: FileChangeRow }) {
  return (
    <button className="grid min-h-[38px] grid-cols-[minmax(0,1fr)_auto_22px] items-center gap-2.5 border-b border-app-line px-3.5 text-left text-[13px] last:border-b-0 hover:bg-white/[0.035]">
      <span className="min-w-0 truncate text-zinc-200">{file.path}</span>
      <span className="whitespace-nowrap">
        <span className="text-app-green">+{file.additions}</span>{" "}
        <span className="text-red-400">-{file.deletions}</span>
      </span>
      <ChevronDown size={14} className="text-zinc-500" />
    </button>
  );
}

export function HookEventRow({ label }: { label: string }) {
  return (
    <div className="inline-flex w-fit items-center gap-2 text-[13px] text-zinc-600">
      <Anchor size={13} />
      <span>{label}</span>
    </div>
  );
}

function NoticeRow({ label }: { label: string }) {
  return <div className="text-[13px] text-zinc-600">{label}</div>;
}

export function JumpToLatestButton({
  label,
  onClick
}: {
  label?: string;
  onClick?: () => void;
}) {
  return (
    <div className="grid justify-items-center">
      <button
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-app-line bg-app-panel/80 text-zinc-200 shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
        aria-label={label ?? "Jump to latest"}
        onClick={onClick}
      >
        <ArrowDown size={16} />
      </button>
    </div>
  );
}

function JumpToLatestOverlay({
  hasPendingWork,
  onJump
}: {
  hasPendingWork: boolean;
  onJump: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 px-5",
        hasPendingWork ? "bottom-[228px]" : "bottom-[164px]"
      )}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-[820px]">
        <JumpToLatestButton label="Jump to latest" onClick={onJump} />
      </div>
    </div>
  );
}
