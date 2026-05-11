import type { ReactNode } from "react";
import {
  ChevronDown,
  MoreHorizontal,
  PanelTop,
  PanelRight,
  Plus
} from "lucide-react";

import { cn } from "../lib/cn";
import type { ThreadViewMode } from "../types";
import { iconButton } from "./style-tokens";

type AppChromeProps = {
  className?: string;
  mode?: "session" | "new";
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (value: boolean) => void;
  selectedThread: string;
  onNewSession: () => void;
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
        <div className="flex h-full min-w-0 items-center gap-1.5 py-0 pl-[76px] pr-3">
          <button
            className="app-no-drag inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
            aria-label="Show sidebar"
            aria-pressed={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <PanelRight size={13} />
          </button>
          <button
            className="app-no-drag inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
            aria-label="Back"
          >
            <ChevronDown className="rotate-90" size={14} />
          </button>
          <button
            className="app-no-drag inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
            aria-label="Forward"
          >
            <ChevronDown className="-rotate-90" size={14} />
          </button>
        </div>
      )}

      <div className="flex min-w-0 items-center justify-start gap-2 px-3 text-[13px] font-semibold text-zinc-200/90 max-[900px]:hidden">
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
              <button
                className={iconButton}
                aria-label="New session"
                onClick={onNewSession}
              >
                <Plus size={15} />
              </button>
            )}
            {mode === "session" && (
              <button
                className={cn(
                  iconButton,
                  threadViewMode === "tabs" &&
                    "border-app-blue/30 bg-app-blue/12 text-app-blue"
                )}
                aria-label={
                  threadViewMode === "tabs" ? "Use sidebar view" : "Use tab view"
                }
                aria-pressed={threadViewMode === "tabs"}
                onClick={() =>
                  onThreadViewModeChange?.(
                    threadViewMode === "tabs" ? "sidebar" : "tabs"
                  )
                }
              >
                <PanelTop size={14} />
              </button>
            )}
            {!inspectorOpen && (
              <button
                className={iconButton}
                aria-label="Show inspector"
                aria-pressed={inspectorOpen}
                onClick={() => setInspectorOpen(true)}
              >
                <PanelRight size={14} />
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
