import { TextAttributes } from "@opentui/core";
import {
  providerModelOptions,
  runtimeProviderDefinitions,
  type AgentModel,
  type ApprovalDecision,
  type IntelligenceMode,
  type PermissionMode,
  type SessionProvider
} from "@composer/client";
import { useTui } from "../store.js";
import type { OverlayMode } from "../types.js";
import type { RuntimeApi } from "../runtime.js";

type SelectOption = { name: string; description: string; value: unknown };

const INTELLIGENCE_OPTIONS: IntelligenceMode[] = [
  "Low",
  "Medium",
  "High",
  "Extra High"
];

const PERMISSION_OPTIONS: PermissionMode[] = [
  "Default permissions",
  "Auto-review",
  "Full access"
];

function titleFor(overlay: OverlayMode): string {
  switch (overlay.kind) {
    case "provider":
      return "Select provider";
    case "model":
      return "Select model";
    case "intelligence":
      return "Select intelligence";
    case "permission":
      return "Select permissions";
    case "sessions":
      return "Sessions";
    case "approval":
      return "Approval required";
    default:
      return "";
  }
}

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

export function Overlay({ runtime }: { runtime: RuntimeApi }) {
  const { state, dispatch } = useTui();
  const overlay = state.overlay;

  const closeOverlay = () =>
    dispatch({ type: "setOverlay", overlay: { kind: "none" } });

  let options: SelectOption[] = [];
  let onSelect: (option: SelectOption | null) => void = () => undefined;
  let detailLines: string[] = [];

  switch (overlay.kind) {
    case "provider": {
      options = runtimeProviderDefinitions.map((definition) => ({
        name: definition.label,
        description: definition.statusLabel,
        value: definition.id
      }));
      onSelect = (option) => {
        if (option) {
          dispatch({
            type: "setProvider",
            provider: option.value as SessionProvider
          });
        }
      };
      break;
    }

    case "model": {
      options = providerModelOptions(state.provider).map((model) => ({
        name: model.label,
        description: model.detail,
        value: model.value
      }));
      onSelect = (option) => {
        if (option) {
          dispatch({ type: "setModel", model: option.value as AgentModel });
        }
      };
      break;
    }

    case "intelligence": {
      options = INTELLIGENCE_OPTIONS.map((value) => ({
        name: value,
        description: "",
        value
      }));
      onSelect = (option) => {
        if (option) {
          dispatch({
            type: "setIntelligence",
            intelligence: option.value as IntelligenceMode
          });
        }
      };
      break;
    }

    case "permission": {
      options = PERMISSION_OPTIONS.map((value) => ({
        name: value,
        description: "",
        value
      }));
      onSelect = (option) => {
        if (option) {
          dispatch({
            type: "setPermission",
            permission: option.value as PermissionMode
          });
        }
      };
      break;
    }

    case "sessions": {
      const projectOptions: SelectOption[] = state.projects.flatMap((project) =>
        project.threads.map((thread) => ({
          name: thread.name,
          description: `${thread.provider ?? ""} ${thread.age ?? ""}`.trim(),
          value: thread.id
        }))
      );

      options =
        projectOptions.length > 0
          ? projectOptions
          : Object.values(state.sessions).map((session) => ({
              name: session.title,
              description: session.id,
              value: session.id
            }));

      onSelect = (option) => {
        if (option) {
          runtime.loadSession(option.value as string);
        }
        closeOverlay();
      };
      break;
    }

    case "approval": {
      const { approval } = overlay;
      if (approval.details) {
        detailLines = Object.entries(approval.details).map(
          ([key, value]) => `${key}: ${value}`
        );
      }
      options = approval.availableDecisions.map((decision) => ({
        name: decisionLabel(decision),
        description: "",
        value: decision
      }));
      onSelect = (option) => {
        if (option) {
          runtime.resolveApproval(
            approval.id,
            option.value as ApprovalDecision
          );
        }
        closeOverlay();
      };
      break;
    }

    default:
      return null;
  }

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title={titleFor(overlay)}
      style={{ padding: 1, minWidth: 40, maxWidth: 80, flexDirection: "column" }}
    >
      {overlay.kind === "approval" ? (
        <box style={{ marginBottom: 1, flexDirection: "column" }}>
          <text fg="#c0caf5">{overlay.approval.title}</text>
          {detailLines.map((line, index) => (
            <text key={index} attributes={TextAttributes.DIM}>
              {line}
            </text>
          ))}
        </box>
      ) : null}
      <select
        focused
        options={options}
        onSelect={(_index, option) => onSelect(option as SelectOption | null)}
      />
    </box>
  );
}
