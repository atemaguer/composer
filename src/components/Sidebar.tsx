import type { ElementType } from "react";
import { useEffect, useState } from "react";
import {
  Blocks,
  ChevronDown,
  Edit3,
  Folder,
  FolderOpen,
  MessageSquarePlus,
  PanelRight,
  Search,
  Settings
} from "lucide-react";

import { cn } from "../lib/cn";
import type { NavKey, Project } from "../types";
import { mutedIcon, sidebarItem } from "./style-tokens";

type SidebarProps = {
  className?: string;
  open: boolean;
  setSidebarOpen: (value: boolean) => void;
  projects: Project[];
  activeNav: NavKey;
  setActiveNav: (value: NavKey) => void;
  selectedThread: string;
  setSelectedThread: (value: string) => void;
  onThreadSelect?: (value: string) => void;
  onNewSession?: () => void;
  onSearch?: () => void;
  onPlugins?: () => void;
  onSettings?: () => void;
};

export function Sidebar({
  className,
  open,
  setSidebarOpen,
  projects,
  activeNav,
  setActiveNav,
  selectedThread,
  setSelectedThread,
  onThreadSelect,
  onNewSession,
  onSearch,
  onPlugins,
  onSettings
}: SidebarProps) {
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(
    () => new Set(projects.map((project) => project.name))
  );

  useEffect(() => {
    setExpandedWorkspaces((current) => {
      const next = new Set(current);

      for (const project of projects) {
        next.add(project.name);
      }

      return next;
    });
  }, [projects]);

  function toggleWorkspace(name: string) {
    setExpandedWorkspaces((current) => {
      const next = new Set(current);

      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }

      return next;
    });
  }

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden bg-app-sidebar/85 transition-opacity duration-[220ms] ease-in-out motion-reduce:transition-none max-[900px]:hidden",
        open ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
    >
      <div className="app-drag flex h-11 w-[244px] shrink-0 items-center gap-1.5 pl-[86px] pr-2">
        <button
          className="app-no-drag inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
          aria-label={open ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={open}
          onClick={() => setSidebarOpen(!open)}
        >
          <PanelRight className={cn(open && "rotate-180")} size={13} />
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

      <div className="thin-scrollbar flex min-h-0 w-[244px] flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-2 pb-2.5 pt-3">
        <nav className="grid gap-1" aria-label="Primary">
          <SidebarButton
            icon={Edit3}
            label="New session"
            active={activeNav === "New session"}
            onClick={() => {
              setActiveNav("New session");
              setSelectedThread("");
              onNewSession?.();
            }}
          />
          <SidebarButton icon={Search} label="Search" onClick={onSearch} />
          <SidebarButton
            icon={Blocks}
            label="Plugins"
            active={activeNav === "Plugins"}
            onClick={() => {
              setActiveNav("Plugins");
              onPlugins?.();
            }}
          />
        </nav>

        <div className="grid gap-1">
          <button
            className="flex h-7 w-full items-center justify-between rounded-md px-2 text-left text-[13px] text-app-dim transition-colors hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
            aria-expanded={workspacesOpen}
            aria-controls="workspace-list"
            onClick={() => setWorkspacesOpen(!workspacesOpen)}
          >
            <span>Workspaces</span>
            <ChevronDown
              className={cn(
                "text-zinc-500 transition-transform",
                !workspacesOpen && "-rotate-90"
              )}
              size={14}
            />
          </button>
          <div
            id="workspace-list"
            className={cn("grid gap-1", !workspacesOpen && "hidden")}
          >
            {projects.map((project) => {
              const expanded = expandedWorkspaces.has(project.name);
              const workspaceId = `workspace-${project.name.replace(/\s+/g, "-")}`;
              const WorkspaceFolder = expanded ? FolderOpen : Folder;

              return (
                <div key={project.name} className="grid gap-0.5">
                  <div className="grid min-h-7 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md text-app-muted transition-colors hover:bg-white/[0.05]">
                    <button
                      className="grid min-h-7 min-w-0 grid-cols-[17px_minmax(0,1fr)] items-center gap-2 rounded-md py-1 pl-2 pr-1 text-left text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
                      aria-expanded={expanded}
                      aria-controls={workspaceId}
                      onClick={() => toggleWorkspace(project.name)}
                    >
                      <WorkspaceFolder className={mutedIcon} size={14} />
                      <span className="truncate">{project.name}</span>
                    </button>
                    <button
                      aria-label={`New session in ${project.name}`}
                      className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
                      onClick={onNewSession}
                    >
                      <MessageSquarePlus size={13} />
                    </button>
                  </div>
                  <div
                    id={workspaceId}
                    className={cn("grid gap-1", !expanded && "hidden")}
                  >
                    {project.threads.map((thread) => (
                      <button
                        key={thread.id}
                        className={cn(
                          "grid min-h-7 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1 pl-[36px] pr-2 text-left text-[13px] text-zinc-300/70 transition-colors hover:bg-white/[0.05]",
                          selectedThread === thread.id &&
                            "bg-white/[0.08] text-app-text"
                        )}
                        onClick={() => {
                          setSelectedThread(thread.id);
                          onThreadSelect?.(thread.id);
                        }}
                      >
                        <span className="truncate">{thread.name}</span>
                        <em className="text-[12px] not-italic text-zinc-500">
                          {thread.age}
                        </em>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          className="mt-auto grid min-h-8 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-zinc-300/85 transition-colors hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
          onClick={onSettings}
        >
          <Settings className={mutedIcon} size={15} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

function SidebarButton({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(sidebarItem, active && "bg-white/[0.08] text-app-text")}
      onClick={onClick}
    >
      <Icon className={mutedIcon} size={15} />
      <span>{label}</span>
    </button>
  );
}
