import { useEffect, useState, type ReactNode } from "react";
import { TextAttributes } from "@opentui/core";
import { providerLabel, providerModelDisplayLabel } from "@composer/client";
import { useTui } from "../store.js";
import { activeIntelligence, activeModel, type TuiState } from "../types.js";
import { hasSeenOnboarding, markOnboardingSeen } from "../onboarding.js";

/**
 * The home / welcome screen shown before a conversation exists (and after
 * `/new`). Newcomers get a full onboarding pass (what Composer is, what you can
 * do, how to start); once seen (persisted under ~/.composer/state) returning
 * users get a compact splash. Both surface the live engine/model/effort setup.
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

/** Live config summary — the things `/provider`, `/model`, `/effort` change. */
function setupLine(state: TuiState): string {
  return [
    providerLabel(state.provider),
    providerModelDisplayLabel(state.provider, activeModel(state)),
    activeIntelligence(state),
    state.permission
  ]
    .filter(Boolean)
    .join(" · ");
}

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

function Centered({ children }: { children: ReactNode }) {
  return (
    <box
      style={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column"
      }}
    >
      {children}
    </box>
  );
}

export function Home() {
  const { state } = useTui();
  // Decide once per mount; mark seen on the first full render so the next launch
  // gets the compact splash.
  const [firstRun] = useState(() => !hasSeenOnboarding());
  useEffect(() => {
    if (firstRun) {
      markOnboardingSeen();
    }
  }, [firstRun]);

  const setup = `${setupLine(state)} · ${state.cwd}`;

  if (!firstRun) {
    return (
      <Centered>
        <text fg="#7aa2f7" attributes={TextAttributes.BOLD}>
          ◆ Composer
        </text>
        <box style={{ marginTop: 1 }}>
          <text attributes={TextAttributes.DIM}>{setup}</text>
        </box>
        <box style={{ marginTop: 1, flexDirection: "column", alignItems: "center" }}>
          <text fg="#9aa5ce">Type a message to start, or:</text>
          <text attributes={TextAttributes.DIM}>
            / commands · /sessions resume · /provider switch · /help
          </text>
        </box>
      </Centered>
    );
  }

  return (
    <Centered>
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
          <text attributes={TextAttributes.DIM}>{setup}</text>
        </box>
      </box>
    </Centered>
  );
}
