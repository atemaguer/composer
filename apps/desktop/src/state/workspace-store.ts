import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { PromptComposerFooterOption } from "../components/Composer";
import type { SessionContent, SessionProvider } from "../types";

export type WorkspaceOption = PromptComposerFooterOption;

type Updater<T> = T | ((current: T) => T);

const workspacePreferencesStorageKey = "composer.workspace.preferences";

type PersistedWorkspacePreferences = {
  workspaceOptions: WorkspaceOption[];
  selectedWorkspaceId: string;
  defaultProviderByWorkspace: Record<string, SessionProvider>;
};

export type WorkspaceStore = {
  workspaceOptions: WorkspaceOption[];
  selectedWorkspaceId: string;
  defaultProviderByWorkspace: Record<string, SessionProvider>;
  setWorkspaceOptions: (next: Updater<WorkspaceOption[]>) => void;
  setSelectedWorkspaceId: (next: Updater<string>) => void;
  setWorkspaceDefaultProvider: (
    workspaceId: string | undefined,
    provider: SessionProvider
  ) => void;
  getWorkspaceDefaultProvider: (
    workspaceId: string | undefined
  ) => SessionProvider | undefined;
  selectWorkspace: (workspace: WorkspaceOption | string | undefined) => void;
  upsertWorkspaceOption: (workspace: WorkspaceOption | undefined) => void;
  addWorkspaceOption: (workspace: WorkspaceOption | undefined) => void;
  removeWorkspaceOption: (workspaceId: string) => void;
  mergeWorkspaceOptions: (
    workspaces: Array<WorkspaceOption | undefined>
  ) => void;
  ensureSelectedWorkspace: (
    workspaces?: Array<WorkspaceOption | undefined>
  ) => void;
  getSelectedWorkspace: () => WorkspaceOption | undefined;
  resetWorkspacePreferences: () => void;
};

const initialPreferences = loadPersistedPreferences();

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaceOptions: initialPreferences.workspaceOptions,
      selectedWorkspaceId: initialPreferences.selectedWorkspaceId,
      defaultProviderByWorkspace: initialPreferences.defaultProviderByWorkspace,
      setWorkspaceOptions: (next) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions(
            resolveNextValue(next, state.workspaceOptions)
          );

          return { workspaceOptions };
        }),
      setSelectedWorkspaceId: (next) =>
        set((state) => {
          const selectedWorkspaceId = resolveNextValue(
            next,
            state.selectedWorkspaceId
          );

          return { selectedWorkspaceId };
        }),
      setWorkspaceDefaultProvider: (workspaceId, provider) =>
        set((state) => {
          const normalizedId = normalizeWorkspaceId(workspaceId);

          if (!normalizedId) {
            return {};
          }

          return {
            defaultProviderByWorkspace: {
              ...state.defaultProviderByWorkspace,
              [normalizedId]: provider
            }
          };
        }),
      getWorkspaceDefaultProvider: (workspaceId) => {
        const normalizedId = normalizeWorkspaceId(workspaceId);

        return normalizedId
          ? get().defaultProviderByWorkspace[normalizedId]
          : undefined;
      },
      selectWorkspace: (workspace) =>
        set((state) => {
          if (!workspace) {
            return { selectedWorkspaceId: "" };
          }

          if (typeof workspace === "string") {
            return { selectedWorkspaceId: workspace };
          }

          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            workspace
          ]);
          const selectedWorkspaceId = workspace.cwd ?? workspace.id;

          return { workspaceOptions, selectedWorkspaceId };
        }),
      upsertWorkspaceOption: (workspace) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            workspace
          ]);

          return { workspaceOptions };
        }),
      addWorkspaceOption: (workspace) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            workspace
          ]);

          return { workspaceOptions };
        }),
      removeWorkspaceOption: (workspaceId) =>
        set((state) => {
          const normalizedId = normalizeWorkspaceId(workspaceId);
          const workspaceOptions = state.workspaceOptions.filter(
            (workspace) =>
              normalizeWorkspaceId(workspace.cwd ?? workspace.id) !== normalizedId
          );
          const selectedWorkspaceId =
            normalizeWorkspaceId(state.selectedWorkspaceId) === normalizedId
              ? workspaceOptions[0]?.id ?? ""
              : state.selectedWorkspaceId;
          const { [normalizedId]: _removed, ...defaultProviderByWorkspace } =
            state.defaultProviderByWorkspace;

          return {
            workspaceOptions,
            selectedWorkspaceId,
            defaultProviderByWorkspace
          };
        }),
      mergeWorkspaceOptions: (workspaces) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            ...workspaces
          ]);

          return { workspaceOptions };
        }),
      ensureSelectedWorkspace: (workspaces = []) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            ...workspaces
          ]);

          if (
            state.selectedWorkspaceId &&
            workspaceOptions.some(
              (workspace) => workspace.id === state.selectedWorkspaceId
            )
          ) {
            return { workspaceOptions };
          }

          const selectedWorkspaceId = workspaceOptions[0]?.id ?? "";

          return { workspaceOptions, selectedWorkspaceId };
        }),
      getSelectedWorkspace: () => {
        const { selectedWorkspaceId, workspaceOptions } = get();

        return getSelectedWorkspace(workspaceOptions, selectedWorkspaceId);
      },
      resetWorkspacePreferences: () => {
        set({
          workspaceOptions: [],
          selectedWorkspaceId: "",
          defaultProviderByWorkspace: {}
        });
      }
    }),
    {
      name: workspacePreferencesStorageKey,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedWorkspacePreferences => ({
        workspaceOptions: state.workspaceOptions,
        selectedWorkspaceId: state.selectedWorkspaceId,
        defaultProviderByWorkspace: state.defaultProviderByWorkspace
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState as Partial<PersistedWorkspacePreferences> | null;
        const workspaceOptions = mergeWorkspaceOptions(
          persisted?.workspaceOptions ?? currentState.workspaceOptions
        );
        const selectedWorkspaceId =
          persisted?.selectedWorkspaceId ?? currentState.selectedWorkspaceId;
        const defaultProviderByWorkspace = normalizeProviderMap({
          ...currentState.defaultProviderByWorkspace,
          ...persisted?.defaultProviderByWorkspace
        });

        return {
          ...currentState,
          workspaceOptions,
          selectedWorkspaceId,
          defaultProviderByWorkspace
        };
      }
    }
  )
);

export function workspaceOptionsFromSessions(
  sessions: Record<string, SessionContent>
): WorkspaceOption[] {
  return Object.values(sessions).flatMap((session) => {
    if (!session.cwd) {
      return [];
    }

    return [
      {
        id: session.cwd,
        label: basename(session.cwd),
        cwd: session.cwd,
        detail: session.cwd
      }
    ];
  });
}

export function mergeWorkspaceOptions(
  options: Array<WorkspaceOption | undefined>
): WorkspaceOption[] {
  const byId = new Map<string, WorkspaceOption>();

  for (const option of options) {
    const normalized = normalizeWorkspaceOption(option);

    if (!normalized) {
      continue;
    }

    byId.set(normalized.id, normalized);
  }

  return [...byId.values()];
}

export function getSelectedWorkspace(
  workspaceOptions: WorkspaceOption[],
  selectedWorkspaceId: string
) {
  return (
    workspaceOptions.find((option) => option.id === selectedWorkspaceId) ??
    workspaceOptions[0]
  );
}

function normalizeWorkspaceOption(
  option: WorkspaceOption | undefined
): WorkspaceOption | undefined {
  if (
    !option ||
    typeof option.id !== "string" ||
    typeof option.label !== "string"
  ) {
    return undefined;
  }

  const id = option.cwd ?? option.id;

  return {
    ...option,
    id
  };
}

function loadPersistedPreferences(): PersistedWorkspacePreferences {
  const empty: PersistedWorkspacePreferences = {
    workspaceOptions: [],
    selectedWorkspaceId: "",
    defaultProviderByWorkspace: {}
  };

  try {
    const raw = window.localStorage.getItem(workspacePreferencesStorageKey);

    if (!raw) {
      return empty;
    }

    // zustand's persist middleware wraps the partialized state under `state`.
    const parsed = JSON.parse(raw) as {
      state?: Partial<PersistedWorkspacePreferences>;
    } | null;
    const state = parsed?.state;

    return {
      workspaceOptions: mergeWorkspaceOptions(state?.workspaceOptions ?? []),
      selectedWorkspaceId:
        typeof state?.selectedWorkspaceId === "string"
          ? state.selectedWorkspaceId
          : "",
      defaultProviderByWorkspace: normalizeProviderMap(
        state?.defaultProviderByWorkspace
      )
    };
  } catch {
    return empty;
  }
}

function basename(filePath: string) {
  return filePath.replace(/\/+$/, "").split("/").pop() || filePath;
}

function normalizeWorkspaceId(value: string | undefined) {
  return value?.replace(/\/+$/, "") ?? "";
}

function normalizeProviderMap(
  value: Partial<Record<string, SessionProvider>> | undefined
): Record<string, SessionProvider> {
  const next: Record<string, SessionProvider> = {};

  if (!value) {
    return next;
  }

  for (const [workspaceId, provider] of Object.entries(value)) {
    const normalizedId = normalizeWorkspaceId(workspaceId);

    if (normalizedId && isSessionProvider(provider)) {
      next[normalizedId] = provider;
    }
  }

  return next;
}

function isSessionProvider(value: unknown): value is SessionProvider {
  return value === "codex" || value === "claude" || value === "meta";
}

function resolveNextValue<T>(next: Updater<T>, current: T) {
  return typeof next === "function"
    ? (next as (currentValue: T) => T)(current)
    : next;
}
