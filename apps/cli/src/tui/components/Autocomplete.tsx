import { TextAttributes } from "@opentui/core";
import type { SlashCommand } from "../commands/registry.js";

const MAX_VISIBLE = 8;

/**
 * The slash-command autocomplete popup. Rendered in normal flow directly above
 * the prompt input (so it grows upward as the conversation has `flexGrow`).
 * Navigation/selection is driven by App's keyboard handler; this component is
 * purely presentational over the derived candidate list + highlighted index.
 */
export function Autocomplete({
  candidates,
  index
}: {
  candidates: SlashCommand[];
  index: number;
}) {
  if (candidates.length === 0) {
    return null;
  }

  // Keep the highlighted row inside a fixed-height scroll window.
  let start = 0;
  if (candidates.length > MAX_VISIBLE) {
    start = Math.min(
      Math.max(0, index - Math.floor(MAX_VISIBLE / 2)),
      candidates.length - MAX_VISIBLE
    );
  }
  const visible = candidates.slice(start, start + MAX_VISIBLE);

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#414868"
      backgroundColor="#1a1b26"
      style={{ flexDirection: "column", maxWidth: 80, marginX: 1 }}
    >
      {visible.map((command, offset) => {
        const selected = start + offset === index;
        return (
          <box
            key={command.name}
            style={{
              flexDirection: "row",
              paddingX: 1,
              backgroundColor: selected ? "#7aa2f7" : undefined
            }}
          >
            <text fg={selected ? "#1a1b26" : "#9ece6a"} style={{ width: 16 }}>
              {`/${command.name}`}
            </text>
            <text
              fg={selected ? "#1a1b26" : "#9aa5ce"}
              attributes={selected ? undefined : TextAttributes.DIM}
            >
              {command.description}
            </text>
          </box>
        );
      })}
      {candidates.length > MAX_VISIBLE ? (
        <box style={{ paddingX: 1 }}>
          <text attributes={TextAttributes.DIM}>
            {`${index + 1}/${candidates.length}`}
          </text>
        </box>
      ) : null}
    </box>
  );
}
