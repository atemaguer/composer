import { TextAttributes } from "@opentui/core";
import { providerLabel } from "@composer/client";
import { useTui } from "../store.js";

/**
 * The home / welcome screen shown before a conversation exists (and again after
 * `/new`). It doubles as lightweight onboarding: a one-line description of what
 * Composer is, the things you can do, and how to start. The composer input +
 * status bar render below it (in App).
 */

type Row = { label: string; hint: string };

const CAPABILITIES: Row[] = [
  {
    label: "Build & edit code",
    hint: "describe a task — Composer edits files, runs commands, reviews diffs"
  },
  { label: "Switch engines", hint: "/provider · /model · /effort" },
  {
    label: "Compose in parallel",
    hint: "run Codex + Claude on one task, then adopt the best"
  },
  { label: "Resume past work", hint: "/sessions to reopen an earlier session" },
  { label: "Inspect changes", hint: "/review · /diff to see what changed" }
];

const GET_STARTED: Row[] = [
  { label: "Type a message", hint: "to start a task" },
  { label: "/", hint: "browse commands · /help for the full list" }
];

const LABEL_WIDTH = 20;

function SectionRow({
  label,
  hint,
  labelColor,
  bullet
}: Row & { labelColor: string; bullet?: boolean }) {
  return (
    <box style={{ flexDirection: "row" }}>
      <text fg="#565f89">{bullet ? "• " : "  "}</text>
      <text fg={labelColor} style={{ width: LABEL_WIDTH }}>
        {label}
      </text>
      <text fg="#565f89" attributes={TextAttributes.DIM}>
        {hint}
      </text>
    </box>
  );
}

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
      <box style={{ flexDirection: "column", maxWidth: 78, paddingX: 1 }}>
        <text fg="#7aa2f7" attributes={TextAttributes.BOLD}>
          ◆ Composer
        </text>
        <box style={{ marginTop: 1 }}>
          <text fg="#9aa5ce">
            A coding agent for your terminal — drive Codex or Claude, or run them
            in parallel with Compose and adopt the best result.
          </text>
        </box>

        <box style={{ marginTop: 1 }}>
          <text fg="#bb9af7" attributes={TextAttributes.BOLD}>
            What you can do
          </text>
        </box>
        {CAPABILITIES.map((row) => (
          <SectionRow key={row.label} {...row} labelColor="#c0caf5" bullet />
        ))}

        <box style={{ marginTop: 1 }}>
          <text fg="#bb9af7" attributes={TextAttributes.BOLD}>
            Get started
          </text>
        </box>
        {GET_STARTED.map((row) => (
          <SectionRow key={row.label} {...row} labelColor="#9ece6a" />
        ))}

        <box style={{ marginTop: 1 }}>
          <text attributes={TextAttributes.DIM}>
            {`Orchestrating ${providerLabel(state.provider)} · ${state.cwd}`}
          </text>
        </box>
      </box>
    </box>
  );
}
