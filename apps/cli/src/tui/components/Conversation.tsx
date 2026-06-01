import { Fragment, type ReactNode } from "react";
import { TextAttributes, SyntaxStyle } from "@opentui/core";
import {
  providerLabel,
  type ConversationItem,
  type PendingConversationItem,
  type SessionProvider,
  type ToolDetail,
  type ToolStatus
} from "@composer/client";
import { useTui } from "../store.js";
import { activeSession } from "../types.js";

// How many of a tool group's most recent calls to list individually; the rest
// collapse into a "… N earlier items hidden" line (Cursor-style grouping).
const VISIBLE_TOOL_LINES = 3;

/**
 * Tokyo Night-flavored styling for the markdown renderer used to display
 * assistant message bodies. Built once at module scope so every message shares
 * the same SyntaxStyle instance instead of allocating one per render.
 */
const MARKDOWN_SYNTAX_STYLE = SyntaxStyle.fromStyles({
  default: { fg: "#c0caf5" },
  "markup.heading": { fg: "#7aa2f7", bold: true },
  "markup.heading.1": { fg: "#7aa2f7", bold: true },
  "markup.heading.2": { fg: "#7dcfff", bold: true },
  "markup.heading.3": { fg: "#bb9af7", bold: true },
  "markup.heading.4": { fg: "#bb9af7", bold: true },
  "markup.heading.5": { fg: "#bb9af7", bold: true },
  "markup.heading.6": { fg: "#bb9af7", bold: true },
  // Bold is the `markup.strong` scope in tree-sitter-markdown (not markup.bold).
  "markup.strong": { fg: "#c0caf5", bold: true },
  "markup.italic": { fg: "#c0caf5", italic: true },
  "markup.strikethrough": { fg: "#565f89", dim: true },
  // List markers (•, 1.) and task-list boxes — give the gutter a distinct color.
  "markup.list": { fg: "#7aa2f7" },
  "markup.list.checked": { fg: "#9ece6a" },
  "markup.list.unchecked": { fg: "#565f89" },
  "markup.quote": { fg: "#9aa5ce", italic: true },
  "markup.raw": { fg: "#9ece6a" },
  "markup.raw.block": { fg: "#9ece6a" },
  "markup.link": { fg: "#7dcfff", underline: true },
  "markup.link.url": { fg: "#7dcfff", underline: true },
  "markup.link.label": { fg: "#7aa2f7" },
  // Thematic break (---) renders as a rule scoped `punctuation.special`; dim it
  // (also covers table delimiters). Keep concealed markers out of the way.
  "punctuation.special": { fg: "#414868" },
  "punctuation.delimiter": { fg: "#565f89" },
  conceal: { fg: "#414868" }
});

function providerColor(provider: SessionProvider | undefined): string {
  if (provider === "codex") return "#7dcfff";
  if (provider === "claude") return "#bb9af7";
  return "#7aa2f7";
}

const BULLET_TEXT = "#c0caf5";
const BULLET_TOOL = "#9ece6a";

/**
 * A Claude Code-style leading bullet: a colored `●` in a fixed gutter with the
 * content to its right, so multi-line bodies (markdown, tool trees) stay
 * aligned under the first line rather than under the dot.
 */
function WithBullet({
  color,
  children
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <box style={{ flexDirection: "row", marginBottom: 1 }}>
      {/* Fixed-width gutter so the body always starts past the dot — a trailing
          space on the dot text gets trimmed at the flex boundary (markdown). */}
      <box style={{ width: 2, flexShrink: 0 }}>
        <text fg={color}>{"●"}</text>
      </box>
      <box style={{ flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
        {children}
      </box>
    </box>
  );
}

/**
 * Tool-call grouping (Cursor-style). Each `tool_group` is summarized as a bold
 * run of verbs + per-category counts ("Read, searched · 9 files, 1 search"),
 * with everything but the last few calls collapsed into a "… N hidden" line.
 */
type ToolCategory =
  | "read"
  | "search"
  | "glob"
  | "edit"
  | "run"
  | "fetch"
  | "other";

const CATEGORY_META: Record<
  ToolCategory,
  { past: string; verb: string; noun: string }
> = {
  read: { past: "read", verb: "Read", noun: "file" },
  search: { past: "searched", verb: "Searched", noun: "search" },
  glob: { past: "globbed", verb: "Globbed", noun: "glob" },
  edit: { past: "edited", verb: "Edited", noun: "edit" },
  run: { past: "ran", verb: "Ran", noun: "command" },
  fetch: { past: "fetched", verb: "Fetched", noun: "fetch" },
  other: { past: "used", verb: "Used", noun: "tool" }
};

/**
 * Best-effort category from the (provider-varying) tool metadata. `action` is
 * coarse — Claude tags Read/Glob/Grep all as "other" — so we fall back to the
 * tool name and label keywords to recover the finer Cursor-style buckets.
 */
function classifyTool(detail: ToolDetail): ToolCategory {
  const name = (detail.toolName ?? "").toLowerCase();
  const label = detail.label.toLowerCase();
  if (detail.action === "edit") return "edit";
  if (detail.action === "command") return "run";
  if (name.includes("glob") || label.startsWith("glob")) return "glob";
  if (
    detail.action === "search" ||
    name.includes("grep") ||
    name.includes("search") ||
    label.startsWith("search") ||
    label.startsWith("grep")
  ) {
    return "search";
  }
  if (name.includes("fetch") || name.includes("web")) return "fetch";
  if (
    detail.action === "read" ||
    name.includes("read") ||
    name.includes("cat") ||
    name.includes("view") ||
    name.includes("list") ||
    label.startsWith("read")
  ) {
    return "read";
  }
  return "other";
}

/** Only the actual tool invocations (skip output/summary detail rows). */
function toolCalls(details: ToolDetail[]): ToolDetail[] {
  return details.filter((detail) => (detail.kind ?? "call") === "call");
}

function pluralize(noun: string, count: number): string {
  if (count === 1) {
    return `1 ${noun}`;
  }
  const plural = /(s|sh|ch|x|z)$/.test(noun) ? `${noun}es` : `${noun}s`;
  return `${count} ${plural}`;
}

/** Bold verb run + dim count run, in first-seen category order. */
function summarizeCalls(calls: ToolDetail[]): { verbs: string; counts: string } {
  const order: ToolCategory[] = [];
  const counts = new Map<ToolCategory, number>();
  for (const call of calls) {
    const category = classifyTool(call);
    if (!counts.has(category)) {
      order.push(category);
    }
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const verbs = order
    .map((category, index) => {
      const past = CATEGORY_META[category].past;
      return index === 0 ? past.charAt(0).toUpperCase() + past.slice(1) : past;
    })
    .join(", ");
  const countText = order
    .map((category) => pluralize(CATEGORY_META[category].noun, counts.get(category) ?? 0))
    .join(", ");
  return { verbs, counts: countText };
}

/** Compact "Verb target" line for a single call. */
function toolLineLabel(detail: ToolDetail): string {
  if (detail.path) {
    return `${CATEGORY_META[classifyTool(detail)].verb} ${detail.path}`;
  }
  return detail.label.replace(/^Use\s+/, "");
}

function toolLineColor(status: ToolStatus | undefined): string {
  if (status === "failed") return "#f7768e";
  if (status === "running") return "#e0af68";
  return "#9aa5ce";
}

function ToolGroupRow({
  item
}: {
  item: Extract<ConversationItem, { type: "tool_group" }>;
}) {
  const calls = toolCalls(item.details);

  // No structured calls (e.g. a lone summary/handoff row) — fall back to the
  // group's own summary so nothing is dropped.
  if (calls.length === 0) {
    return (
      <text fg="#9aa5ce" attributes={TextAttributes.DIM}>
        {item.summary}
      </text>
    );
  }

  const { verbs, counts } = summarizeCalls(calls);
  const hidden = Math.max(0, calls.length - VISIBLE_TOOL_LINES);
  const visible = calls.slice(-VISIBLE_TOOL_LINES);

  // File-tree branches: an optional "… N hidden" stub first, then the most
  // recent calls. The last branch uses └─, the rest ├─.
  const branches: { key: string; label: string; color: string }[] = [];
  if (hidden > 0) {
    branches.push({
      key: "hidden",
      label: `… ${hidden} earlier item${hidden === 1 ? "" : "s"} hidden`,
      color: "#565f89"
    });
  }
  for (const detail of visible) {
    branches.push({
      key: detail.id,
      label: toolLineLabel(detail),
      color: toolLineColor(detail.status)
    });
  }

  return (
    <box style={{ flexDirection: "column" }}>
      <box style={{ flexDirection: "row" }}>
        <text fg="#c0caf5" attributes={TextAttributes.BOLD}>
          {verbs}
        </text>
        {counts ? (
          <text fg="#565f89" attributes={TextAttributes.DIM}>
            {` ${counts}`}
          </text>
        ) : null}
      </box>
      {branches.map((branch, index) => (
        <box key={branch.key} style={{ flexDirection: "row" }}>
          <text fg="#565f89" attributes={TextAttributes.DIM}>
            {index === branches.length - 1 ? "└─ " : "├─ "}
          </text>
          <text fg={branch.color}>{branch.label}</text>
        </box>
      ))}
    </box>
  );
}

// A provider handoff (e.g. Claude → Codex) surfaces as a tool_group whose
// labels describe preparing/compacting/summarizing the handoff context. We mark
// it as a distinct timeline divider rather than a generic tool group.
const HANDOFF_PATTERNS = [
  /\bpreparing handoff context\b/,
  /\bcompacting context for handoff\b/,
  /\bgenerating readable handoff summary\b/
];

function isHandoffToolGroup(item: ConversationItem): boolean {
  if (item.type !== "tool_group") {
    return false;
  }
  const text = [
    item.summary,
    ...item.details.flatMap((detail) => [detail.label, detail.toolName])
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ")
    .toLowerCase();
  return HANDOFF_PATTERNS.some((pattern) => pattern.test(text));
}

/** A full-width timeline divider marking a provider handoff point. */
function HandoffMarker({
  item
}: {
  item: Extract<ConversationItem, { type: "tool_group" }>;
}) {
  const running = item.status === "running";
  const failed = item.status === "failed";
  const label = failed
    ? "Handoff skipped"
    : running
      ? "Handing off…"
      : "Handoff point";
  const color = failed ? "#e0af68" : running ? "#7aa2f7" : "#9aa5ce";

  return (
    <box
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 1,
        marginBottom: 1
      }}
    >
      <box style={{ flexGrow: 1, height: 1, backgroundColor: "#414868" }} />
      <text fg={color}>{`  ⇄ ${label}  `}</text>
      <box style={{ flexGrow: 1, height: 1, backgroundColor: "#414868" }} />
    </box>
  );
}

function ConversationRow({ item }: { item: ConversationItem }) {
  switch (item.type) {
    case "user_message":
      return (
        <box style={{ marginBottom: 1 }}>
          <text fg="#9ece6a">{`› ${item.body}`}</text>
        </box>
      );

    case "assistant_message":
      return (
        <WithBullet color={BULLET_TEXT}>
          <markdown content={item.body} syntaxStyle={MARKDOWN_SYNTAX_STYLE} />
        </WithBullet>
      );

    case "tool_group":
      if (isHandoffToolGroup(item)) {
        return <HandoffMarker item={item} />;
      }
      return (
        <WithBullet color={BULLET_TOOL}>
          <ToolGroupRow item={item} />
        </WithBullet>
      );

    case "running_tool":
      return (
        <text fg="#e0af68" attributes={TextAttributes.DIM}>
          {`⋯ ${item.label}`}
        </text>
      );

    case "file_change_summary":
      return (
        <text fg="#7aa2f7">
          {`${item.summary} (+${item.additions} −${item.deletions})`}
        </text>
      );

    case "notice":
    case "turn_status":
    case "hook_event":
      return <text attributes={TextAttributes.DIM}>{item.label}</text>;

    default:
      return null;
  }
}

type ParallelColumn = {
  provider: SessionProvider;
  title: string;
  items: ConversationItem[];
};

/** The layoutGroupId an item belongs to (only assistant/tool items carry one). */
function itemLayoutGroupId(item: ConversationItem): string | undefined {
  return item.type === "assistant_message" || item.type === "tool_group"
    ? item.layoutGroupId
    : undefined;
}

function itemProvider(item: ConversationItem): SessionProvider | undefined {
  return item.type === "assistant_message" || item.type === "tool_group"
    ? item.provider
    : undefined;
}

function itemLayoutTitle(item: ConversationItem): string | undefined {
  return item.type === "assistant_message" || item.type === "tool_group"
    ? item.layoutTitle
    : undefined;
}

/** Partition a batch of same-layoutGroup items into provider columns. */
function partitionByProvider(batch: ConversationItem[]): ParallelColumn[] {
  const order: SessionProvider[] = ["codex", "claude"];
  const byProvider = new Map<SessionProvider, ConversationItem[]>();
  const titles = new Map<SessionProvider, string>();

  for (const item of batch) {
    const provider = itemProvider(item) ?? "codex";
    const list = byProvider.get(provider) ?? [];
    list.push(item);
    byProvider.set(provider, list);
    const title = itemLayoutTitle(item);
    if (title && !titles.has(provider)) {
      titles.set(provider, title);
    }
  }

  const providers = [
    ...order.filter((provider) => byProvider.has(provider)),
    ...[...byProvider.keys()].filter((provider) => !order.includes(provider))
  ];

  return providers.map((provider) => ({
    provider,
    title: titles.get(provider) ?? `${providerLabel(provider)} thread`,
    items: mergeConsecutiveToolGroups(byProvider.get(provider) ?? [])
  }));
}

type RenderNode =
  | { kind: "item"; item: ConversationItem }
  | { kind: "parallel"; id: string; columns: ParallelColumn[]; prompt?: string };

/**
 * Coalesce runs of adjacent `tool_group` items (same provider + layout group)
 * into one, so successive tool calls render under a single grouped header — a
 * conversation interleaves a fresh `tool_group` per call. An assistant message
 * (or any non-tool item) between calls breaks the run, keeping turns distinct.
 */
function mergeConsecutiveToolGroups(
  items: ConversationItem[]
): ConversationItem[] {
  const out: ConversationItem[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (
      item.type === "tool_group" &&
      !isHandoffToolGroup(item) &&
      prev?.type === "tool_group" &&
      !isHandoffToolGroup(prev) &&
      prev.provider === item.provider &&
      prev.layoutGroupId === item.layoutGroupId
    ) {
      out[out.length - 1] = {
        ...prev,
        details: [...prev.details, ...item.details],
        status: item.status ?? prev.status,
        defaultOpen: prev.defaultOpen ?? item.defaultOpen
      };
    } else {
      out.push(item);
    }
  }
  return out;
}

/**
 * Collapse the flat item list into render nodes. Server-persisted compose turns
 * arrive as a single `parallel_thread_group`; live compose turns arrive as a run
 * of items sharing a `layoutGroupId` (tagged per provider) — both become a
 * side-by-side `parallel` node so live and resumed views render identically.
 */
function groupRenderNodes(items: ConversationItem[]): RenderNode[] {
  const nodes: RenderNode[] = [];
  let index = 0;

  while (index < items.length) {
    const item = items[index];

    if (item.type === "parallel_thread_group") {
      nodes.push({
        kind: "parallel",
        id: item.id,
        columns: item.columns,
        prompt: item.prompt
      });
      index += 1;
      continue;
    }

    const groupId = itemLayoutGroupId(item);
    if (!groupId) {
      nodes.push({ kind: "item", item });
      index += 1;
      continue;
    }

    const batch: ConversationItem[] = [];
    while (index < items.length && itemLayoutGroupId(items[index]) === groupId) {
      batch.push(items[index]);
      index += 1;
    }
    nodes.push({ kind: "parallel", id: groupId, columns: partitionByProvider(batch) });
  }

  return nodes;
}

/**
 * The Compose split view: the Codex and Claude threads side by side. Adoption
 * ("continue with…") is handled by the AdoptPrompt above the input once both
 * agents finish, so the columns here are read-only.
 */
function ParallelThreadGroup({
  columns,
  prompt
}: {
  columns: ParallelColumn[];
  prompt?: string;
}) {
  return (
    <box style={{ flexDirection: "column", marginBottom: 1 }}>
      {prompt ? (
        <box style={{ marginBottom: 1 }}>
          <text fg="#9ece6a">{`› ${prompt}`}</text>
        </box>
      ) : null}
      <box style={{ flexDirection: "row" }}>
        {columns.map((column, index) => (
          <Fragment key={column.provider}>
            {index > 0 ? (
              <box style={{ width: 1, backgroundColor: "#414868" }} />
            ) : null}
            <box
              style={{
                flexDirection: "column",
                flexGrow: 1,
                flexBasis: 0,
                minWidth: 0,
                paddingX: 1
              }}
            >
              <box style={{ marginBottom: 1 }}>
                <text
                  fg={providerColor(column.provider)}
                  attributes={TextAttributes.BOLD}
                >
                  {column.title}
                </text>
              </box>
              {column.items.map((columnItem) => (
                <ConversationRow key={columnItem.id} item={columnItem} />
              ))}
            </box>
          </Fragment>
        ))}
      </box>
    </box>
  );
}

function PendingRow({ item }: { item: PendingConversationItem }) {
  return (
    <text fg="#e0af68" attributes={TextAttributes.DIM}>
      {`⋯ ${item.label}`}
    </text>
  );
}

export function Conversation() {
  const { state } = useTui();
  const session = activeSession(state);

  if (!session) {
    return (
      <box
        style={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column"
        }}
      >
        <text fg="#c0caf5">Type a message to start.</text>
        <text attributes={TextAttributes.DIM}>
          / for commands · /help · /sessions · ctrl+c quit
        </text>
      </box>
    );
  }

  return (
    <scrollbox
      focused={false}
      style={{
        flexGrow: 1,
        // Allow the scrollbox to shrink below its content height so it scrolls
        // internally instead of pushing the composer + status bar off-screen.
        flexShrink: 1,
        minHeight: 0,
        stickyScroll: true,
        stickyStart: "bottom",
        padding: 1
      }}
    >
      {groupRenderNodes(mergeConsecutiveToolGroups(session.items)).map((node) =>
        node.kind === "parallel" ? (
          <ParallelThreadGroup
            key={node.id}
            columns={node.columns}
            prompt={node.prompt}
          />
        ) : (
          <ConversationRow key={node.item.id} item={node.item} />
        )
      )}
      {session.pendingItems.map((item) => (
        <PendingRow key={item.id} item={item} />
      ))}
    </scrollbox>
  );
}
