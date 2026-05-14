import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Monitor, Search } from "lucide-react";

import { cn } from "../lib/cn";
import type { Project, ProjectThread } from "../types";
import { appHoverSurface, cardSurface, menuItem } from "./style-tokens";
import { TooltipButton } from "./ui/tooltip-button";

type SearchModalProps = {
  open: boolean;
  projects: Project[];
  query: string;
  setQuery: (value: string) => void;
  onClose: () => void;
  onSelectThread: (threadId: string) => void;
};

type SearchResult = {
  project: Project;
  thread: ProjectThread;
};

export function SearchModal({
  open,
  projects,
  query,
  setQuery,
  onClose,
  onSelectThread
}: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    const flattened = projects.flatMap((project) =>
      project.threads.map((thread) => ({ project, thread }))
    );

    if (!normalizedQuery) {
      return flattened.slice(0, 9);
    }

    return flattened
      .filter(({ project, thread }) => {
        const haystack = `${thread.name} ${project.name} ${thread.provider ?? ""}`;
        return haystack.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 9);
  }, [normalizedQuery, projects]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  if (!open) {
    return null;
  }

  function selectResult(result: SearchResult) {
    onSelectThread(result.thread.id);
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) {
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.metaKey && /^[1-9]$/.test(event.key)) {
      const result = results[Number(event.key) - 1];

      if (result) {
        event.preventDefault();
        selectResult(result);
      }
      return;
    }

    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-app-bg/55 px-4 pb-[16vh] backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-label="Search chats"
        aria-modal="true"
        className={cn("w-full max-w-[760px] overflow-hidden text-app-text", cardSurface)}
        role="dialog"
      >
        <label className="flex h-[58px] items-center gap-3 px-5">
          <Search size={18} className="text-app-muted/75" />
          <span className="sr-only">Search chats</span>
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-[19px] text-app-text outline-none placeholder:text-app-dim"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search chats"
          />
        </label>

        <div className="px-5 pb-2 text-[14px] font-medium text-app-muted/70">
          {normalizedQuery ? "Matching chats" : "Recent chats"}
        </div>

        <div className="thin-scrollbar max-h-[410px] overflow-y-auto px-2 pb-2">
          {results.length > 0 ? (
            results.map((result, index) => (
              <TooltipButton
                key={result.thread.id}
                className={cn(
                  "grid min-h-11 w-full grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-3 text-left text-[17px] text-app-text/84 transition-colors",
                  menuItem,
                  index === activeIndex
                    ? "bg-app-panel-2/88 text-app-text shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-app-text)_6%,transparent)_inset]"
                    : appHoverSurface
                )}
                tooltip={`Open ${result.thread.name}`}
                onClick={() => selectResult(result)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <Monitor size={17} className="text-app-muted/80" />
                <span className="truncate">{result.thread.name}</span>
                <span className="hidden max-w-[190px] truncate text-[14px] text-app-muted/70 sm:inline">
                  {result.project.name}
                </span>
                <kbd className="rounded-full border border-app-line bg-app-panel/80 px-2 py-0.5 text-[13px] font-medium text-app-muted">
                  ⌘{index + 1}
                </kbd>
              </TooltipButton>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-[15px] text-app-muted/70">
              No chats found
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
