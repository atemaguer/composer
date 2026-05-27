import type {
  ComposerThemeDefinition,
  ThemeColorTokens,
  ThemePresetId,
  ThemeScheme,
  ThemeTypographyTokens
} from "./types";

export const defaultUiFontFamily =
  '"Geist Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const defaultCodeFontFamily =
  '"SF Mono", "Menlo", "Monaco", "Cascadia Code", "Roboto Mono", monospace';

export const defaultThemeTypography: ThemeTypographyTokens = {
  uiFontFamily: defaultUiFontFamily,
  codeFontFamily: defaultCodeFontFamily,
  uiFontSize: 14,
  codeFontSize: 12,
  fontSmoothing: true
};

export const composerDarkTheme: ComposerThemeDefinition = {
  id: "composer-dark",
  name: "Composer Black",
  scheme: "dark",
  typography: defaultThemeTypography,
  colors: {
    background: "0 0% 5%",
    foreground: "0 0% 90%",
    primary: "0 0% 78%",
    primaryForeground: "0 0% 5%",
    secondary: "0 0% 15%",
    secondaryForeground: "0 0% 90%",
    muted: "0 0% 15%",
    mutedForeground: "0 0% 64%",
    border: "0 0% 20%",
    input: "0 0% 15%",
    ring: "0 0% 66%",
    destructive: "0 82% 64%",
    appBg: "#0b0b0c",
    appShell: "#0f0f10",
    appSidebar: "#242425",
    appSidebarTranslucent: "#242425",
    appPanel: "#242425",
    appPanel2: "#2b2b2c",
    appLine: "rgba(255, 255, 255, 0.09)",
    appLineStrong: "rgba(255, 255, 255, 0.14)",
    appLineBright: "rgba(255, 255, 255, 0.24)",
    appText: "#e4e4e7",
    appMuted: "#a1a1aa",
    appDim: "#71717a",
    appBlue: "#a3a3a3",
    appGreen: "#71d697",
    appOrange: "rgb(217 119 87)",
    overlay: "rgba(0, 0, 0, 0.68)",
    overlayStrong: "rgba(0, 0, 0, 0.86)",
    hover: "rgba(255, 255, 255, 0.06)",
    hoverStrong: "rgba(255, 255, 255, 0.1)",
    shadow: "0 22px 56px rgba(0, 0, 0, 0.38)",
    shadowStrong: "0 22px 56px rgba(0, 0, 0, 0.56)",
    focus: "rgba(163, 163, 163, 0.68)",
    selection: "rgba(163, 163, 163, 0.24)",
    editorBackground: "#0b0b0c",
    editorForeground: "#d4d4d8",
    editorGutter: "#111112",
    editorLineNumber: "rgba(161, 161, 170, 0.58)",
    editorActiveLine: "rgba(255, 255, 255, 0.045)",
    editorSelection: "rgba(163, 163, 163, 0.2)",
    editorCursor: "#f4f4f5"
  }
};

export const vercelLightTheme: ComposerThemeDefinition = {
  id: "vercel-light",
  name: "Vercel Light",
  scheme: "light",
  typography: defaultThemeTypography,
  colors: {
    background: "0 0% 100%",
    foreground: "0 0% 4%",
    primary: "0 0% 9%",
    primaryForeground: "0 0% 98%",
    secondary: "0 0% 96%",
    secondaryForeground: "0 0% 9%",
    muted: "0 0% 96%",
    mutedForeground: "0 0% 45%",
    border: "0 0% 90%",
    input: "0 0% 90%",
    ring: "0 0% 9%",
    destructive: "0 84% 60%",
    appBg: "#ffffff",
    appShell: "#fafafa",
    appSidebar: "#f4f4f5",
    appSidebarTranslucent: "rgba(244, 244, 245, 0.84)",
    appPanel: "#ffffff",
    appPanel2: "#f6f6f7",
    appLine: "rgba(0, 0, 0, 0.1)",
    appLineStrong: "rgba(0, 0, 0, 0.16)",
    appLineBright: "rgba(0, 0, 0, 0.24)",
    appText: "#111111",
    appMuted: "#5f6368",
    appDim: "#85888d",
    appBlue: "#737373",
    appGreen: "#128a46",
    appOrange: "rgb(196 85 45)",
    overlay: "rgba(255, 255, 255, 0.72)",
    overlayStrong: "rgba(255, 255, 255, 0.9)",
    hover: "rgba(0, 0, 0, 0.055)",
    hoverStrong: "rgba(0, 0, 0, 0.09)",
    shadow: "0 18px 44px rgba(0, 0, 0, 0.12)",
    shadowStrong: "0 22px 58px rgba(0, 0, 0, 0.18)",
    focus: "rgba(115, 115, 115, 0.58)",
    selection: "rgba(115, 115, 115, 0.18)",
    editorBackground: "#ffffff",
    editorForeground: "#1f2328",
    editorGutter: "#f6f8fa",
    editorLineNumber: "rgba(95, 99, 104, 0.72)",
    editorActiveLine: "rgba(0, 0, 0, 0.035)",
    editorSelection: "rgba(115, 115, 115, 0.16)",
    editorCursor: "#111111"
  }
};

export const linearDarkTheme: ComposerThemeDefinition = {
  id: "linear-dark",
  name: "Linear Dark",
  scheme: "dark",
  typography: defaultThemeTypography,
  colors: {
    background: "240 13% 7%",
    foreground: "240 10% 92%",
    primary: "243 91% 72%",
    primaryForeground: "240 14% 8%",
    secondary: "240 8% 16%",
    secondaryForeground: "240 10% 90%",
    muted: "240 8% 15%",
    mutedForeground: "240 7% 62%",
    border: "240 7% 24%",
    input: "240 8% 16%",
    ring: "243 91% 72%",
    destructive: "0 76% 63%",
    appBg: "#0d0d12",
    appShell: "#111116",
    appSidebar: "#17171f",
    appSidebarTranslucent: "rgba(23, 23, 31, 0.84)",
    appPanel: "#1c1c24",
    appPanel2: "#22222b",
    appLine: "rgba(216, 214, 255, 0.11)",
    appLineStrong: "rgba(216, 214, 255, 0.17)",
    appLineBright: "rgba(230, 228, 255, 0.26)",
    appText: "#edeef7",
    appMuted: "#a5a6b5",
    appDim: "#737484",
    appBlue: "#8b8aff",
    appGreen: "#63d297",
    appOrange: "rgb(220 132 83)",
    overlay: "rgba(13, 13, 18, 0.7)",
    overlayStrong: "rgba(13, 13, 18, 0.9)",
    hover: "rgba(255, 255, 255, 0.055)",
    hoverStrong: "rgba(255, 255, 255, 0.095)",
    shadow: "0 22px 56px rgba(0, 0, 0, 0.34)",
    shadowStrong: "0 24px 64px rgba(0, 0, 0, 0.5)",
    focus: "rgba(139, 138, 255, 0.68)",
    selection: "rgba(139, 138, 255, 0.26)",
    editorBackground: "#111116",
    editorForeground: "#e5e7f3",
    editorGutter: "#17171f",
    editorLineNumber: "rgba(165, 166, 181, 0.55)",
    editorActiveLine: "rgba(139, 138, 255, 0.08)",
    editorSelection: "rgba(139, 138, 255, 0.22)",
    editorCursor: "#edeef7"
  }
};

export const composerLightFallbackTheme: ComposerThemeDefinition = {
  id: "composer-light-fallback",
  name: "Composer Light",
  scheme: "light",
  typography: defaultThemeTypography,
  colors: {
    ...vercelLightTheme.colors,
    primary: "0 0% 45%",
    ring: "0 0% 45%",
    appBg: "#f7f9fc",
    appShell: "#eef3f8",
    appSidebar: "#e7edf5",
    appSidebarTranslucent: "rgba(231, 237, 245, 0.84)",
    appPanel: "#ffffff",
    appPanel2: "#edf3fa",
    appLine: "rgba(20, 46, 76, 0.11)",
    appLineStrong: "rgba(20, 46, 76, 0.17)",
    appLineBright: "rgba(20, 46, 76, 0.25)",
    appText: "#172233",
    appMuted: "#5d6b7c",
    appDim: "#8190a3",
    appBlue: "#737373",
    focus: "rgba(115, 115, 115, 0.58)",
    selection: "rgba(115, 115, 115, 0.18)",
    editorActiveLine: "rgba(0, 0, 0, 0.035)",
    editorSelection: "rgba(115, 115, 115, 0.16)"
  }
};

type VscodeThemeInput = {
  id: ThemePresetId;
  name: string;
  scheme: ThemeScheme;
  editorBackground: string;
  editorForeground: string;
  sideBarBackground?: string;
  sideBarForeground?: string;
  panelBackground?: string;
  tabActiveBackground?: string;
  activityBarBackground?: string;
  accent?: string;
  appForeground?: string;
  hover?: string;
  activeSelection?: string;
  selection?: string;
  lineHighlight?: string;
  cursor?: string;
  lineNumber?: string;
  inputBackground?: string;
  badge?: string;
  error?: string;
};

function createVscodeTheme({
  id,
  name,
  scheme,
  editorBackground,
  editorForeground,
  sideBarBackground,
  sideBarForeground,
  panelBackground,
  tabActiveBackground,
  activityBarBackground,
  accent,
  appForeground,
  hover,
  activeSelection,
  selection,
  lineHighlight,
  cursor,
  lineNumber,
  inputBackground,
  badge,
  error
}: VscodeThemeInput): ComposerThemeDefinition {
  const isLight = scheme === "light";
  const appBg = editorBackground;
  const appText = appForeground ?? editorForeground;
  const appAccent = normalizeOpaqueHex(accent ?? badge ?? (isLight ? "#005FB8" : "#0078D4"));
  const appShell =
    panelBackground ??
    sideBarBackground ??
    mixColors(editorBackground, editorForeground, isLight ? 0.045 : 0.08);
  const appSidebar =
    sideBarBackground ??
    activityBarBackground ??
    mixColors(editorBackground, editorForeground, isLight ? 0.035 : 0.07);
  const appPanel = tabActiveBackground ?? editorBackground;
  const appPanel2 =
    inputBackground ??
    mixColors(appShell, editorForeground, isLight ? 0.035 : 0.075);
  const mutedText =
    sideBarForeground ??
    mixColors(editorForeground, editorBackground, isLight ? 0.35 : 0.28);
  const dimText =
    lineNumber ??
    mixColors(editorForeground, editorBackground, isLight ? 0.5 : 0.46);
  const destructive = error ?? (isLight ? "#B5200D" : "#F48771");
  const foregroundHsl = colorToHsl(appText, isLight ? "#202020" : "#D4D4D4");
  const backgroundHsl = colorToHsl(editorBackground, isLight ? "#FFFFFF" : "#1E1E1E");
  const accentHsl = colorToHsl(appAccent, isLight ? "#005FB8" : "#0078D4");
  const secondaryHsl = colorToHsl(appPanel2, appShell);
  const mutedHsl = colorToHsl(appShell, editorBackground);
  const borderHsl = colorToHsl(
    mixColors(editorBackground, editorForeground, isLight ? 0.18 : 0.2),
    editorBackground
  );
  const accentContrastHsl = chooseReadableForegroundHsl(appAccent);
  const lineAlpha = isLight ? 0.14 : 0.16;
  const strongLineAlpha = isLight ? 0.22 : 0.24;
  const brightLineAlpha = isLight ? 0.32 : 0.34;
  const overlayAlpha = isLight ? 0.72 : 0.72;
  const overlayStrongAlpha = isLight ? 0.9 : 0.9;
  const hoverColor = hover ?? withAlpha(editorForeground, isLight ? 0.07 : 0.08);
  const hoverStrongColor =
    activeSelection ?? withAlpha(editorForeground, isLight ? 0.12 : 0.14);
  const selectionColor =
    selection ?? activeSelection ?? withAlpha(appAccent, isLight ? 0.22 : 0.28);
  const activeLineColor =
    lineHighlight ?? withAlpha(appAccent, isLight ? 0.08 : 0.1);

  const colors: ThemeColorTokens = {
    background: backgroundHsl,
    foreground: foregroundHsl,
    primary: accentHsl,
    primaryForeground: accentContrastHsl,
    secondary: secondaryHsl,
    secondaryForeground: foregroundHsl,
    muted: mutedHsl,
    mutedForeground: colorToHsl(mutedText, editorForeground),
    border: borderHsl,
    input: colorToHsl(inputBackground ?? appPanel2, appPanel2),
    ring: accentHsl,
    destructive: colorToHsl(destructive, isLight ? "#B5200D" : "#F48771"),
    appBg,
    appShell,
    appSidebar,
    appSidebarTranslucent: withAlpha(appSidebar, 0.84),
    appPanel,
    appPanel2,
    appLine: withAlpha(editorForeground, lineAlpha),
    appLineStrong: withAlpha(editorForeground, strongLineAlpha),
    appLineBright: withAlpha(editorForeground, brightLineAlpha),
    appText,
    appMuted: mutedText,
    appDim: dimText,
    appBlue: appAccent,
    appGreen: isLight ? "#128A46" : "#4EC98A",
    appOrange: isLight ? "rgb(196 85 45)" : "rgb(220 132 83)",
    overlay: withAlpha(appBg, overlayAlpha),
    overlayStrong: withAlpha(appBg, overlayStrongAlpha),
    hover: hoverColor,
    hoverStrong: hoverStrongColor,
    shadow: isLight
      ? "0 18px 44px rgba(0, 0, 0, 0.12)"
      : "0 22px 56px rgba(0, 0, 0, 0.34)",
    shadowStrong: isLight
      ? "0 22px 58px rgba(0, 0, 0, 0.18)"
      : "0 24px 64px rgba(0, 0, 0, 0.5)",
    focus: withAlpha(appAccent, 0.68),
    selection: selectionColor,
    editorBackground,
    editorForeground,
    editorGutter: appSidebar,
    editorLineNumber: lineNumber ?? withAlpha(mutedText, 0.7),
    editorActiveLine: activeLineColor,
    editorSelection: selectionColor,
    editorCursor: cursor ?? editorForeground
  };

  return {
    id,
    name,
    scheme,
    typography: defaultThemeTypography,
    colors
  };
}

function normalizeOpaqueHex(value: string) {
  const rgb = parseHexColor(value);
  return rgbToHex(rgb);
}

function colorToHsl(value: string, fallback: string) {
  return rgbToHsl(parseHexColor(value, fallback));
}

function withAlpha(value: string, alpha: number) {
  const { r, g, b } = parseHexColor(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixColors(first: string, second: string, secondAmount: number) {
  const a = parseHexColor(first);
  const b = parseHexColor(second);
  const amount = Math.min(Math.max(secondAmount, 0), 1);

  return rgbToHex({
    r: Math.round(a.r * (1 - amount) + b.r * amount),
    g: Math.round(a.g * (1 - amount) + b.g * amount),
    b: Math.round(a.b * (1 - amount) + b.b * amount)
  });
}

function parseHexColor(value: string, fallback = "#000000") {
  const trimmed = value.trim();
  const candidate = /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : fallback;
  const hex = candidate.slice(1);
  const normalized = hex.length === 3 || hex.length === 4
    ? hex
        .slice(0, 3)
        .split("")
        .map((character) => `${character}${character}`)
        .join("")
    : hex.slice(0, 6);

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case red:
        hue = (green - blue) / delta + (green < blue ? 6 : 0);
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      default:
        hue = (red - green) / delta + 4;
    }

    hue /= 6;
  }

  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

function relativeLuminance(value: string) {
  const { r, g, b } = parseHexColor(value);
  const channels = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function chooseReadableForegroundHsl(background: string) {
  return contrastRatio(background, "#000000") >=
    contrastRatio(background, "#ffffff")
    ? "0 0% 0%"
    : "0 0% 100%";
}

export const vscodeDefaultThemes = [
  createVscodeTheme({
    id: "vscode-light-2026",
    name: "VS Code Light 2026",
    scheme: "light",
    editorBackground: "#FFFFFF",
    editorForeground: "#202020",
    sideBarBackground: "#FAFAFD",
    sideBarForeground: "#202020",
    panelBackground: "#FAFAFD",
    tabActiveBackground: "#FFFFFF",
    activityBarBackground: "#FAFAFD",
    accent: "#0069CC",
    hover: "#DADADA4f",
    activeSelection: "#0069CC1A",
    selection: "#0069CC40",
    lineHighlight: "#EAEAEA40",
    cursor: "#202020",
    lineNumber: "#606060",
    inputBackground: "#FFFFFF",
    badge: "#0069CC",
    error: "#ad0707"
  }),
  createVscodeTheme({
    id: "vscode-dark-2026",
    name: "VS Code Dark 2026",
    scheme: "dark",
    editorBackground: "#121314",
    editorForeground: "#BBBEBF",
    sideBarBackground: "#191A1B",
    sideBarForeground: "#bfbfbf",
    panelBackground: "#191A1B",
    tabActiveBackground: "#121314",
    activityBarBackground: "#191A1B",
    accent: "#297AA0",
    hover: "#FFFFFF0D",
    activeSelection: "#3994BC26",
    selection: "#276782dd",
    lineHighlight: "#242526",
    cursor: "#BBBEBF",
    lineNumber: "#858889",
    inputBackground: "#191A1B",
    badge: "#3994BCF0",
    error: "#f48771"
  }),
  createVscodeTheme({
    id: "vscode-dark-plus",
    name: "VS Code Dark+",
    scheme: "dark",
    editorBackground: "#1E1E1E",
    editorForeground: "#D4D4D4",
    sideBarBackground: "#252526",
    panelBackground: "#1E1E1E",
    accent: "#007ACC",
    inputBackground: "#3C3C3C",
    selection: "#264F78",
    lineHighlight: "#2A2D2E",
    lineNumber: "#858585"
  }),
  createVscodeTheme({
    id: "vscode-dark-modern",
    name: "VS Code Dark Modern",
    scheme: "dark",
    editorBackground: "#1F1F1F",
    editorForeground: "#CCCCCC",
    sideBarBackground: "#181818",
    sideBarForeground: "#CCCCCC",
    panelBackground: "#181818",
    tabActiveBackground: "#1F1F1F",
    activityBarBackground: "#181818",
    accent: "#0078D4",
    lineNumber: "#6E7681",
    inputBackground: "#313131",
    badge: "#616161",
    error: "#F85149"
  }),
  createVscodeTheme({
    id: "vscode-light-plus",
    name: "VS Code Light+",
    scheme: "light",
    editorBackground: "#FFFFFF",
    editorForeground: "#000000",
    sideBarBackground: "#F3F3F3",
    panelBackground: "#FFFFFF",
    accent: "#007ACC",
    hover: "#E8E8E8",
    selection: "#ADD6FF",
    lineHighlight: "#F5F5F5",
    lineNumber: "#237893"
  }),
  createVscodeTheme({
    id: "vscode-light-modern",
    name: "VS Code Light Modern",
    scheme: "light",
    editorBackground: "#FFFFFF",
    editorForeground: "#3B3B3B",
    sideBarBackground: "#F8F8F8",
    sideBarForeground: "#3B3B3B",
    panelBackground: "#F8F8F8",
    tabActiveBackground: "#FFFFFF",
    activityBarBackground: "#F8F8F8",
    accent: "#005FB8",
    hover: "#F2F2F2",
    activeSelection: "#E8E8E8",
    lineNumber: "#6E7681",
    inputBackground: "#FFFFFF",
    badge: "#CCCCCC",
    error: "#F85149"
  }),
  createVscodeTheme({
    id: "vscode-visual-studio-dark",
    name: "VS Code Dark (Visual Studio)",
    scheme: "dark",
    editorBackground: "#1E1E1E",
    editorForeground: "#D4D4D4",
    sideBarBackground: "#252526",
    panelBackground: "#1E1E1E",
    accent: "#007ACC",
    inputBackground: "#3C3C3C",
    selection: "#264F78",
    lineHighlight: "#2A2D2E",
    lineNumber: "#858585"
  }),
  createVscodeTheme({
    id: "vscode-visual-studio-light",
    name: "VS Code Light (Visual Studio)",
    scheme: "light",
    editorBackground: "#FFFFFF",
    editorForeground: "#000000",
    sideBarBackground: "#F3F3F3",
    panelBackground: "#FFFFFF",
    accent: "#007ACC",
    hover: "#E8E8E8",
    selection: "#ADD6FF",
    lineHighlight: "#F5F5F5",
    lineNumber: "#237893"
  }),
  createVscodeTheme({
    id: "vscode-high-contrast-dark",
    name: "VS Code Dark High Contrast",
    scheme: "dark",
    editorBackground: "#000000",
    editorForeground: "#FFFFFF",
    sideBarBackground: "#000000",
    panelBackground: "#000000",
    accent: "#F38518",
    hover: "#FFFFFF1F",
    activeSelection: "#FFFFFF33",
    selection: "#FFFFFF33",
    lineHighlight: "#FFFFFF1A",
    cursor: "#FFFFFF",
    lineNumber: "#FFFFFF",
    inputBackground: "#000000",
    error: "#F48771"
  }),
  createVscodeTheme({
    id: "vscode-high-contrast-light",
    name: "VS Code Light High Contrast",
    scheme: "light",
    editorBackground: "#FFFFFF",
    editorForeground: "#292929",
    sideBarBackground: "#FFFFFF",
    panelBackground: "#FFFFFF",
    accent: "#0F4A85",
    hover: "#DDDDDD",
    activeSelection: "#0F4A8526",
    selection: "#C9D0D9",
    lineHighlight: "#EEEEEE",
    cursor: "#292929",
    lineNumber: "#515151",
    inputBackground: "#FFFFFF",
    error: "#B5200D"
  }),
  createVscodeTheme({
    id: "vscode-abyss",
    name: "VS Code Abyss",
    scheme: "dark",
    editorBackground: "#000c18",
    editorForeground: "#6688cc",
    sideBarBackground: "#060621",
    panelBackground: "#1c1c2a",
    activityBarBackground: "#051336",
    accent: "#2B3C5D",
    hover: "#061940",
    activeSelection: "#08286b",
    selection: "#770811",
    lineHighlight: "#082050",
    cursor: "#ddbb88",
    lineNumber: "#406385",
    inputBackground: "#181f2f",
    badge: "#0063a5"
  }),
  createVscodeTheme({
    id: "vscode-kimbie-dark",
    name: "VS Code Kimbie Dark",
    scheme: "dark",
    editorBackground: "#221a0f",
    editorForeground: "#d3af86",
    sideBarBackground: "#362712",
    panelBackground: "#131510",
    activityBarBackground: "#221a0f",
    accent: "#6e583b",
    hover: "#7c502166",
    activeSelection: "#7c5021",
    selection: "#84613daa",
    lineHighlight: "#5e452b",
    cursor: "#d3af86",
    inputBackground: "#51412c",
    badge: "#7f5d38"
  }),
  createVscodeTheme({
    id: "vscode-monokai-dimmed",
    name: "VS Code Monokai Dimmed",
    scheme: "dark",
    editorBackground: "#1e1e1e",
    editorForeground: "#c5c8c6",
    sideBarBackground: "#272727",
    panelBackground: "#282828",
    activityBarBackground: "#353535",
    accent: "#565656",
    hover: "#444444",
    activeSelection: "#707070",
    selection: "#676b7180",
    lineHighlight: "#303030",
    cursor: "#c07020",
    inputBackground: "#525252"
  }),
  createVscodeTheme({
    id: "vscode-monokai",
    name: "VS Code Monokai",
    scheme: "dark",
    editorBackground: "#272822",
    editorForeground: "#f8f8f2",
    sideBarBackground: "#1e1f1c",
    panelBackground: "#1e1f1c",
    activityBarBackground: "#272822",
    accent: "#75715E",
    hover: "#3e3d32",
    activeSelection: "#75715E",
    selection: "#878b9180",
    lineHighlight: "#3e3d32",
    cursor: "#f8f8f0",
    lineNumber: "#90908a",
    inputBackground: "#414339",
    badge: "#75715E"
  }),
  createVscodeTheme({
    id: "vscode-quiet-light",
    name: "VS Code Quiet Light",
    scheme: "light",
    editorBackground: "#F5F5F5",
    editorForeground: "#333333",
    sideBarBackground: "#F2F2F2",
    panelBackground: "#F5F5F5",
    activityBarBackground: "#EDEDF5",
    accent: "#705697",
    hover: "#e0e0e0",
    activeSelection: "#c4d9b1",
    selection: "#C9D0D9",
    lineHighlight: "#E4F6D4",
    cursor: "#54494B",
    lineNumber: "#6D705B",
    inputBackground: "#F5F5F5",
    badge: "#705697AA",
    error: "#f1897f"
  }),
  createVscodeTheme({
    id: "vscode-red",
    name: "VS Code Red",
    scheme: "dark",
    editorBackground: "#390000",
    editorForeground: "#F8F8F8",
    sideBarBackground: "#330000",
    panelBackground: "#330000",
    tabActiveBackground: "#490000",
    activityBarBackground: "#580000",
    accent: "#883333",
    hover: "#800000",
    activeSelection: "#880000",
    selection: "#750000",
    lineHighlight: "#ff000033",
    cursor: "#970000",
    lineNumber: "#ff777788",
    inputBackground: "#580000",
    badge: "#cc3333",
    error: "#ffeaea"
  }),
  createVscodeTheme({
    id: "vscode-solarized-dark",
    name: "VS Code Solarized Dark",
    scheme: "dark",
    editorBackground: "#002B36",
    editorForeground: "#839496",
    appForeground: "#B7C7C8",
    sideBarBackground: "#00212B",
    panelBackground: "#004052",
    tabActiveBackground: "#002B37",
    activityBarBackground: "#003847",
    accent: "#2AA198",
    hover: "#004454AA",
    activeSelection: "#005A6F",
    selection: "#274642",
    lineHighlight: "#073642",
    cursor: "#D30102",
    inputBackground: "#003847",
    badge: "#047aa6",
    error: "#ffeaea"
  }),
  createVscodeTheme({
    id: "vscode-solarized-light",
    name: "VS Code Solarized Light",
    scheme: "light",
    editorBackground: "#FDF6E3",
    editorForeground: "#657B83",
    appForeground: "#3F565D",
    sideBarBackground: "#EEE8D5",
    panelBackground: "#D9D2C2",
    tabActiveBackground: "#FDF6E3",
    activityBarBackground: "#DDD6C1",
    accent: "#AC9D57",
    hover: "#DFCA8844",
    activeSelection: "#DFCA88",
    selection: "#EEE8D5",
    lineHighlight: "#EEE8D5",
    cursor: "#657B83",
    inputBackground: "#DDD6C1",
    badge: "#B58900AA"
  }),
  createVscodeTheme({
    id: "vscode-tomorrow-night-blue",
    name: "VS Code Tomorrow Night Blue",
    scheme: "dark",
    editorBackground: "#002451",
    editorForeground: "#ffffff",
    sideBarBackground: "#001c40",
    panelBackground: "#001733",
    activityBarBackground: "#001733",
    accent: "#bbdaff",
    hover: "#ffffff30",
    activeSelection: "#ffffff60",
    selection: "#003f8e",
    lineHighlight: "#00346e",
    cursor: "#ffffff",
    inputBackground: "#001733",
    badge: "#bbdaffcc",
    error: "#a92049"
  })
] as const satisfies readonly ComposerThemeDefinition[];

export const builtInThemes = [
  composerDarkTheme,
  vercelLightTheme,
  linearDarkTheme,
  composerLightFallbackTheme,
  ...vscodeDefaultThemes
] as const satisfies readonly ComposerThemeDefinition[];

export const builtInThemeMap: Record<ThemePresetId, ComposerThemeDefinition> =
  builtInThemes.reduce(
    (themesById, theme) => ({
      ...themesById,
      [theme.id]: theme
    }),
    {} as Record<ThemePresetId, ComposerThemeDefinition>
  );

export const fallbackThemeByScheme: Record<ThemeScheme, ThemePresetId> = {
  light: "vercel-light",
  dark: "composer-dark"
};
