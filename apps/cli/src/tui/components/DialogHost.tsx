import { TextAttributes } from "@opentui/core";
import {
  providerLabel,
  providerModelDisplayLabel,
  type ApprovalDecision,
  type SessionProvider
} from "@composer/client";
import { useTui } from "../store.js";
import {
  activeIntelligence,
  activeModel,
  topDialog,
  type Dialog
} from "../types.js";
import type { RuntimeApi } from "../runtime.js";
import { commandsForProvider } from "../commands/registry.js";
import { isInlineDialog } from "./InlineDialog.js";
import { DialogReview } from "./dialogs/DialogReview.js";
import {
  DialogAdopt,
  DialogArchive,
  DialogBranch,
  DialogCapabilities
} from "./dialogs/DialogActions.js";

function decisionLabel(decision: ApprovalDecision): string {
  switch (decision) {
    case "accept":
      return "Approve";
    case "acceptForSession":
      return "Approve for session";
    case "decline":
      return "Decline";
    case "cancel":
      return "Cancel";
    default:
      return decision;
  }
}

/**
 * Renders the focused (top-most) dialog from the stack. Each picker builds its
 * options from the shared provider registry / runtime state and dispatches the
 * matching reducer action — which also pops the dialog off the stack.
 */
export function DialogHost({ runtime }: { runtime: RuntimeApi }) {
  const { state, dispatch } = useTui();
  const dialog = topDialog(state);

  // Slash-command pickers render inline (see InlineDialog); only the remaining
  // modal dialogs are drawn here as a centered overlay.
  if (!dialog || isInlineDialog(dialog)) {
    return null;
  }

  return (
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
      <DialogBody dialog={dialog} runtime={runtime} dispatch={dispatch} state={state} />
    </box>
  );
}

function DialogBody({
  dialog,
  runtime,
  dispatch,
  state
}: {
  dialog: Dialog;
  runtime: RuntimeApi;
  dispatch: ReturnType<typeof useTui>["dispatch"];
  state: ReturnType<typeof useTui>["state"];
}) {
  switch (dialog.kind) {
    case "approval": {
      const { approval } = dialog;
      const detailLines = approval.details
        ? Object.entries(approval.details).map(
            ([key, value]) => `${key}: ${value}`
          )
        : [];

      return (
        <box
          border
          borderStyle="rounded"
          borderColor="#e0af68"
          backgroundColor="#1a1b26"
          title="Approval required"
          style={{
            padding: 1,
            minWidth: 44,
            maxWidth: 80,
            flexDirection: "column"
          }}
        >
          <box style={{ marginBottom: 1, flexDirection: "column" }}>
            <text fg="#c0caf5">{approval.title}</text>
            {detailLines.map((line, index) => (
              <text key={index} attributes={TextAttributes.DIM}>
                {line}
              </text>
            ))}
          </box>
          <select
            focused
            style={{ height: Math.max(1, approval.availableDecisions.length) }}
            options={approval.availableDecisions.map((decision) => ({
              name: decisionLabel(decision),
              description: "",
              value: decision
            }))}
            onSelect={(_index, option) => {
              if (option) {
                runtime.resolveApproval(
                  approval.id,
                  (option as { value: ApprovalDecision }).value
                );
                dispatch({ type: "popDialog" });
              }
            }}
          />
        </box>
      );
    }

    case "review":
      return <DialogReview runtime={runtime} />;

    case "branch":
      return <DialogBranch runtime={runtime} />;

    case "capabilities":
      return <DialogCapabilities runtime={runtime} />;

    case "archive":
      return <DialogArchive runtime={runtime} />;

    case "adopt":
      return <DialogAdopt runtime={runtime} />;

    case "status":
      return <StatusPanel state={state} />;

    case "help":
      return <HelpPanel provider={state.provider} />;

    default:
      return null;
  }
}

function StatusPanel({ state }: { state: ReturnType<typeof useTui>["state"] }) {
  const rows: [string, string][] = [
    ["Provider", providerLabel(state.provider)],
    ["Model", providerModelDisplayLabel(state.provider, activeModel(state))],
    ["Effort", activeIntelligence(state)],
    ["Permissions", state.permission],
    ["Working dir", state.cwd],
    ["Session", state.selectedThread ?? "(new)"]
  ];

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title="Status"
      style={{ padding: 1, minWidth: 50, maxWidth: 90, flexDirection: "column" }}
    >
      {rows.map(([label, value]) => (
        <box key={label} style={{ flexDirection: "row" }}>
          <text fg="#7aa2f7" style={{ width: 14 }}>
            {label}
          </text>
          <text fg="#c0caf5">{value}</text>
        </box>
      ))}
      <box style={{ marginTop: 1 }}>
        <text attributes={TextAttributes.DIM}>esc close</text>
      </box>
    </box>
  );
}

function HelpPanel({ provider }: { provider: SessionProvider }) {
  const commands = commandsForProvider(provider);

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title={`Commands · ${providerLabel(provider)}`}
      style={{ padding: 1, minWidth: 54, maxWidth: 96, flexDirection: "column" }}
    >
      {commands.map((command) => (
        <box key={command.name} style={{ flexDirection: "row" }}>
          <text fg="#9ece6a" style={{ width: 16 }}>
            {`/${command.name}`}
          </text>
          <text fg="#c0caf5">{command.description}</text>
        </box>
      ))}
      <box style={{ marginTop: 1, flexDirection: "column" }}>
        <text attributes={TextAttributes.DIM}>
          / commands · ↑↓ history · esc cancel/interrupt · ctrl+c quit
        </text>
        <text attributes={TextAttributes.DIM}>esc close</text>
      </box>
    </box>
  );
}
