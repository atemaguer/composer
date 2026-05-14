import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  PanelTop,
  PanelRight,
  Plus
} from "lucide-react";

import { cn } from "../lib/cn";
import type { ThreadViewMode } from "../types";
import {
  appAccentBorderSoft,
  appAccentSurface,
  appAccentText,
  iconButton,
  subtleIconButton,
  titlebarControlRow
} from "./style-tokens";
import { TooltipButton } from "./ui/tooltip-button";

type AppChromeProps = {
  className?: string;
  mode?: "session" | "new";
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (value: boolean) => void;
  selectedThread: string;
  onNewSession: () => void;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  threadViewMode?: ThreadViewMode;
  onThreadViewModeChange?: (mode: ThreadViewMode) => void;
  centerSlot?: ReactNode;
  rightSlot?: ReactNode;
};

export function AppChrome({
  className,
  mode = "session",
  sidebarOpen,
  setSidebarOpen,
  inspectorOpen,
  setInspectorOpen,
  selectedThread,
  onNewSession,
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack,
  onNavigateForward,
  threadViewMode = "sidebar",
  onThreadViewModeChange,
  centerSlot,
  rightSlot
}: AppChromeProps) {
  return (
    <header
      className={cn(
        "app-drag z-10 grid items-center transition-[grid-template-columns] duration-[220ms] ease-in-out motion-reduce:transition-none max-[900px]:grid-cols-[minmax(0,1fr)_auto]",
        className
      )}
      style={{
        gridTemplateColumns: sidebarOpen
          ? "minmax(0, 1fr) auto"
          : "auto minmax(0, 1fr) auto"
      }}
    >
      {!sidebarOpen && (
        <div className={cn("h-full pr-3", titlebarControlRow)}>
          <TooltipButton
            className={cn("app-no-drag", subtleIconButton)}
            aria-label="Show sidebar"
            aria-pressed={sidebarOpen}
            tooltip="Show sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelRight size={13} />
          </TooltipButton>
          <TooltipButton
            className={cn(
              "app-no-drag disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent",
              subtleIconButton
            )}
            aria-label="Back"
            disabled={!canNavigateBack}
            tooltip="Back"
            onClick={onNavigateBack}
          >
            <ArrowLeft size={16} />
          </TooltipButton>
          <TooltipButton
            className={cn(
              "app-no-drag disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent",
              subtleIconButton
            )}
            aria-label="Forward"
            disabled={!canNavigateForward}
            tooltip="Forward"
            onClick={onNavigateForward}
          >
            <ArrowRight size={16} />
          </TooltipButton>
        </div>
      )}

      <div className="flex min-w-0 items-center justify-start gap-2 px-3 text-[13px] font-semibold text-app-text/90 max-[900px]:hidden">
        {centerSlot ?? (selectedThread && (
          <>
            <span className="truncate">{selectedThread}</span>
            <MoreHorizontal size={13} />
          </>
        ))}
      </div>

      <div className="app-no-drag flex items-center gap-1.5 px-3">
        {rightSlot ?? (
          <>
            {mode === "session" && (
              <TooltipButton
                className={iconButton}
                aria-label="New session"
                tooltip="New session"
                onClick={onNewSession}
              >
                <Plus size={15} />
              </TooltipButton>
            )}
            {mode === "session" && (
              <TooltipButton
                className={cn(
                  iconButton,
                  threadViewMode === "tabs" &&
                    `${appAccentBorderSoft} ${appAccentSurface} ${appAccentText}`
                )}
                aria-label={
                  threadViewMode === "tabs" ? "Use sidebar view" : "Use tab view"
                }
                aria-pressed={threadViewMode === "tabs"}
                tooltip={
                  threadViewMode === "tabs" ? "Use sidebar view" : "Use tab view"
                }
                onClick={() =>
                  onThreadViewModeChange?.(
                    threadViewMode === "tabs" ? "sidebar" : "tabs"
                  )
                }
              >
                <PanelTop size={14} />
              </TooltipButton>
            )}
            {!inspectorOpen && (
              <TooltipButton
                className={iconButton}
                aria-label="Show inspector"
                aria-pressed={inspectorOpen}
                tooltip="Show inspector"
                onClick={() => setInspectorOpen(true)}
              >
                <PanelRight size={14} />
              </TooltipButton>
            )}
          </>
        )}
      </div>
    </header>
  );
}
