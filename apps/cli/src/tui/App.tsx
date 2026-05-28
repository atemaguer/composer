import { useKeyboard, useRenderer } from "@opentui/react";
import { useTui } from "./store.js";
import { useRuntime } from "./runtime.js";
import { Conversation } from "./components/Conversation.js";
import { Composer } from "./components/Composer.js";
import { StatusBar } from "./components/StatusBar.js";
import { Overlay } from "./components/Overlay.js";

export function App({
  connection
}: {
  connection: { httpUrl: string; wsUrl: string };
}) {
  const { state, dispatch } = useTui();
  const runtime = useRuntime(connection);
  const renderer = useRenderer();

  const overlayOpen = state.overlay.kind !== "none";

  useKeyboard((key) => {
    if (key.eventType === "release") {
      return;
    }

    if (key.name === "c" && key.ctrl) {
      if (state.busy) {
        runtime.interrupt();
      } else {
        renderer.destroy();
        process.exit(0);
      }
      return;
    }

    if (key.name === "escape") {
      if (overlayOpen) {
        dispatch({ type: "setOverlay", overlay: { kind: "none" } });
      } else if (state.busy) {
        runtime.interrupt();
      }
      return;
    }

    // Top-level overlay shortcuts only fire when nothing is already open so the
    // focused <select>/<input> keeps full control of arrows and Enter.
    if (overlayOpen) {
      return;
    }

    if (key.ctrl && key.name === "p") {
      dispatch({ type: "setOverlay", overlay: { kind: "provider" } });
      return;
    }

    if (key.ctrl && key.name === "l") {
      runtime.refreshSessions();
      dispatch({ type: "setOverlay", overlay: { kind: "sessions" } });
      return;
    }

    if (key.ctrl && key.name === "t") {
      dispatch({ type: "setOverlay", overlay: { kind: "intelligence" } });
      return;
    }

    if (key.ctrl && key.name === "o") {
      dispatch({ type: "setOverlay", overlay: { kind: "model" } });
      return;
    }

    if (key.ctrl && key.name === "y") {
      dispatch({ type: "setOverlay", overlay: { kind: "permission" } });
    }
  });

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
      <Conversation />
      <Composer
        onSubmit={(text) => runtime.sendPrompt(text)}
        disabled={state.busy}
        focused={!overlayOpen}
      />
      <StatusBar />
      {overlayOpen ? (
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100
          }}
        >
          <Overlay runtime={runtime} />
        </box>
      ) : null}
    </box>
  );
}
