import { useEffect, useState } from "react";
import { TextAttributes } from "@opentui/core";

export type DialogSelectOption<T = unknown> = {
  name: string;
  description?: string;
  value: T;
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** A small braille spinner for async pickers (e.g. /sessions still fetching). */
function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setFrame((value) => (value + 1) % SPINNER_FRAMES.length),
      80
    );
    return () => clearInterval(id);
  }, []);
  return <text fg="#7aa2f7">{SPINNER_FRAMES[frame]}</text>;
}

/**
 * Reusable picker over an `@opentui` `<select>`. The select owns arrow/Enter
 * navigation while focused; Esc is handled one level up (App pops the dialog
 * stack).
 *
 * Two presentations share the same list:
 *   - default (`inline={false}`): a bordered, titled modal box.
 *   - `inline`: a borderless, left-aligned panel rendered in the normal flow
 *     just above the prompt (below the conversation) — the slash-command picker
 *     style, headed by the `→ /command` that opened it.
 */
export function DialogSelect<T>({
  title,
  command,
  options,
  onSelect,
  footer,
  inline = false,
  loading = false,
  loadingLabel
}: {
  title: string;
  command?: string;
  options: DialogSelectOption<T>[];
  onSelect: (option: DialogSelectOption<T>) => void;
  footer?: string;
  inline?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  // An @opentui <select> needs an explicit height or it collapses (showing a
  // blank list) once it has more than a handful of options. Bound it to a
  // scrollable window: descriptions add a second line per item.
  const hasDescriptions = options.some((option) => option.description);
  const linesPerItem = hasDescriptions ? 2 : 1;
  const visibleItems = Math.min(options.length, 10);
  const selectHeight = Math.max(1, visibleItems * linesPerItem);
  const hintText = footer ?? "↑↓ move · enter select · esc cancel";

  const list =
    options.length === 0 ? (
      loading ? (
        <box style={{ flexDirection: "row" }}>
          <Spinner />
          <text fg="#9aa5ce" attributes={TextAttributes.DIM}>
            {` ${loadingLabel ?? "Loading…"}`}
          </text>
        </box>
      ) : (
        <text attributes={TextAttributes.DIM}>No options available.</text>
      )
    ) : (
      <select
        focused
        showDescription={hasDescriptions}
        showScrollIndicator={options.length > visibleItems}
        wrapSelection
        style={{ height: selectHeight }}
        options={options.map((option) => ({
          name: option.name,
          description: option.description ?? "",
          value: option.value
        }))}
        onSelect={(_index, option) => {
          if (option) {
            onSelect(option as DialogSelectOption<T>);
          }
        }}
      />
    );

  if (inline) {
    return (
      <box style={{ flexDirection: "column", marginX: 1, marginTop: 1 }}>
        {command ? (
          <box style={{ flexDirection: "row" }}>
            <text fg="#7aa2f7" attributes={TextAttributes.BOLD}>
              {`→ /${command}`}
            </text>
          </box>
        ) : null}
        <text attributes={TextAttributes.DIM}>{title}</text>
        <box style={{ marginTop: 1 }}>{list}</box>
        <box style={{ marginTop: 1 }}>
          <text attributes={TextAttributes.DIM}>{hintText}</text>
        </box>
      </box>
    );
  }

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title={title}
      style={{
        padding: 1,
        minWidth: 44,
        maxWidth: 80,
        flexDirection: "column"
      }}
    >
      {list}
      <box style={{ marginTop: 1 }}>
        <text attributes={TextAttributes.DIM}>{hintText}</text>
      </box>
    </box>
  );
}
