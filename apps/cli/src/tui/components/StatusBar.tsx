import { TextAttributes } from "@opentui/core";
import { providerLabel, providerModelDisplayLabel } from "@composer/client";
import { useTui } from "../store.js";
import {
  activeIntelligence,
  activeModel,
  activeSession
} from "../types.js";

export function StatusBar() {
  const { state } = useTui();
  const session = activeSession(state);

  const left = [
    providerLabel(state.provider),
    providerModelDisplayLabel(state.provider, activeModel(state)),
    activeIntelligence(state),
    state.permission
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
  }

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingX: 1
      }}
    >
      <text fg="#c0caf5">{left}</text>
      <text attributes={TextAttributes.DIM}>
        <span fg={glyphColor}>{glyph}</span> {statusText} · Ctrl+L sessions
      </text>
    </box>
  );
}
