import { useRef } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { PermissionMode } from "@composer/client";
import { useTui } from "./store.js";
import { useRuntime, type RuntimeApi } from "./runtime.js";
import { activeSession, anyDialogOpen, needsParallelAdoption } from "./types.js";
import { usePromptHistory } from "./history/promptHistory.js";
import {
  autocompleteCandidates,
  findCommand,
  parseSlash,
  type SlashCommand
} from "./commands/registry.js";
import { Conversation } from "./components/Conversation.js";
import { Composer } from "./components/Composer.js";
import { StatusBar } from "./components/StatusBar.js";
import { DialogHost } from "./components/DialogHost.js";
import { InlineDialog } from "./components/InlineDialog.js";
import { AdoptPrompt } from "./components/AdoptPrompt.js";
import { Home } from "./routes/Home.js";

const PERMISSION_CYCLE: PermissionMode[] = [
  "Default permissions",
  "Auto-review",
  "Full access"
];

const DOUBLE_ESC_MS = 600;

export function App({
  connection
}: {
  connection: { httpUrl: string; wsUrl: string };
}) {
  const { state, dispatch } = useTui();
  const runtime = useRuntime(connection);
  const renderer = useRenderer();
  const history = usePromptHistory();
  const lastEscRef = useRef<number>(0);

  const dialogOpen = anyDialogOpen(state);
  // When a finished Compose turn needs a thread chosen, an inline picker above
  // the input owns the keyboard (arrows/Enter) until the user adopts.
  const adoptPrompt = needsParallelAdoption(activeSession(state));

  const exit = () => {
    renderer.destroy();
    process.exit(0);
  };

  // Run a slash command with the full command context, then reset the prompt.
  const runCommand = (command: SlashCommand, args = "") => {
    command.run({ state, dispatch, runtime, args, exit });
    dispatch({ type: "setInput", value: "" });
    dispatch({ type: "closeAutocomplete" });
  };

  // The single Enter path: accept an autocomplete pick, run a typed `/command`,
  // or send the text to the active provider.
  const submit = (value: string) => {
    if (state.autocomplete.open) {
      const candidates = autocompleteCandidates(state);
      const command = candidates[state.autocomplete.index];
      if (command) {
        history.append(value);
        runCommand(command);
        return;
      }
    }

    const slash = parseSlash(value);
    if (slash) {
      const command = findCommand(slash.name);
      if (command) {
        history.append(value);
        runCommand(command, slash.args);
        return;
      }
    }

    if (!value.trim()) {
      return;
    }

    history.append(value);
    runtime.sendPrompt(value);
    dispatch({ type: "setInput", value: "" });
    dispatch({ type: "closeAutocomplete" });
    if (state.notice) {
      dispatch({ type: "setNotice", notice: null });
    }
    if (state.error) {
      dispatch({ type: "setError", error: null });
    }
  };

  const recallHistory = (direction: "prev" | "next") => {
    const text =
      direction === "prev" ? history.prev(state.input) : history.next();
    if (text !== null) {
      dispatch({ type: "setInput", value: text });
    }
  };

  const cyclePermission = () => {
    const index = PERMISSION_CYCLE.indexOf(state.permission);
    const next = PERMISSION_CYCLE[(index + 1) % PERMISSION_CYCLE.length];
    dispatch({ type: "setPermission", permission: next });
    dispatch({ type: "setNotice", notice: `Permissions: ${next}` });
  };

  useKeyboard((key) => {
    if (key.eventType === "release") {
      return;
    }

    // Ctrl+C: interrupt while busy, otherwise quit. Always available.
    if (key.name === "c" && key.ctrl) {
      if (state.busy) {
        runtime.interrupt();
      } else {
        exit();
      }
      return;
    }

    // A dialog owns the keyboard while open — its focused <select> handles
    // arrows/Enter; we only intercept Esc to pop the stack.
    if (dialogOpen) {
      if (key.name === "escape") {
        dispatch({ type: "popDialog" });
      }
      return;
    }

    // The inline adopt picker owns arrows/Enter while it is shown.
    if (adoptPrompt) {
      return;
    }

    // Slash autocomplete navigation. preventDefault stops the focused input
    // from also acting on these keys (see InternalKeyHandler ordering).
    if (state.autocomplete.open) {
      const candidates = autocompleteCandidates(state);

      if (key.name === "up") {
        key.preventDefault();
        dispatch({
          type: "moveAutocomplete",
          delta: -1,
          count: candidates.length
        });
        return;
      }
      if (key.name === "down") {
        key.preventDefault();
        dispatch({
          type: "moveAutocomplete",
          delta: 1,
          count: candidates.length
        });
        return;
      }
      if (key.name === "tab") {
        key.preventDefault();
        const command = candidates[state.autocomplete.index];
        if (command) {
          history.append(state.input);
          runCommand(command);
        }
        return;
      }
      if (key.name === "escape") {
        key.preventDefault();
        dispatch({ type: "closeAutocomplete" });
        return;
      }
      // Any other key falls through so the input keeps typing/filtering.
      return;
    }

    // Shift+Tab cycles the permission mode (Codex/Claude quick toggle).
    if (key.name === "tab" && key.shift) {
      key.preventDefault();
      cyclePermission();
      return;
    }

    // Prompt history: Up/Down recall prior submissions while the draft is a
    // single line. Multiline drafts let the textarea move the cursor instead.
    if (
      (key.name === "up" || key.name === "down") &&
      !state.input.includes("\n")
    ) {
      key.preventDefault();
      recallHistory(key.name === "up" ? "prev" : "next");
      return;
    }

    // Base layer: layered Esc — clear a notice, interrupt a running turn, clear
    // the draft, and on double-Esc (empty + idle) recall the last submission.
    if (key.name === "escape") {
      if (state.notice) {
        dispatch({ type: "setNotice", notice: null });
      }
      if (state.busy) {
        runtime.interrupt();
        return;
      }
      if (state.input) {
        dispatch({ type: "setInput", value: "" });
        lastEscRef.current = 0;
        return;
      }
      const now = Date.now();
      if (now - lastEscRef.current < DOUBLE_ESC_MS) {
        recallHistory("prev");
        lastEscRef.current = 0;
      } else {
        lastEscRef.current = now;
      }
    }
  });

  const showHome = state.route !== "session" || !activeSession(state);

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
      {showHome ? <Home /> : <Conversation />}
      {adoptPrompt ? <AdoptPrompt runtime={runtime} /> : null}
      {/* Slash-command pickers (/model, /provider, …) render inline here, just
          above the prompt; other dialogs stay modal via DialogHost below. */}
      <InlineDialog runtime={runtime as RuntimeApi} />
      <Composer
        onSubmit={submit}
        disabled={state.busy}
        focused={!dialogOpen && !adoptPrompt}
      />
      <StatusBar />
      <DialogHost runtime={runtime as RuntimeApi} />
    </box>
  );
}
