import { Fragment } from "react";
import { TextAttributes } from "@opentui/core";
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

const MAX_OUTPUT_LINES = 10;

function statusGlyph(status: ToolStatus | undefined): string {
  switch (status) {
    case "completed":
      return "✓";
    case "failed":
      return "✗";
    case "cancelled":
      return "∅";
    case "running":
    default:
      return "⋯";
  }
}

function trimOutput(output: string): string {
  const lines = output.split(/\r?\n/);
  if (lines.length <= MAX_OUTPUT_LINES) {
    return output.trimEnd();
  }
  return lines.slice(-MAX_OUTPUT_LINES).join("\n").trimEnd();
}

function providerColor(provider: SessionProvider | undefined): string {
  if (provider === "codex") return "#7dcfff";
  if (provider === "claude") return "#bb9af7";
  return "#7aa2f7";
}

function ToolDetailRow({ detail }: { detail: ToolDetail }) {
  const glyph = statusGlyph(detail.status);
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#c0caf5">
        {glyph} {detail.label}
      </text>
      {detail.command ? (
        <text fg="#7dcfff" attributes={TextAttributes.DIM}>
          {`$ ${detail.command}`}
        </text>
      ) : null}
      {detail.output ? (
        <text
          fg={detail.tone === "error" ? "#f7768e" : "#9aa5ce"}
          attributes={TextAttributes.DIM}
        >
          {trimOutput(detail.output)}
        </text>
      ) : null}
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
        <box style={{ marginBottom: 1 }}>
          <text>{item.body}</text>
        </box>
      );

    case "tool_group":
      return (
        <box
          border
          borderStyle="single"
          borderColor="#414868"
          title={item.summary}
          style={{ marginBottom: 1, padding: 0, flexDirection: "column" }}
        >
          {item.details.map((detail) => (
            <ToolDetailRow key={detail.id} detail={detail} />
          ))}
        </box>
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
    items: byProvider.get(provider) ?? []
  }));
}

type RenderNode =
  | { kind: "item"; item: ConversationItem }
  | { kind: "parallel"; id: string; columns: ParallelColumn[]; prompt?: string };

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
      {groupRenderNodes(session.items).map((node) =>
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
