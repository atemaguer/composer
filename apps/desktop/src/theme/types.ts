import type { PropsWithChildren } from "react";

export type ThemeMode = "system" | "light" | "dark";

export type ThemeScheme = "light" | "dark";

export type ThemePresetId =
  | "composer-dark"
  | "vercel-light"
  | "linear-dark"
  | "composer-light-fallback"
  | "vscode-light-2026"
  | "vscode-dark-2026"
  | "vscode-dark-plus"
  | "vscode-dark-modern"
  | "vscode-light-plus"
  | "vscode-light-modern"
  | "vscode-visual-studio-dark"
  | "vscode-visual-studio-light"
  | "vscode-high-contrast-dark"
  | "vscode-high-contrast-light"
  | "vscode-abyss"
  | "vscode-kimbie-dark"
  | "vscode-monokai-dimmed"
  | "vscode-monokai"
  | "vscode-quiet-light"
  | "vscode-red"
  | "vscode-solarized-dark"
  | "vscode-solarized-light"
  | "vscode-tomorrow-night-blue";

export type ThemeContrast = number;

export type ThemeSource = ThemeMode;

export type ThemeColorTokens = {
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  ring: string;
  destructive: string;
  appBg: string;
  appShell: string;
  appSidebar: string;
  appSidebarTranslucent: string;
  appPanel: string;
  appPanel2: string;
  appLine: string;
  appLineStrong: string;
  appLineBright: string;
  appText: string;
  appMuted: string;
  appDim: string;
  appBlue: string;
  appGreen: string;
  appOrange: string;
  overlay: string;
  overlayStrong: string;
  hover: string;
  hoverStrong: string;
  shadow: string;
  shadowStrong: string;
  focus: string;
  selection: string;
  editorBackground: string;
  editorForeground: string;
  editorGutter: string;
  editorLineNumber: string;
  editorActiveLine: string;
  editorSelection: string;
  editorCursor: string;
};

export type ThemeTypographyTokens = {
  uiFontFamily: string;
  codeFontFamily: string;
  uiFontSize: number;
  codeFontSize: number;
  fontSmoothing: boolean;
};

export type EditableThemeFields = {
  colors?: Partial<ThemeColorTokens>;
  typography?: Partial<ThemeTypographyTokens>;
};

export type ComposerThemeDefinition = {
  id: ThemePresetId;
  name: string;
  scheme: ThemeScheme;
  colors: ThemeColorTokens;
  typography: ThemeTypographyTokens;
};

export type AppearanceSettings = {
  mode: ThemeMode;
  selectedThemeByScheme: Record<ThemeScheme, ThemePresetId>;
  overridesByScheme: Record<ThemeScheme, EditableThemeFields>;
  translucentSidebar: boolean;
  contrast: ThemeContrast;
  uiFontFamily: string;
  codeFontFamily: string;
  uiFontSize: number;
  codeFontSize: number;
  fontSmoothing: boolean;
  enableLiquidGlass: boolean;
  showSubagentSessions: boolean;
};

export type ResolvedAppearanceTheme = {
  activeScheme: ThemeScheme;
  themeSource: ThemeSource;
  theme: ComposerThemeDefinition;
  backgroundColor: string;
  cssVariables: Record<string, string>;
};

export type AppearanceProviderProps = PropsWithChildren<{
  settings?: AppearanceSettings;
}>;
