import { TextAttributes } from "@opentui/core";
import { providerLabel } from "@composer/client";
import { useTui } from "../store.js";

/**
 * The home screen shown before a conversation exists. Mirrors the Codex /
 * Claude Code splash: a wordmark, the active provider, and a few starter hints.
 * The composer + status bar render below it (in App).
 */
export function Home() {
  const { state } = useTui();

  return (
    <box
      style={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      }}
    >
      <text fg="#7aa2f7" attributes={TextAttributes.BOLD}>
        ◆ Composer
      </text>
      <box style={{ marginTop: 1, marginBottom: 1 }}>
        <text attributes={TextAttributes.DIM}>
          {`Orchestrating ${providerLabel(state.provider)} · ${state.cwd}`}
        </text>
      </box>
      <box style={{ flexDirection: "column", alignItems: "center" }}>
        <text fg="#9aa5ce">Type a message to start, or:</text>
        <text attributes={TextAttributes.DIM}>
          / commands · /sessions resume · /provider switch · /help
        </text>
      </box>
    </box>
  );
}
