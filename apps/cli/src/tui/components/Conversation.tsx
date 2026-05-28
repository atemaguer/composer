import { TextAttributes } from "@opentui/core";
import type {
  ConversationItem,
  PendingConversationItem,
  ToolDetail,
  ToolStatus
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
          Ctrl+L sessions · Ctrl+P provider · Ctrl+C quit
        </text>
      </box>
    );
  }

  return (
    <scrollbox
      focused={state.overlay.kind === "none"}
      style={{
        flexGrow: 1,
        stickyScroll: true,
        stickyStart: "bottom",
        padding: 1
      }}
    >
      {session.items.map((item) => (
        <ConversationRow key={item.id} item={item} />
      ))}
      {session.pendingItems.map((item) => (
        <PendingRow key={item.id} item={item} />
      ))}
    </scrollbox>
  );
}
