import { forwardRef, type ComponentProps } from "react";

import { cn } from "../../lib/cn";
import {
  appPanelShadow,
  appPanelShadowSoft,
  appSoftBorder,
  cardSurface,
  menuSurface
} from "../style-tokens";
import { useLiquidGlassEnabled } from "./useLiquidGlass";

export type GlassVariant = "sidebar" | "menu" | "panel";

/**
 * Default (glass-off) surface for each variant — the existing token surfaces,
 * so the off-state is pixel-identical to today.
 */
const defaultSurface: Record<GlassVariant, string> = {
  menu: menuSurface,
  panel: cardSurface,
  sidebar: "bg-app-sidebar/85"
};

/**
 * Glass-on surface. The sidebar gets its translucency from the native macOS
 * window vibrancy showing through transparent DOM (handled in Sidebar/App), so
 * it needs no background here. Floating surfaces (menu, panel) sit over opaque
 * app content where native vibrancy can't reach, so they use a CSS frosted
 * tint — a semi-transparent fill plus backdrop blur of the content behind them.
 */
const glassSurface: Record<GlassVariant, string> = {
  menu: `rounded-[18px] border ${appSoftBorder} ${appPanelShadow} bg-app-panel-2/65 backdrop-blur-2xl p-2`,
  panel: `rounded-[18px] border ${appSoftBorder} ${appPanelShadowSoft} bg-app-panel/65 backdrop-blur-2xl`,
  sidebar: ""
};

export type GlassPanelProps = ComponentProps<"div"> & {
  variant?: GlassVariant;
};

/**
 * Renders a translucent glass surface when enabled, or the default token
 * surface otherwise. `className` is applied to the outer element in both
 * states, so callers keep passing their positioning/layout classes.
 */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  function GlassPanel({ variant = "menu", className, children, ...rest }, ref) {
    const enabled = useLiquidGlassEnabled();
    const surface = enabled ? glassSurface[variant] : defaultSurface[variant];

    return (
      <div ref={ref} className={cn(surface, className)} {...rest}>
        {children}
      </div>
    );
  }
);
