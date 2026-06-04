import { TextAttributes } from "@opentui/core";
import { providerLabel } from "@composer/client";
import { useTui } from "../store.js";
import { activeSession } from "../types.js";

const MAX_PREVIEW = 72;

function preview(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_PREVIEW
    ? `${oneLine.slice(0, MAX_PREVIEW - 1)}…`
    : oneLine;
}

/**
 * The queued-message stack shown just above the composer (the TUI counterpart
 * of the desktop accordion). Messages typed while a turn is running park here in
 * FIFO order and auto-drain as turns complete; `/steer` sends the next one now,
 * `/unqueue` pops it back into the draft to edit.
 */
export function QueuedMessages() {
  const { state } = useTui();
  const queued = activeSession(state)?.queuedMessages ?? [];

  if (queued.length === 0) {
    return null;
  }

  return (
    <box
      border
      borderStyle="single"
      borderColor="#414868"
      style={{ flexDirection: "column", paddingX: 1, flexShrink: 0 }}
    >
      <text attributes={TextAttributes.DIM}>
        {queued.length} queued · /steer to send next · /unqueue to edit
      </text>
      {queued.map((message, index) => (
        <box key={message.id} style={{ flexDirection: "row" }}>
          <span fg="#7aa2f7">{`${index + 1}. `}</span>
          <span fg="#565f89">{`${providerLabel(message.provider)}  `}</span>
          <span fg="#c0caf5">{preview(message.body)}</span>
        </box>
      ))}
    </box>
  );
}
