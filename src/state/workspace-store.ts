import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { PromptComposerFooterOption } from "../components/Composer";
import type { SessionContent } from "../types";

export type WorkspaceOption = PromptComposerFooterOption;

type Updater<T> = T | ((current: T) => T);

const workspacePreferencesStorageKey = "composer.workspace.preferences";
const workspaceStorageKey = "composer.workspaces";
const selectedWorkspaceStorageKey = "composer.selectedWorkspace";

type PersistedWorkspacePreferences = {
  workspaceOptions: WorkspaceOption[];
  selectedWorkspaceId: string;
};

export type WorkspaceStore = {
  workspaceOptions: WorkspaceOption[];
  selectedWorkspaceId: string;
  setWorkspaceOptions: (next: Updater<WorkspaceOption[]>) => void;
  setSelectedWorkspaceId: (next: Updater<string>) => void;
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

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaceOptions: loadWorkspaceOptions(),
      selectedWorkspaceId: readStorage(selectedWorkspaceStorageKey) ?? "",
      setWorkspaceOptions: (next) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions(
            resolveNextValue(next, state.workspaceOptions)
          );

          writeWorkspaceOptions(workspaceOptions);
          return { workspaceOptions };
        }),
      setSelectedWorkspaceId: (next) =>
        set((state) => {
          const selectedWorkspaceId = resolveNextValue(
            next,
            state.selectedWorkspaceId
          );

          writeSelectedWorkspaceId(selectedWorkspaceId);
          return { selectedWorkspaceId };
        }),
      selectWorkspace: (workspace) =>
        set((state) => {
          if (!workspace) {
            writeSelectedWorkspaceId("");
            return { selectedWorkspaceId: "" };
          }

          if (typeof workspace === "string") {
            writeSelectedWorkspaceId(workspace);
            return { selectedWorkspaceId: workspace };
          }

          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            workspace
          ]);
          const selectedWorkspaceId = workspace.cwd ?? workspace.id;

          writeWorkspaceOptions(workspaceOptions);
          writeSelectedWorkspaceId(selectedWorkspaceId);
          return { workspaceOptions, selectedWorkspaceId };
        }),
      upsertWorkspaceOption: (workspace) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            workspace
          ]);

          writeWorkspaceOptions(workspaceOptions);
          return { workspaceOptions };
        }),
      addWorkspaceOption: (workspace) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            workspace
          ]);

          writeWorkspaceOptions(workspaceOptions);
          return { workspaceOptions };
        }),
      removeWorkspaceOption: (workspaceId) =>
        set((state) => {
          const normalizedId = normalizePathKey(workspaceId);
          const workspaceOptions = state.workspaceOptions.filter(
            (workspace) =>
              normalizePathKey(workspace.cwd ?? workspace.id) !== normalizedId
          );
          const selectedWorkspaceId =
            normalizePathKey(state.selectedWorkspaceId) === normalizedId
              ? workspaceOptions[0]?.id ?? ""
              : state.selectedWorkspaceId;

          writeWorkspaceOptions(workspaceOptions);
          writeSelectedWorkspaceId(selectedWorkspaceId);
          return { workspaceOptions, selectedWorkspaceId };
        }),
      mergeWorkspaceOptions: (workspaces) =>
        set((state) => {
          const workspaceOptions = mergeWorkspaceOptions([
            ...state.workspaceOptions,
            ...workspaces
          ]);

          writeWorkspaceOptions(workspaceOptions);
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
            writeWorkspaceOptions(workspaceOptions);
            return { workspaceOptions };
          }

          const selectedWorkspaceId = workspaceOptions[0]?.id ?? "";

          writeWorkspaceOptions(workspaceOptions);
          writeSelectedWorkspaceId(selectedWorkspaceId);
          return { workspaceOptions, selectedWorkspaceId };
        }),
      getSelectedWorkspace: () => {
        const { selectedWorkspaceId, workspaceOptions } = get();

        return getSelectedWorkspace(workspaceOptions, selectedWorkspaceId);
      },
      resetWorkspacePreferences: () => {
        writeWorkspaceOptions([]);
        writeSelectedWorkspaceId("");
        set({ workspaceOptions: [], selectedWorkspaceId: "" });
      }
    }),
    {
      name: workspacePreferencesStorageKey,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedWorkspacePreferences => ({
        workspaceOptions: state.workspaceOptions,
        selectedWorkspaceId: state.selectedWorkspaceId
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState as Partial<PersistedWorkspacePreferences> | null;
        const workspaceOptions = mergeWorkspaceOptions(
          persisted?.workspaceOptions ?? currentState.workspaceOptions
        );
        const selectedWorkspaceId =
          persisted?.selectedWorkspaceId ?? currentState.selectedWorkspaceId;

        writeWorkspaceOptions(workspaceOptions);
        writeSelectedWorkspaceId(selectedWorkspaceId);

        return {
          ...currentState,
          workspaceOptions,
          selectedWorkspaceId
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

function loadWorkspaceOptions(): WorkspaceOption[] {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey);
    const parsed = raw ? (JSON.parse(raw) as WorkspaceOption[]) : [];

    return Array.isArray(parsed) ? mergeWorkspaceOptions(parsed) : [];
  } catch {
    return [];
  }
}

function basename(filePath: string) {
  return filePath.replace(/\/+$/, "").split("/").pop() || filePath;
}

function normalizePathKey(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveNextValue<T>(next: Updater<T>, current: T) {
  return typeof next === "function"
    ? (next as (currentValue: T) => T)(current)
    : next;
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeWorkspaceOptions(workspaceOptions: WorkspaceOption[]) {
  writeStorage(workspaceStorageKey, JSON.stringify(workspaceOptions));
}

function writeSelectedWorkspaceId(selectedWorkspaceId: string) {
  try {
    if (selectedWorkspaceId) {
      window.localStorage.setItem(selectedWorkspaceStorageKey, selectedWorkspaceId);
    } else {
      window.localStorage.removeItem(selectedWorkspaceStorageKey);
    }
  } catch {
    // Local storage can be disabled in embedded previews.
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local storage can be disabled in embedded previews.
  }
}
