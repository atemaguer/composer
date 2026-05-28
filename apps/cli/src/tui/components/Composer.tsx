import { useTui } from "../store.js";

export function Composer({
  onSubmit,
  disabled,
  focused
}: {
  onSubmit: (text: string) => void;
  disabled: boolean;
  focused: boolean;
}) {
  const { state, dispatch } = useTui();

  return (
    <box
      border
      borderStyle="single"
      borderColor={focused ? "#7aa2f7" : "#414868"}
      style={{ height: 3, paddingX: 1 }}
    >
      <input
        focused={focused && !disabled}
        placeholder={
          disabled ? "Working… (Ctrl+C to interrupt)" : "Message Composer…"
        }
        value={state.input}
        onInput={(value) => dispatch({ type: "setInput", value })}
        onSubmit={(value) => {
          const text = typeof value === "string" ? value : state.input;
          if (text.trim()) {
            onSubmit(text);
          }
        }}
      />
    </box>
  );
}
