import {
  builtInThemeMap,
  defaultCodeFontFamily,
  defaultUiFontFamily,
  fallbackThemeByScheme
} from "./presets";
import type {
  AppearanceSettings,
  ComposerThemeDefinition,
  ResolvedAppearanceTheme,
  ThemeColorTokens,
  ThemePresetId,
  ThemeScheme,
  ThemeTypographyTokens
} from "./types";

export function resolveAppearanceTheme(
  settings: AppearanceSettings,
  systemScheme: ThemeScheme
): ResolvedAppearanceTheme {
  const activeScheme = resolveActiveScheme(settings.mode, systemScheme);
  const theme = resolveThemeDefinition(
    settings.selectedThemeByScheme[activeScheme],
    activeScheme
  );
  const override = settings.overridesByScheme[activeScheme];
  const colors = applyContrast(
    {
      ...theme.colors,
      ...override.colors
    },
    settings.contrast
  );
  const typography = {
    ...theme.typography,
    uiFontFamily: settings.uiFontFamily,
    codeFontFamily: settings.codeFontFamily,
    uiFontSize: settings.uiFontSize,
    codeFontSize: settings.codeFontSize,
    fontSmoothing: settings.fontSmoothing,
    ...override.typography
  } satisfies ThemeTypographyTokens;

  const resolvedTheme: ComposerThemeDefinition = {
    ...theme,
    colors,
    typography
  };
  const cssVariables = createCssVariables(
    colors,
    typography,
    settings.translucentSidebar
  );

  return {
    activeScheme,
    themeSource: settings.mode,
    theme: resolvedTheme,
    backgroundColor: colors.appBg,
    cssVariables
  };
}

function resolveActiveScheme(
  mode: AppearanceSettings["mode"],
  systemScheme: ThemeScheme
) {
  return mode === "system" ? systemScheme : mode;
}

function resolveThemeDefinition(
  themeId: ThemePresetId,
  activeScheme: ThemeScheme
) {
  const theme = builtInThemeMap[themeId];

  if (theme?.scheme === activeScheme) {
    return theme;
  }

  return builtInThemeMap[fallbackThemeByScheme[activeScheme]];
}

function createCssVariables(
  colors: ThemeColorTokens,
  typography: ThemeTypographyTokens,
  translucentSidebar: boolean
): Record<string, string> {
  return {
    "--background": colors.background,
    "--foreground": colors.foreground,
    "--primary": colors.primary,
    "--primary-foreground": colors.primaryForeground,
    "--secondary": colors.secondary,
    "--secondary-foreground": colors.secondaryForeground,
    "--muted": colors.muted,
    "--muted-foreground": colors.mutedForeground,
    "--border": colors.border,
    "--input": colors.input,
    "--ring": colors.ring,
    "--destructive": colors.destructive,
    "--radius-sm": "6px",
    "--radius-md": "8px",
    "--radius-lg": "10px",
    "--font-sans": typography.uiFontFamily,
    "--font-mono": typography.codeFontFamily,
    "--app-font-sans": typography.uiFontFamily,
    "--app-font-mono": typography.codeFontFamily,
    "--composer-ui-font-family": typography.uiFontFamily,
    "--composer-code-font-family": typography.codeFontFamily,
    "--composer-ui-font-size": `${typography.uiFontSize}px`,
    "--composer-code-font-size": `${typography.codeFontSize}px`,
    "--app-ui-font-size": `${typography.uiFontSize}px`,
    "--app-code-font-size": `${typography.codeFontSize}px`,
    "--composer-font-smoothing": typography.fontSmoothing
      ? "antialiased"
      : "auto",
    "--app-font-smoothing": typography.fontSmoothing ? "auto" : "antialiased",
    "--app-text-rendering": typography.fontSmoothing ? "auto" : "geometricPrecision",
    "--app-bg": colors.appBg,
    "--app-shell": colors.appShell,
    "--app-sidebar": translucentSidebar
      ? colors.appSidebarTranslucent
      : colors.appSidebar,
    "--app-sidebar-solid": colors.appSidebar,
    "--app-panel": colors.appPanel,
    "--app-panel-2": colors.appPanel2,
    "--app-line": colors.appLine,
    "--app-line-strong": colors.appLineStrong,
    "--app-line-bright": colors.appLineBright,
    "--app-text": colors.appText,
    "--app-muted": colors.appMuted,
    "--app-dim": colors.appDim,
    "--app-accent": colors.appBlue,
    "--app-success": colors.appGreen,
    "--app-warning": colors.appOrange,
    "--app-danger": `hsl(${colors.destructive})`,
    "--app-hover": colors.hover,
    "--app-hover-strong": colors.hoverStrong,
    "--app-overlay": colors.overlay,
    "--app-code-bg": `color-mix(in srgb, ${colors.appText} 7%, transparent)`,
    "--app-pre-bg": `color-mix(in srgb, ${colors.appBg} 55%, transparent)`,
    "--app-selection": colors.selection,
    "--app-scrollbar": `color-mix(in srgb, ${colors.appMuted} 20%, transparent)`,
    "--app-scrollbar-hover": `color-mix(in srgb, ${colors.appMuted} 32%, transparent)`,
    "--app-scrollbar-color": `color-mix(in srgb, ${colors.appMuted} 24%, transparent)`,
    "--app-body-gradient": `linear-gradient(180deg, ${colors.appBg} 0%, ${colors.appShell} 100%)`,
    "--app-composer-fade": `linear-gradient(180deg, color-mix(in srgb, ${colors.appShell} 0%, transparent) 0%, color-mix(in srgb, ${colors.appShell} 76%, transparent) 28%, color-mix(in srgb, ${colors.appShell} 96%, transparent) 62%, ${colors.appShell} 100%)`,
    "--app-editor-bg": colors.editorBackground,
    "--app-editor-text": colors.editorForeground,
    "--app-editor-muted": colors.editorLineNumber,
    "--app-editor-active-line": colors.editorActiveLine,
    "--app-editor-gutter-active": colors.editorActiveLine,
    "--app-editor-tooltip-bg": colors.editorBackground,
    "--color-app-bg": colors.appBg,
    "--color-app-shell": colors.appShell,
    "--color-app-sidebar": translucentSidebar
      ? colors.appSidebarTranslucent
      : colors.appSidebar,
    "--color-app-sidebar-solid": colors.appSidebar,
    "--color-app-panel": colors.appPanel,
    "--color-app-panel-2": colors.appPanel2,
    "--color-app-line": colors.appLine,
    "--color-app-line-strong": colors.appLineStrong,
    "--color-app-line-bright": colors.appLineBright,
    "--color-app-text": colors.appText,
    "--color-app-muted": colors.appMuted,
    "--color-app-dim": colors.appDim,
    "--color-app-blue": colors.appBlue,
    "--color-app-green": colors.appGreen,
    "--color-app-orange": colors.appOrange,
    "--composer-overlay": colors.overlay,
    "--composer-overlay-strong": colors.overlayStrong,
    "--composer-hover": colors.hover,
    "--composer-hover-strong": colors.hoverStrong,
    "--composer-shadow": colors.shadow,
    "--composer-shadow-strong": colors.shadowStrong,
    "--composer-focus": colors.focus,
    "--composer-selection": colors.selection,
    "--composer-editor-background": colors.editorBackground,
    "--composer-editor-foreground": colors.editorForeground,
    "--composer-editor-gutter": colors.editorGutter,
    "--composer-editor-line-number": colors.editorLineNumber,
    "--composer-editor-active-line": colors.editorActiveLine,
    "--composer-editor-selection": colors.editorSelection,
    "--composer-editor-cursor": colors.editorCursor
  };
}

function applyContrast(
  colors: ThemeColorTokens,
  contrast: AppearanceSettings["contrast"]
) {
  if (contrast < 55) {
    return colors;
  }

  return {
    ...colors,
    appLine: colors.appLineStrong,
    appLineStrong: colors.appLineBright,
    border: colors.ring,
    hover: colors.hoverStrong
  };
}

export function getFallbackThemeIdForScheme(scheme: ThemeScheme) {
  return fallbackThemeByScheme[scheme];
}

export { defaultCodeFontFamily, defaultUiFontFamily };
