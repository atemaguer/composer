import {
  Archive,
  PanelTop,
  Trash2,
  X
} from "lucide-react";

import { cn } from "../lib/cn";
import type { SessionProvider } from "../types";
import { ProviderLogo } from "./ProviderLogo";
import { TooltipButton } from "./ui/tooltip-button";

export type ThreadTabItem = {
  id: string;
  name: string;
  age: string;
  provider?: SessionProvider;
  workspaceName: string;
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
      <div className="flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden thin-scrollbar">
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
        "group/tab grid h-8 max-w-[260px] shrink-0 grid-cols-[minmax(86px,1fr)_auto_auto] items-center gap-1 rounded-[7px] border px-1.5 transition-colors",
        active
          ? "border-app-line-bright bg-white/[0.09] text-app-text"
          : "border-transparent bg-transparent text-zinc-300/75 hover:border-white/[0.08] hover:bg-white/[0.045]"
      )}
    >
      <TooltipButton
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[5px] px-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
        tooltip={`${thread.name} - ${thread.workspaceName}`}
        onClick={onSelect}
      >
        <ProviderLogo
          provider={thread.provider}
          className={cn(
            thread.provider === "claude" && "text-app-orange/85",
            thread.provider === "codex" && "text-zinc-300",
            thread.provider === "meta" && "text-app-green"
          )}
        />
        <span className="truncate text-[13px] font-medium">{thread.name}</span>
        <em className="text-[12px] not-italic text-zinc-500">{thread.age}</em>
      </TooltipButton>
      <TooltipButton
        className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-zinc-400 opacity-0 transition-opacity hover:bg-white/[0.08] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70 group-hover/tab:opacity-100"
        aria-label={`Archive ${thread.name}`}
        tooltip={`Archive ${thread.name}`}
        onClick={onArchive}
      >
        <Archive size={12} />
      </TooltipButton>
      <TooltipButton
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-[5px] transition-all focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70",
          active
            ? "text-zinc-300 opacity-100 hover:bg-white/[0.08]"
            : "text-zinc-500 opacity-0 hover:bg-white/[0.08] hover:text-red-200 group-hover/tab:opacity-100"
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
