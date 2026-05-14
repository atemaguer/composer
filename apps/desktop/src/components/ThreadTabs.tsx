import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  PanelTop,
  Trash2,
  X
} from "lucide-react";

import { cn } from "../lib/cn";
import type { SessionProvider } from "../types";
import { ProviderLogo } from "./ProviderLogo";
import { ThreadActivityIndicator } from "./ThreadActivityIndicator";
import {
  appActiveSurface,
  appHoverSurface,
  appSuccessText,
  appWarningText,
  subtleIconButton
} from "./style-tokens";
import { TooltipButton } from "./ui/tooltip-button";

export type ThreadTabItem = {
  id: string;
  name: string;
  age: string;
  provider?: SessionProvider;
  workspaceName: string;
  running?: boolean;
};

type ThreadTabsProps = {
  className?: string;
  threads: ThreadTabItem[];
  selectedThread: string;
  workspaceName: string;
  variant?: "bar" | "header";
  onThreadSelect: (threadId: string) => void;
  onThreadClose: () => void;
  onThreadArchive: (threadId: string) => void;
  onThreadDelete: (threadId: string) => void;
};

export function ThreadTabs({
  className,
  threads,
  selectedThread,
  workspaceName,
  variant = "bar",
  onThreadSelect,
  onThreadClose,
  onThreadArchive,
  onThreadDelete
}: ThreadTabsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({
    left: false,
    right: false
  });

  const updateScrollEdges = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      setScrollEdges({ left: false, right: false });
      return;
    }

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const next = {
      left: scroller.scrollLeft > 1,
      right: maxScrollLeft - scroller.scrollLeft > 1
    };

    setScrollEdges((current) =>
      current.left === next.left && current.right === next.right
        ? current
        : next
    );
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    updateScrollEdges();

    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(scroller);

    for (const child of scroller.children) {
      resizeObserver.observe(child);
    }

    window.addEventListener("resize", updateScrollEdges);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollEdges);
    };
  }, [threads, selectedThread, updateScrollEdges]);

  return (
    <div
      className={cn(
        "app-no-drag flex min-w-0 items-center gap-2",
        variant === "bar"
          ? "min-h-10 border-y border-app-line bg-app-sidebar/50 px-2.5"
          : "h-full flex-1 px-1",
        className
      )}
    >
      <div className="relative h-full min-w-0 flex-1">
        {scrollEdges.left && (
          <div
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r to-transparent",
              variant === "bar"
                ? "from-app-sidebar via-app-sidebar/80"
                : "from-app-shell via-app-shell/80"
            )}
          />
        )}
        {scrollEdges.right && (
          <div
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l to-transparent",
              variant === "bar"
                ? "from-app-sidebar via-app-sidebar/80"
                : "from-app-shell via-app-shell/80"
            )}
          />
        )}
        <div
          ref={scrollerRef}
          className="no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden px-2"
          onScroll={updateScrollEdges}
        >
          {threads.length > 0 ? (
            threads.map((thread) => (
              <ThreadTab
                key={thread.id}
                thread={thread}
                active={selectedThread === thread.id}
                onSelect={() => onThreadSelect(thread.id)}
                onClose={onThreadClose}
                onArchive={() => onThreadArchive(thread.id)}
                onDelete={() => onThreadDelete(thread.id)}
              />
            ))
          ) : (
            <div className="flex min-w-0 items-center gap-2 px-2 text-[13px] text-app-dim">
              <PanelTop size={14} />
              <span className="truncate">No threads in {workspaceName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadTab({
  thread,
  active,
  onSelect,
  onClose,
  onArchive,
  onDelete
}: {
  thread: ThreadTabItem;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group/tab grid h-8 max-w-[260px] shrink-0 grid-cols-[minmax(86px,1fr)_auto_auto] items-center gap-1 rounded-xl border px-1.5 transition-colors",
        active
          ? `border-app-line-bright ${appActiveSurface} text-app-text`
          : `border-transparent bg-transparent text-app-muted/75 hover:border-app-text/[0.08] ${appHoverSurface}`
      )}
    >
      <TooltipButton
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
        tooltip={`${thread.name} - ${thread.workspaceName}`}
        onClick={onSelect}
      >
        <ProviderLogo
          provider={thread.provider}
          className={cn(
            thread.provider === "claude" && appWarningText,
            thread.provider === "codex" && "text-app-muted",
            thread.provider === "meta" && appSuccessText
          )}
        />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{thread.name}</span>
          {thread.running && <ThreadActivityIndicator />}
        </span>
        <em className="text-[12px] not-italic text-app-dim">{thread.age}</em>
      </TooltipButton>
      <TooltipButton
        className={cn(
          subtleIconButton,
          "text-app-muted opacity-0 transition-opacity focus-visible:opacity-100 group-hover/tab:opacity-100"
        )}
        aria-label={`Archive ${thread.name}`}
        tooltip={`Archive ${thread.name}`}
        onClick={onArchive}
      >
        <Archive size={12} />
      </TooltipButton>
      <TooltipButton
        className={cn(
          subtleIconButton,
          "transition-all focus-visible:opacity-100",
          active
            ? `text-app-muted opacity-100 ${appHoverSurface}`
            : `text-app-dim opacity-0 ${appHoverSurface} hover:text-destructive/80 group-hover/tab:opacity-100`
        )}
        aria-label={active ? `Close ${thread.name}` : `Delete ${thread.name}`}
        tooltip={active ? `Close ${thread.name}` : `Delete ${thread.name}`}
        onClick={active ? onClose : onDelete}
      >
        {active ? <X size={12} /> : <Trash2 size={12} />}
      </TooltipButton>
    </div>
  );
}
