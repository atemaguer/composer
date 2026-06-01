import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  builtInThemeMap,
  defaultCodeFontFamily,
  defaultUiFontFamily,
  fallbackThemeByScheme
} from "../theme/presets";
import type {
  AppearanceSettings,
  EditableThemeFields,
  ThemeColorTokens,
  ThemeContrast,
  ThemeMode,
  ThemePresetId,
  ThemeScheme,
  ThemeTypographyTokens
} from "../theme/types";
import { resolveState, type StateUpdater } from "./state-utils";

export const minUiFontSize = 12;
export const maxUiFontSize = 18;
export const minCodeFontSize = 10;
export const maxCodeFontSize = 16;
export const minThemeContrast = 0;
export const maxThemeContrast = 100;

const appearanceStorageKey = "composer.appearance.preferences";

type PersistedAppearanceSettings = Partial<AppearanceSettings>;

export type AppearanceStore = AppearanceSettings & {
  setAppearanceSettings: (value: StateUpdater<AppearanceSettings>) => void;
  setMode: (value: StateUpdater<ThemeMode>) => void;
  setThemeForScheme: (
    scheme: ThemeScheme,
    value: StateUpdater<ThemePresetId>
  ) => void;
  setOverridesForScheme: (
    scheme: ThemeScheme,
    value: StateUpdater<EditableThemeFields>
  ) => void;
  clearOverridesForScheme: (scheme: ThemeScheme) => void;
  setTranslucentSidebar: (value: StateUpdater<boolean>) => void;
  setContrast: (value: StateUpdater<ThemeContrast>) => void;
  setUiFontFamily: (value: StateUpdater<string>) => void;
  setCodeFontFamily: (value: StateUpdater<string>) => void;
  setUiFontSize: (value: StateUpdater<number>) => void;
  setCodeFontSize: (value: StateUpdater<number>) => void;
  setFontSmoothing: (value: StateUpdater<boolean>) => void;
  setEnableLiquidGlass: (value: StateUpdater<boolean>) => void;
  setShowSubagentSessions: (value: StateUpdater<boolean>) => void;
  resetAppearanceSettings: () => void;
};

export const defaultAppearanceSettings: AppearanceSettings = {
  mode: "system",
  selectedThemeByScheme: {
    light: fallbackThemeByScheme.light,
    dark: fallbackThemeByScheme.dark
  },
  overridesByScheme: {
    light: {},
    dark: {}
  },
  translucentSidebar: true,
  contrast: 40,
  uiFontFamily: defaultUiFontFamily,
  codeFontFamily: defaultCodeFontFamily,
  uiFontSize: 14,
  codeFontSize: 12,
  fontSmoothing: false,
  enableLiquidGlass: false,
  showSubagentSessions: false
};

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set) => ({
      ...defaultAppearanceSettings,
      setAppearanceSettings: (value) =>
        set((state) =>
          normalizeAppearanceSettings(
            resolveState(value, selectAppearanceSettings(state))
          )
        ),
      setMode: (value) =>
        set((state) => ({
          mode: normalizeThemeMode(resolveState(value, state.mode))
        })),
      setThemeForScheme: (scheme, value) =>
        set((state) => {
          const currentThemeId = state.selectedThemeByScheme[scheme];
          const themeId = normalizeThemePresetIdForScheme(
            resolveState(value, currentThemeId),
            scheme
          );

          return {
            selectedThemeByScheme: {
              ...state.selectedThemeByScheme,
              [scheme]: themeId
            }
          };
        }),
      setOverridesForScheme: (scheme, value) =>
        set((state) => {
          const overrides = normalizeEditableThemeFields(
            resolveState(value, state.overridesByScheme[scheme])
          );

          return {
            overridesByScheme: {
              ...state.overridesByScheme,
              [scheme]: overrides
            }
          };
        }),
      clearOverridesForScheme: (scheme) =>
        set((state) => ({
          overridesByScheme: {
            ...state.overridesByScheme,
            [scheme]: {}
          }
        })),
      setTranslucentSidebar: (value) =>
        set((state) => ({
          translucentSidebar: normalizeBoolean(
            resolveState(value, state.translucentSidebar),
            defaultAppearanceSettings.translucentSidebar
          )
        })),
      setContrast: (value) =>
        set((state) => ({
          contrast: normalizeThemeContrast(resolveState(value, state.contrast))
        })),
      setUiFontFamily: (value) =>
        set((state) => ({
          uiFontFamily: normalizeFontFamily(
            resolveState(value, state.uiFontFamily),
            defaultUiFontFamily
          )
        })),
      setCodeFontFamily: (value) =>
        set((state) => ({
          codeFontFamily: normalizeFontFamily(
            resolveState(value, state.codeFontFamily),
            defaultCodeFontFamily
          )
        })),
      setUiFontSize: (value) =>
        set((state) => ({
          uiFontSize: clampUiFontSize(resolveState(value, state.uiFontSize))
        })),
      setCodeFontSize: (value) =>
        set((state) => ({
          codeFontSize: clampCodeFontSize(
            resolveState(value, state.codeFontSize)
          )
        })),
      setFontSmoothing: (value) =>
        set((state) => ({
          fontSmoothing: normalizeBoolean(
            resolveState(value, state.fontSmoothing),
            defaultAppearanceSettings.fontSmoothing
          )
        })),
      setEnableLiquidGlass: (value) =>
        set((state) => ({
          enableLiquidGlass: normalizeBoolean(
            resolveState(value, state.enableLiquidGlass),
            defaultAppearanceSettings.enableLiquidGlass
          )
        })),
      setShowSubagentSessions: (value) =>
        set((state) => ({
          showSubagentSessions: normalizeBoolean(
            resolveState(value, state.showSubagentSessions),
            defaultAppearanceSettings.showSubagentSessions
          )
        })),
      resetAppearanceSettings: () => set(defaultAppearanceSettings)
    }),
    {
      name: appearanceStorageKey,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedAppearanceSettings => ({
        mode: state.mode,
        selectedThemeByScheme: state.selectedThemeByScheme,
        overridesByScheme: state.overridesByScheme,
        translucentSidebar: state.translucentSidebar,
        contrast: state.contrast,
        uiFontFamily: state.uiFontFamily,
        codeFontFamily: state.codeFontFamily,
        uiFontSize: state.uiFontSize,
        codeFontSize: state.codeFontSize,
        fontSmoothing: state.fontSmoothing,
        enableLiquidGlass: state.enableLiquidGlass,
        showSubagentSessions: state.showSubagentSessions
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizeAppearanceSettings(persistedState)
      })
    }
  )
);

function selectAppearanceSettings(state: AppearanceStore): AppearanceSettings {
  return {
    mode: state.mode,
    selectedThemeByScheme: state.selectedThemeByScheme,
    overridesByScheme: state.overridesByScheme,
    translucentSidebar: state.translucentSidebar,
    contrast: state.contrast,
    uiFontFamily: state.uiFontFamily,
    codeFontFamily: state.codeFontFamily,
    uiFontSize: state.uiFontSize,
    codeFontSize: state.codeFontSize,
    fontSmoothing: state.fontSmoothing,
    enableLiquidGlass: state.enableLiquidGlass,
    showSubagentSessions: state.showSubagentSessions
  };
}

export function normalizeAppearanceSettings(
  value: unknown
): AppearanceSettings {
  const settings = isRecord(value) ? value : {};

  return {
    mode: normalizeThemeMode(settings.mode),
    selectedThemeByScheme: normalizeSelectedThemeByScheme(
      settings.selectedThemeByScheme
    ),
    overridesByScheme: normalizeOverridesByScheme(settings.overridesByScheme),
    translucentSidebar: normalizeBoolean(
      settings.translucentSidebar,
      defaultAppearanceSettings.translucentSidebar
    ),
    contrast: normalizeThemeContrast(settings.contrast),
    uiFontFamily: normalizeFontFamily(
      settings.uiFontFamily,
      defaultUiFontFamily
    ),
    codeFontFamily: normalizeFontFamily(
      settings.codeFontFamily,
      defaultCodeFontFamily
    ),
    uiFontSize: clampUiFontSize(settings.uiFontSize),
    codeFontSize: clampCodeFontSize(settings.codeFontSize),
    fontSmoothing: normalizeBoolean(
      settings.fontSmoothing,
      defaultAppearanceSettings.fontSmoothing
    ),
    enableLiquidGlass: normalizeBoolean(
      settings.enableLiquidGlass,
      defaultAppearanceSettings.enableLiquidGlass
    ),
    showSubagentSessions: normalizeBoolean(
      settings.showSubagentSessions,
      defaultAppearanceSettings.showSubagentSessions
    )
  };
}

export function clampUiFontSize(value: unknown) {
  return clampNumber(
    value,
    minUiFontSize,
    maxUiFontSize,
    defaultAppearanceSettings.uiFontSize
  );
}

export function clampCodeFontSize(value: unknown) {
  return clampNumber(
    value,
    minCodeFontSize,
    maxCodeFontSize,
    defaultAppearanceSettings.codeFontSize
  );
}

function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : defaultAppearanceSettings.mode;
}

function normalizeThemeContrast(value: unknown): ThemeContrast {
  return clampNumber(
    value,
    minThemeContrast,
    maxThemeContrast,
    defaultAppearanceSettings.contrast
  );
}

function normalizeSelectedThemeByScheme(
  value: unknown
): Record<ThemeScheme, ThemePresetId> {
  const selected = isRecord(value) ? value : {};

  return {
    light: normalizeThemePresetIdForScheme(selected.light, "light"),
    dark: normalizeThemePresetIdForScheme(selected.dark, "dark")
  };
}

function normalizeThemePresetIdForScheme(
  value: unknown,
  scheme: ThemeScheme
): ThemePresetId {
  if (typeof value !== "string") {
    return fallbackThemeByScheme[scheme];
  }

  const theme = builtInThemeMap[value as ThemePresetId];
  return theme?.scheme === scheme ? theme.id : fallbackThemeByScheme[scheme];
}

function normalizeOverridesByScheme(
  value: unknown
): Record<ThemeScheme, EditableThemeFields> {
  const overrides = isRecord(value) ? value : {};

  return {
    light: normalizeEditableThemeFields(overrides.light),
    dark: normalizeEditableThemeFields(overrides.dark)
  };
}

function normalizeEditableThemeFields(value: unknown): EditableThemeFields {
  if (!isRecord(value)) {
    return {};
  }

  return {
    colors: normalizePartialColorTokens(value.colors),
    typography: normalizePartialTypographyTokens(value.typography)
  };
}

function normalizePartialColorTokens(
  value: unknown
): Partial<ThemeColorTokens> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(
    colorTokenKeys.flatMap((key) => {
      const token = value[key];
      return typeof token === "string" && token.trim() !== ""
        ? [[key, token.trim()]]
        : [];
    })
  ) as Partial<ThemeColorTokens>;
}

function normalizePartialTypographyTokens(
  value: unknown
): Partial<ThemeTypographyTokens> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const typography: Partial<ThemeTypographyTokens> = {};

  if (typeof value.uiFontFamily === "string") {
    typography.uiFontFamily = normalizeFontFamily(
      value.uiFontFamily,
      defaultUiFontFamily
    );
  }

  if (typeof value.codeFontFamily === "string") {
    typography.codeFontFamily = normalizeFontFamily(
      value.codeFontFamily,
      defaultCodeFontFamily
    );
  }

  if (value.uiFontSize !== undefined) {
    typography.uiFontSize = clampUiFontSize(value.uiFontSize);
  }

  if (value.codeFontSize !== undefined) {
    typography.codeFontSize = clampCodeFontSize(value.codeFontSize);
  }

  if (value.fontSmoothing !== undefined) {
    typography.fontSmoothing = normalizeBoolean(value.fontSmoothing, true);
  }

  return typography;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeFontFamily(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numberValue), min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const colorTokenKeys = [
  "background",
  "foreground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "border",
  "input",
  "ring",
  "destructive",
  "appBg",
  "appShell",
  "appSidebar",
  "appSidebarTranslucent",
  "appPanel",
  "appPanel2",
  "appLine",
  "appLineStrong",
  "appLineBright",
  "appText",
  "appMuted",
  "appDim",
  "appBlue",
  "appGreen",
  "appOrange",
  "overlay",
  "overlayStrong",
  "hover",
  "hoverStrong",
  "shadow",
  "shadowStrong",
  "focus",
  "selection",
  "editorBackground",
  "editorForeground",
  "editorGutter",
  "editorLineNumber",
  "editorActiveLine",
  "editorSelection",
  "editorCursor"
] as const satisfies readonly (keyof ThemeColorTokens)[];
