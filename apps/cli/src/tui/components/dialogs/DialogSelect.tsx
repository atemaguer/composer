import { TextAttributes } from "@opentui/core";

export type DialogSelectOption<T = unknown> = {
  name: string;
  description?: string;
  value: T;
};

/**
 * Reusable modal picker — a bordered, titled box wrapping an `@opentui`
 * `<select>`. The select owns arrow/Enter navigation while focused; Esc is
 * handled one level up (App pops the dialog stack). This generalises the old
 * monolithic `Overlay` switch into a single primitive every picker reuses.
 */
export function DialogSelect<T>({
  title,
  options,
  onSelect,
  footer
}: {
  title: string;
  options: DialogSelectOption<T>[];
  onSelect: (option: DialogSelectOption<T>) => void;
  footer?: string;
}) {
  // An @opentui <select> needs an explicit height or it collapses (showing a
  // blank list) once it has more than a handful of options. Bound it to a
  // scrollable window: descriptions add a second line per item.
  const hasDescriptions = options.some((option) => option.description);
  const linesPerItem = hasDescriptions ? 2 : 1;
  const visibleItems = Math.min(options.length, 10);
  const selectHeight = Math.max(1, visibleItems * linesPerItem);

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
      {options.length === 0 ? (
        <text attributes={TextAttributes.DIM}>No options available.</text>
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
      )}
      <box style={{ marginTop: 1 }}>
        <text attributes={TextAttributes.DIM}>
          {footer ?? "↑↓ move · enter select · esc cancel"}
        </text>
      </box>
    </box>
  );
}
