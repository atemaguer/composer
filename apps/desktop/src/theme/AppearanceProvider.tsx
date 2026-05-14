import { useEffect, useMemo, useState } from "react";

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
      fontSmoothing: appearanceState.fontSmoothing
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
      appearanceState.fontSmoothing
    ]
  );
  const appearanceSettings = settings ?? storedSettings;
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
      backgroundColor: resolvedTheme.backgroundColor
    });
    void nativeAppearanceResult?.catch(() => undefined);

    return () => {
      for (const name of appliedVariables) {
        root.style.removeProperty(name);
      }
    };
  }, [resolvedTheme]);

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
