import { TextAttributes } from "@opentui/core";
import {
  providerLabel,
  type DelegateSessionProvider
} from "@composer/client";
import { useTui } from "../store.js";
import type { RuntimeApi } from "../runtime.js";

/**
 * Inline adoption prompt shown directly above the composer once a parallel
 * Compose turn finishes. The user picks a thread with the arrow keys + Enter
 * (this focused <select> owns the keyboard while it is visible); selecting one
 * adopts it and collapses the session to that single thread.
 */
export function AdoptPrompt({ runtime }: { runtime: RuntimeApi }) {
  const { state, dispatch } = useTui();
  const sessionId = state.selectedThread;

  if (!sessionId) {
    return null;
  }

  const adopt = (provider: DelegateSessionProvider) => {
    runtime.adoptParallel(sessionId, provider);
    dispatch({ type: "setProvider", provider });
    dispatch({
      type: "setNotice",
      notice: `Continuing with ${providerLabel(provider)}`
    });
  };

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#e0af68"
      backgroundColor="#1a1b26"
      style={{ flexShrink: 0, marginX: 1, paddingX: 1, flexDirection: "column" }}
    >
      <text fg="#e0af68">Both agents finished — choose a thread to continue:</text>
      <select
        focused
        showDescription
        wrapSelection
        style={{ height: 4 }}
        options={[
          {
            name: "Continue with Codex",
            description: "Adopt Codex's thread and keep working",
            value: "codex"
          },
          {
            name: "Continue with Claude",
            description: "Adopt Claude's thread and keep working",
            value: "claude"
          }
        ]}
        onSelect={(_index, option) => {
          if (option) {
            adopt((option as { value: DelegateSessionProvider }).value);
          }
        }}
      />
      <text attributes={TextAttributes.DIM}>↑↓ choose · enter continue</text>
    </box>
  );
}
