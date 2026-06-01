import { useAppearanceStore } from "../../state/appearance-store";

let cachedCapable: boolean | null = null;

/**
 * One-time platform probe. The sidebar glass relies on the macOS native window
 * vibrancy material (NSVisualEffectView) showing through transparent DOM, which
 * only exists on macOS. Elsewhere we fall back to the solid token surfaces.
 */
export function isGlassCapable(): boolean {
  if (cachedCapable === null) {
    cachedCapable =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad/.test(navigator.userAgent || navigator.platform || "");
  }
  return cachedCapable;
}

/**
 * Single source of truth for whether glass surfaces should render: the user's
 * persisted preference AND platform support (macOS vibrancy). When false,
 * callers render their default token surfaces.
 */
export function useLiquidGlassEnabled(): boolean {
  const enabled = useAppearanceStore((state) => state.enableLiquidGlass);
  return enabled && isGlassCapable();
}
