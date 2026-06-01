import {
  providerLabel,
  providerModelOptions,
  runtimeProviderDefinitions,
  type AgentModel,
  type IntelligenceMode,
  type PermissionMode,
  type SessionProvider
} from "@composer/client";
import { useTui } from "../store.js";
import { topDialog, type Dialog } from "../types.js";
import type { RuntimeApi } from "../runtime.js";
import { DialogSelect } from "./dialogs/DialogSelect.js";

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

/**
 * Slash-command pickers that render inline (in the normal flow, just above the
 * prompt) rather than as a centered modal — matching the `/model`-style list.
 * Everything else stays a modal overlay (see DialogHost). Keep this set and the
 * `DialogHost` switch mutually exclusive so a dialog renders in exactly one place.
 */
const INLINE_DIALOG_KINDS: ReadonlySet<Dialog["kind"]> = new Set([
  "provider",
  "model",
  "intelligence",
  "permission",
  "sessions"
]);

export function isInlineDialog(dialog: Dialog | null): boolean {
  return dialog !== null && INLINE_DIALOG_KINDS.has(dialog.kind);
}

/**
 * Renders the focused dialog inline when it is a slash-command picker. The
 * `<select>` inside owns arrow/Enter while focused; Esc is handled by App.
 * Selecting dispatches the same action the modal did — which also pops the
 * dialog off the stack — so behaviour is identical, only the placement changes.
 */
export function InlineDialog({ runtime }: { runtime: RuntimeApi }) {
  const { state, dispatch } = useTui();
  const dialog = topDialog(state);

  if (!dialog || !INLINE_DIALOG_KINDS.has(dialog.kind)) {
    return null;
  }

  switch (dialog.kind) {
    case "provider":
      return (
        <DialogSelect<SessionProvider>
          inline
          command="provider"
          title="Available providers"
          options={runtimeProviderDefinitions.map((definition) => ({
            name: definition.label,
            description: definition.statusLabel,
            value: definition.id
          }))}
          onSelect={(option) =>
            dispatch({ type: "setProvider", provider: option.value })
          }
        />
      );

    case "model":
      return (
        <DialogSelect<AgentModel>
          inline
          command="model"
          title={`Available models · ${providerLabel(state.provider)}`}
          options={providerModelOptions(state.provider).map((model) => ({
            name: model.label,
            description: model.detail,
            value: model.value
          }))}
          onSelect={(option) =>
            dispatch({ type: "setModel", model: option.value })
          }
        />
      );

    case "intelligence":
      return (
        <DialogSelect<IntelligenceMode>
          inline
          command="effort"
          title="Reasoning effort"
          options={INTELLIGENCE_OPTIONS.map((value) => ({ name: value, value }))}
          onSelect={(option) =>
            dispatch({ type: "setIntelligence", intelligence: option.value })
          }
        />
      );

    case "permission":
      return (
        <DialogSelect<PermissionMode>
          inline
          command="permissions"
          title="Permissions"
          options={PERMISSION_OPTIONS.map((value) => ({ name: value, value }))}
          onSelect={(option) =>
            dispatch({ type: "setPermission", permission: option.value })
          }
        />
      );

    case "sessions": {
      const fromProjects = state.projects.flatMap((project) =>
        project.threads.map((thread) => ({
          name: thread.name,
          description: `${thread.provider ?? ""} ${thread.age ?? ""}`.trim(),
          value: thread.id
        }))
      );
      const options =
        fromProjects.length > 0
          ? fromProjects
          : Object.values(state.sessions).map((session) => ({
              name: session.title,
              description: session.id,
              value: session.id
            }));

      return (
        <DialogSelect<string>
          inline
          command="sessions"
          title="Resume a session"
          options={options}
          loading={state.sessionsLoading}
          loadingLabel="Loading sessions…"
          onSelect={(option) => {
            runtime.loadSession(option.value);
            dispatch({ type: "popDialog" });
          }}
        />
      );
    }

    default:
      return null;
  }
}
