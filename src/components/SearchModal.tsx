import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Monitor, Search } from "lucide-react";

import { cn } from "../lib/cn";
import type { Project, ProjectThread } from "../types";

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
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 pb-[16vh] backdrop-blur-[1px]"
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
        className="w-full max-w-[760px] overflow-hidden rounded-[22px] border border-white/[0.11] bg-[#252527]/96 text-zinc-200 shadow-[0_28px_90px_rgba(0,0,0,0.42)]"
        role="dialog"
      >
        <label className="flex h-[58px] items-center gap-3 px-5">
          <Search size={18} className="text-zinc-500" />
          <span className="sr-only">Search chats</span>
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-[19px] text-zinc-200 outline-none placeholder:text-zinc-500"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search chats"
          />
        </label>

        <div className="px-5 pb-2 text-[14px] font-medium text-zinc-500">
          {normalizedQuery ? "Matching chats" : "Recent chats"}
        </div>

        <div className="thin-scrollbar max-h-[410px] overflow-y-auto px-2 pb-2">
          {results.length > 0 ? (
            results.map((result, index) => (
              <button
                key={result.thread.id}
                className={cn(
                  "grid min-h-11 w-full grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-3 text-left text-[17px] text-zinc-300 transition-colors",
                  index === activeIndex
                    ? "bg-white/[0.10] text-zinc-100"
                    : "hover:bg-white/[0.06]"
                )}
                onClick={() => selectResult(result)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <Monitor size={17} className="text-zinc-400" />
                <span className="truncate">{result.thread.name}</span>
                <span className="hidden max-w-[190px] truncate text-[14px] text-zinc-500 sm:inline">
                  {result.project.name}
                </span>
                <kbd className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[13px] font-medium text-zinc-400">
                  ⌘{index + 1}
                </kbd>
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-[15px] text-zinc-500">
              No chats found
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
