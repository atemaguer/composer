/**
 * Canonical geometry for a selectable list / menu row's background indicator,
 * standardized on the workspace title accordion: compact `min-h-7` height,
 * `rounded-md` fill, `px-2 py-1` padding, `text-[13px]`. Callers add their own
 * layout (grid columns, gaps) and pair this with the hover/active surfaces
 * (`appHoverSurfaceSubtle` / `appActiveSurface`) so every list row reads the
 * same. Keep new list/menu rows on this token rather than re-deriving sizes.
 */
export const listRow =
  "min-h-7 rounded-md px-2 py-1 text-left text-[13px] transition-colors";

export const sidebarItem =
  "grid min-h-7 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-app-muted/85 transition-colors hover:bg-app-text/[0.05]";

export const mutedIcon = "text-app-muted/80";

export const dimIcon = "text-app-dim";

export const appAccentScope = "[--app-accent:var(--color-app-blue)]";
export const appAccentText = "text-[var(--color-app-blue)]";
export const appAccentHoverText = "hover:text-[var(--color-app-blue)]";
export const appAccentBorderSoft =
  "border-[color:color-mix(in_srgb,var(--color-app-blue)_30%,transparent)]";
export const appAccentSurface =
  "bg-[color:color-mix(in_srgb,var(--color-app-blue)_12%,transparent)]";
export const appSuccessText = "text-[var(--color-app-green)]";
export const appWarningText = "text-[var(--color-app-orange)]";
export const appDangerText = "text-destructive";
export const appDangerSoftText = "text-destructive/80";

export const appHoverSurface = "hover:bg-app-text/[0.06]";
export const appHoverSurfaceSubtle = "hover:bg-app-text/[0.05]";
export const appActiveSurface = "bg-app-text/[0.08]";
export const appActiveSurfaceStrong = "bg-app-text/[0.1]";
export const appSoftSurface = "bg-app-text/[0.04]";
export const appSoftSurfaceStrong = "bg-app-text/[0.07]";
export const appOverlaySurface = "bg-app-bg/75";
export const appSoftBorder = "border-app-line";
export const appSubtleDivider = "border-app-line";
export const appInsetHighlight =
  "shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-app-text)_3.5%,transparent)]";
export const appPanelShadow =
  "shadow-[0_22px_56px_color-mix(in_srgb,var(--color-app-bg)_46%,transparent)]";
export const appPanelShadowSoft =
  "shadow-[0_22px_56px_color-mix(in_srgb,var(--color-app-bg)_32%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--color-app-text)_4%,transparent)]";
export const appWarningBorder =
  "border-[color:color-mix(in_srgb,var(--color-app-orange)_25%,transparent)]";
export const appWarningBorderStrong =
  "border-[color:color-mix(in_srgb,var(--color-app-orange)_35%,transparent)]";
export const appWarningSurface =
  "bg-[color:color-mix(in_srgb,var(--color-app-orange)_10%,transparent)]";
export const appWarningHoverSurface =
  "hover:bg-[color:color-mix(in_srgb,var(--color-app-orange)_15%,transparent)]";

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:color-mix(in_srgb,var(--color-app-blue)_70%,transparent)]";

export const warningFocusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:color-mix(in_srgb,var(--color-app-orange)_70%,transparent)]";

export const disabledMuted =
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-app-muted disabled:hover:border-transparent";

export const iconButton =
  `app-no-drag inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${appSoftBorder} ${appSoftSurface} text-app-muted/85 ${appInsetHighlight} transition-colors hover:bg-app-text/[0.08] hover:text-app-text ${focusRing} ${disabledMuted}`;

export const subtleIconButton =
  `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-text/[0.08] hover:text-app-text ${focusRing} ${disabledMuted}`;

export const nestedIconButton =
  `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-app-muted transition-colors hover:text-app-text ${focusRing} ${disabledMuted}`;

export const titlebarControlRow =
  "flex min-w-0 items-center gap-1.5 py-0 pl-[var(--app-titlebar-control-left-inset)] transition-[padding-left] duration-[180ms] ease-out motion-reduce:transition-none";

export const primaryIconButton =
  `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-app-text text-app-bg transition-colors hover:bg-app-text/95 disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`;

export const pillButton =
  `inline-flex items-center rounded-full border border-transparent bg-transparent text-app-muted transition-colors hover:border-app-line hover:bg-app-text/[0.08] hover:text-app-text ${focusRing} ${disabledMuted}`;

export const cardSurface =
  `rounded-[18px] border ${appSoftBorder} bg-app-panel-2 ${appPanelShadowSoft}`;

export const subtleCardSurface =
  `rounded-[14px] border ${appSubtleDivider} bg-app-text/[0.045] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-app-text)_3%,transparent)]`;

export const menuSurface =
  `rounded-[18px] border ${appSoftBorder} bg-app-panel-2/95 p-2 backdrop-blur ${appPanelShadow}`;

export const menuItem =
  `rounded-md text-left transition-colors ${appHoverSurfaceSubtle} ${focusRing}`;

export const primaryButton =
  `inline-flex items-center justify-center rounded-full bg-app-text text-app-bg transition-colors hover:bg-app-text/95 disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`;

export const secondaryButton =
  `inline-flex items-center justify-center rounded-full border ${appSoftBorder} bg-app-text/[0.055] text-app-muted transition-colors hover:bg-app-text/[0.1] hover:text-app-text ${focusRing} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-app-text/[0.055] disabled:hover:text-app-muted`;
