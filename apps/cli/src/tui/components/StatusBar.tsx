import { TextAttributes } from "@opentui/core";
import { providerLabel, providerModelDisplayLabel } from "@composer/client";
import { useTui } from "../store.js";
import {
  activeIntelligence,
  activeModel,
  activeSession
} from "../types.js";

function basename(dir: string): string {
  const parts = dir.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? dir;
}

export function StatusBar() {
  const { state } = useTui();
  const session = activeSession(state);

  const branch = session?.worktreeBranch;
  const left = [
    providerLabel(state.provider),
    providerModelDisplayLabel(state.provider, activeModel(state)),
    activeIntelligence(state),
    state.permission,
    branch ? `⎇ ${branch}` : basename(session?.cwd ?? state.cwd)
  ].join(" · ");

  let glyph = "●";
  let glyphColor = "#9ece6a";
  let statusText = "ready";

  if (state.busy) {
    glyphColor = "#e0af68";
    statusText = "working";
  } else if (session?.runtimeStatus === "awaiting_approval") {
    glyphColor = "#e0af68";
    statusText = "approval";
  } else if (state.error) {
    glyph = "!";
    glyphColor = "#f7768e";
    statusText = state.error;
  } else if (state.notice) {
    glyphColor = "#7dcfff";
    statusText = state.notice;
  }

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingX: 1,
        flexShrink: 0
      }}
    >
      <text fg="#c0caf5">{left}</text>
      <text attributes={TextAttributes.DIM}>
        <span fg={glyphColor}>{glyph}</span> {statusText} · / commands
      </text>
    </box>
  );
}
