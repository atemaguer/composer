import { useEffect, useRef } from "react";
import {
  defaultTextareaKeyBindings,
  type TextareaRenderable
} from "@opentui/core";
import { useTui } from "../store.js";
import { autocompleteCandidates } from "../commands/registry.js";
import { Autocomplete } from "./Autocomplete.js";

/**
 * Chat-style key model: Enter submits; Ctrl+J / Shift+Enter insert a newline.
 * This inverts the textarea default (Enter=newline, Meta+Enter=submit) so the
 * composer matches the Codex / Claude Code feel.
 */
const COMPOSER_KEYBINDINGS = [
  ...defaultTextareaKeyBindings.filter(
    (binding) => binding.name !== "return" && binding.name !== "kpenter"
  ),
  { name: "return", action: "submit" as const },
  { name: "kpenter", action: "submit" as const },
  { name: "return", shift: true, action: "newline" as const },
  { name: "j", ctrl: true, action: "newline" as const }
];

/**
 * The prompt input (multiline textarea) plus its slash-command autocomplete
 * popup. The store holds the canonical text; an effect pushes store→textarea
 * for programmatic changes (clear, history recall, command), while
 * onContentChange pushes textarea→store as the user types.
 */
export function Composer({
  onSubmit,
  focused
}: {
  onSubmit: (text: string) => void;
  focused: boolean;
}) {
  const { state, dispatch } = useTui();
  const inputRef = useRef<TextareaRenderable | null>(null);
  const candidates = state.autocomplete.open
    ? autocompleteCandidates(state)
    : [];

  // Push programmatic store changes into the textarea (clear after submit,
  // history recall, command insertion). Skip when already in sync to avoid a
  // setText→onContentChange→dispatch feedback loop.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    if (input.plainText !== state.input) {
      input.setText(state.input);
      input.gotoBufferEnd();
    }
  }, [state.input]);

  return (
    <box style={{ flexDirection: "column", flexShrink: 0 }}>
      {state.autocomplete.open ? (
        <Autocomplete candidates={candidates} index={state.autocomplete.index} />
      ) : null}
      <box
        border
        borderStyle="single"
        borderColor={focused ? "#7aa2f7" : "#414868"}
        style={{ paddingX: 1, minHeight: 3 }}
      >
        <textarea
          ref={(node: TextareaRenderable | null) => {
            inputRef.current = node;
          }}
          focused={focused}
          keyBindings={COMPOSER_KEYBINDINGS}
          placeholder={
            state.busy
              ? "Working… enter to queue a follow-up · esc to interrupt"
              : "Message Composer…  (/ for commands · ctrl+J newline)"
          }
          style={{ minHeight: 1, maxHeight: 8 }}
          onContentChange={() => {
            const input = inputRef.current;
            if (!input) {
              return;
            }
            const value = input.plainText;
            dispatch({ type: "setInput", value });
            // The slash popup stays open only while the leading command word is
            // being typed: it must start with "/" with no space/newline yet.
            const slashWord =
              value.startsWith("/") &&
              !value.includes(" ") &&
              !value.includes("\n");
            if (slashWord) {
              dispatch({ type: "openAutocomplete" });
            } else if (state.autocomplete.open) {
              dispatch({ type: "closeAutocomplete" });
            }
          }}
          onSubmit={() => {
            const input = inputRef.current;
            onSubmit(input ? input.plainText : state.input);
          }}
        />
      </box>
    </box>
  );
}
