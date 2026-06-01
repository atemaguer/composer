import { useEffect, useMemo, useState } from "react";

import { isGlassCapable } from "../components/liquid-glass/useLiquidGlass";
import { useAppearanceStore } from "../state/appearance-store";
import { resolveAppearanceTheme } from "./resolve";
import type {
  AppearanceProviderProps,
  AppearanceSettings,
  ThemeScheme
} from "./types";

const darkSchemeQuery = "(prefers-color-scheme: dark)";

export function AppearanceProvider({
  children,
  settings
}: AppearanceProviderProps) {
  const appearanceState = useAppearanceStore();
  const storedSettings = useMemo<AppearanceSettings>(
    () => ({
      mode: appearanceState.mode,
      selectedThemeByScheme: appearanceState.selectedThemeByScheme,
      overridesByScheme: appearanceState.overridesByScheme,
      translucentSidebar: appearanceState.translucentSidebar,
      contrast: appearanceState.contrast,
      uiFontFamily: appearanceState.uiFontFamily,
      codeFontFamily: appearanceState.codeFontFamily,
      uiFontSize: appearanceState.uiFontSize,
      codeFontSize: appearanceState.codeFontSize,
      fontSmoothing: appearanceState.fontSmoothing,
      enableLiquidGlass: appearanceState.enableLiquidGlass,
      showSubagentSessions: appearanceState.showSubagentSessions
    }),
    [
      appearanceState.mode,
      appearanceState.selectedThemeByScheme,
      appearanceState.overridesByScheme,
      appearanceState.translucentSidebar,
      appearanceState.contrast,
      appearanceState.uiFontFamily,
      appearanceState.codeFontFamily,
      appearanceState.uiFontSize,
      appearanceState.codeFontSize,
      appearanceState.fontSmoothing,
      appearanceState.enableLiquidGlass,
      appearanceState.showSubagentSessions
    ]
  );
  const appearanceSettings = settings ?? storedSettings;
  // Gate on platform support too, mirroring useLiquidGlassEnabled, so the
  // window only goes transparent where the native vibrancy actually exists.
  const liquidGlass = appearanceState.enableLiquidGlass && isGlassCapable();
  const systemScheme = useSystemScheme();
  const resolvedTheme = useMemo(
    () => resolveAppearanceTheme(appearanceSettings, systemScheme),
    [appearanceSettings, systemScheme]
  );

  useEffect(() => {
    const root = document.documentElement;
    const appliedVariables = Object.keys(resolvedTheme.cssVariables);

    for (const [name, value] of Object.entries(resolvedTheme.cssVariables)) {
      root.style.setProperty(name, value);
    }

    root.classList.toggle("dark", resolvedTheme.activeScheme === "dark");

    const nativeAppearanceResult = window.composer?.setNativeAppearance?.({
      themeSource: resolvedTheme.themeSource,
      backgroundColor: resolvedTheme.backgroundColor,
      vibrant: liquidGlass
    });
    void nativeAppearanceResult?.catch(() => undefined);

    return () => {
      for (const name of appliedVariables) {
        root.style.removeProperty(name);
      }
    };
  }, [resolvedTheme, liquidGlass]);

  // Toggle a root attribute so global CSS can drop the html/body backgrounds
  // when glass is on, letting the native window vibrancy show through.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-liquid-glass", liquidGlass ? "true" : "false");
    return () => {
      root.removeAttribute("data-liquid-glass");
    };
  }, [liquidGlass]);

  return <>{children}</>;
}

function useSystemScheme(): ThemeScheme {
  const [systemScheme, setSystemScheme] = useState(getSystemScheme);

  useEffect(() => {
    const mediaQuery = window.matchMedia(darkSchemeQuery);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemScheme(event.matches ? "dark" : "light");
    };

    setSystemScheme(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return systemScheme;
}

function getSystemScheme(): ThemeScheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia(darkSchemeQuery).matches ? "dark" : "light";
}
