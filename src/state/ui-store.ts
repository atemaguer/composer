import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { NavKey, ThreadViewMode } from "../types";

export type NavigationAvailability = {
  canGoBack: boolean;
  canGoForward: boolean;
};

type Updater<T> = T | ((current: T) => T);

export const minReviewContentWidth = 300;
export const maxReviewContentWidth = 720;

const uiPreferencesStorageKey = "composer.ui.preferences";
const threadViewModeStorageKey = "composer.threadViewMode";
const reviewContentWidthStorageKey = "composer.reviewContentWidth";
const defaultReviewContentWidth = 360;

type PersistedUiPreferences = {
  threadViewMode: ThreadViewMode;
  reviewContentWidth: number;
};

export type UiStore = {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  settingsOpen: boolean;
  threadViewMode: ThreadViewMode;
  reviewContentWidth: number;
  inspectorResizing: boolean;
  searchOpen: boolean;
  searchQuery: string;
  activeNav: NavKey;
  navigationAvailability: NavigationAvailability;
  setSidebarOpen: (next: Updater<boolean>) => void;
  toggleSidebarOpen: () => void;
  setInspectorOpen: (next: Updater<boolean>) => void;
  toggleInspectorOpen: () => void;
  setSettingsOpen: (next: Updater<boolean>) => void;
  setThreadViewMode: (next: Updater<ThreadViewMode>) => void;
  setReviewContentWidth: (next: Updater<number>) => void;
  setInspectorResizing: (next: Updater<boolean>) => void;
  setSearchOpen: (next: Updater<boolean>) => void;
  openSearch: (query?: string) => void;
  closeSearch: () => void;
  setSearchQuery: (next: Updater<string>) => void;
  setActiveNav: (next: Updater<NavKey>) => void;
  setNavigationAvailability: (next: Updater<NavigationAvailability>) => void;
  resetUiState: () => void;
};

const defaultNavigationAvailability: NavigationAvailability = {
  canGoBack: false,
  canGoForward: false
};

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      ...createInitialUiState(),
      setSidebarOpen: (next) =>
        set((state) => ({
          sidebarOpen: resolveNextValue(next, state.sidebarOpen)
        })),
      toggleSidebarOpen: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setInspectorOpen: (next) =>
        set((state) => ({
          inspectorOpen: resolveNextValue(next, state.inspectorOpen)
        })),
      toggleInspectorOpen: () =>
        set((state) => ({ inspectorOpen: !state.inspectorOpen })),
      setSettingsOpen: (next) =>
        set((state) => ({
          settingsOpen: resolveNextValue(next, state.settingsOpen)
        })),
      setThreadViewMode: (next) =>
        set((state) => {
          const threadViewMode = normalizeThreadViewMode(
            resolveNextValue(next, state.threadViewMode)
          );

          writeStorage(threadViewModeStorageKey, threadViewMode);
          return { threadViewMode };
        }),
      setReviewContentWidth: (next) =>
        set((state) => {
          const reviewContentWidth = clampReviewContentWidth(
            resolveNextValue(next, state.reviewContentWidth)
          );

          writeStorage(reviewContentWidthStorageKey, String(reviewContentWidth));
          return { reviewContentWidth };
        }),
      setInspectorResizing: (next) =>
        set((state) => ({
          inspectorResizing: resolveNextValue(next, state.inspectorResizing)
        })),
      setSearchOpen: (next) =>
        set((state) => ({
          searchOpen: resolveNextValue(next, state.searchOpen)
        })),
      openSearch: (query) =>
        set((state) => ({
          searchOpen: true,
          searchQuery: query ?? state.searchQuery
        })),
      closeSearch: () => set({ searchOpen: false }),
      setSearchQuery: (next) =>
        set((state) => ({
          searchQuery: resolveNextValue(next, state.searchQuery)
        })),
      setActiveNav: (next) =>
        set((state) => ({
          activeNav: resolveNextValue(next, state.activeNav)
        })),
      setNavigationAvailability: (next) =>
        set((state) => ({
          navigationAvailability: resolveNextValue(
            next,
            state.navigationAvailability
          )
        })),
      resetUiState: () => {
        const nextState = createDefaultUiState();

        writeStorage(threadViewModeStorageKey, nextState.threadViewMode);
        writeStorage(
          reviewContentWidthStorageKey,
          String(nextState.reviewContentWidth)
        );
        set(nextState);
      }
    }),
    {
      name: uiPreferencesStorageKey,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedUiPreferences => ({
        threadViewMode: state.threadViewMode,
        reviewContentWidth: state.reviewContentWidth
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedUiPreferences> | null;
        const threadViewMode = normalizeThreadViewMode(
          persisted?.threadViewMode ?? currentState.threadViewMode
        );
        const reviewContentWidth = clampReviewContentWidth(
          persisted?.reviewContentWidth ?? currentState.reviewContentWidth
        );

        writeStorage(threadViewModeStorageKey, threadViewMode);
        writeStorage(reviewContentWidthStorageKey, String(reviewContentWidth));

        return {
          ...currentState,
          threadViewMode,
          reviewContentWidth
        };
      }
    }
  )
);

function createInitialUiState() {
  return {
    ...createDefaultUiState(),
    threadViewMode: readThreadViewMode(),
    reviewContentWidth: readReviewContentWidth()
  };
}

function createDefaultUiState() {
  return {
    sidebarOpen: true,
    inspectorOpen: false,
    settingsOpen: false,
    threadViewMode: "sidebar" as ThreadViewMode,
    reviewContentWidth: clampReviewContentWidth(defaultReviewContentWidth),
    inspectorResizing: false,
    searchOpen: false,
    searchQuery: "",
    activeNav: "New session" as NavKey,
    navigationAvailability: defaultNavigationAvailability
  };
}

function readThreadViewMode(): ThreadViewMode {
  return normalizeThreadViewMode(readStorage(threadViewModeStorageKey));
}

function normalizeThreadViewMode(value: unknown): ThreadViewMode {
  return value === "tabs" || value === "sidebar" ? value : "sidebar";
}

function readReviewContentWidth() {
  return clampReviewContentWidth(
    Number(readStorage(reviewContentWidthStorageKey)) ||
      defaultReviewContentWidth
  );
}

export function clampReviewContentWidth(value: number) {
  const viewportLimit =
    typeof window === "undefined"
      ? maxReviewContentWidth
      : Math.max(minReviewContentWidth, Math.floor(window.innerWidth * 0.62));

  return Math.min(
    Math.max(Math.round(value), minReviewContentWidth),
    Math.min(maxReviewContentWidth, viewportLimit)
  );
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

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local storage can be disabled in embedded previews.
  }
}
