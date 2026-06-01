import type { ElementType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  Edit3,
  Folder,
  FolderOpen,
  HelpCircle,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  PanelRight,
  Plus,
  Search,
  Settings
} from "lucide-react";

import { cn } from "../lib/cn";
import type {
  NavKey,
  Project,
  ProjectThread,
  ProviderFilter,
  SessionProvider
} from "../types";
import { ProviderLogo } from "./ProviderLogo";
import { ThreadActivityIndicator } from "./ThreadActivityIndicator";
import {
  appAccentText,
  appActiveSurface,
  appActiveSurfaceStrong,
  appHoverSurfaceSubtle,
  appSuccessText,
  appWarningText,
  dimIcon,
  focusRing,
  mutedIcon,
  nestedIconButton,
  sidebarItem,
  subtleIconButton,
  titlebarControlRow
} from "./style-tokens";
import { GlassPanel } from "./liquid-glass/GlassPanel";
import { useLiquidGlassEnabled } from "./liquid-glass/useLiquidGlass";
import { useAppearanceStore } from "../state/appearance-store";
import { TooltipButton } from "./ui/tooltip-button";

type SidebarProps = {
  className?: string;
  open: boolean;
  setSidebarOpen: (value: boolean) => void;
  projects: Project[];
  activeNav: NavKey;
  newSessionActive: boolean;
  setActiveNav: (value: NavKey) => void;
  selectedThread: string;
  setSelectedThread: (value: string) => void;
  providerFilter: ProviderFilter;
  setProviderFilter: (value: ProviderFilter) => void;
  runningSessionIds: ReadonlySet<string>;
  sessionsLoading?: boolean;
  autoUpdateState?: AutoUpdateState;
  onInstallAutoUpdate?: () => void;
  onThreadSelect?: (value: string) => void;
  onThreadArchive?: (value: string) => void;
  onNewSession?: (project?: Project) => void;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  onSearch?: () => void;
  onSettings?: () => void;
};

const DISCORD_INVITE_URL = "https://discord.com/invite/mqq6NwczPw";

const INITIAL_THREADS_PER_WORKSPACE = 4;
const THREAD_LOAD_INCREMENT = 6;
const INITIAL_WORKSPACES = 12;
const WORKSPACE_LOAD_INCREMENT = 8;
const providerFilterOptions: Array<{
  label: string;
  value: ProviderFilter;
  provider?: SessionProvider;
}> = [
  { label: "All threads", value: "all" },
  { label: "Codex", value: "codex", provider: "codex" },
  { label: "Claude", value: "claude", provider: "claude" },
  { label: "Compose", value: "meta", provider: "meta" }
];

export function Sidebar({
  className,
  open,
  setSidebarOpen,
  projects,
  activeNav,
  newSessionActive,
  setActiveNav,
  selectedThread,
  setSelectedThread,
  providerFilter,
  setProviderFilter,
  runningSessionIds,
  sessionsLoading = false,
  autoUpdateState,
  onInstallAutoUpdate,
  onThreadSelect,
  onThreadArchive,
  onNewSession,
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack,
  onNavigateForward,
  onSearch,
  onSettings
}: SidebarProps) {
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState(
    () => new Set(projects.map(projectKey))
  );
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    () => new Set()
  );
  const [visibleThreadCounts, setVisibleThreadCounts] = useState<
    Record<string, number>
  >({});
  const [visibleWorkspaceCount, setVisibleWorkspaceCount] =
    useState(INITIAL_WORKSPACES);
  const [providerFilterOpen, setProviderFilterOpen] = useState(false);
  const liquidGlass = useLiquidGlassEnabled();
  const showSubagentSessions = useAppearanceStore(
    (state) => state.showSubagentSessions
  );
  const filteredProjects = useMemo(() => {
    // Subagent threads are nested as `children`; hide the whole subtree unless
    // the user has opted into showing them.
    const base = showSubagentSessions
      ? projects
      : projects.map((project) => ({
          ...project,
          threads: stripSubagentThreads(project.threads)
        }));

    return providerFilter === "all"
      ? base
      : base.flatMap((project) => {
          const threads = filterThreadTree(project.threads, providerFilter);

          return threads.length ? [{ ...project, threads }] : [];
        });
  }, [projects, providerFilter, showSubagentSessions]);
  const selectedProviderFilter = providerFilterOptions.find(
    (option) => option.value === providerFilter
  ) ?? providerFilterOptions[0];

  useEffect(() => {
    setExpandedWorkspaces((current) => {
      const next = new Set(current);

      for (const project of filteredProjects) {
        next.add(projectKey(project));
      }

      return next;
    });
  }, [filteredProjects]);

  useEffect(() => {
    setVisibleThreadCounts((current) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const project of filteredProjects) {
        const key = projectKey(project);
        const visibleThreadList = flattenThreads(project.threads);
        const selectedIndex = visibleThreadList.findIndex(
          (thread) => thread.id === selectedThread
        );
        const currentCount = current[key] ?? INITIAL_THREADS_PER_WORKSPACE;
        const selectedCount = selectedIndex === -1 ? 0 : selectedIndex + 1;
        const count = Math.min(
          project.threads.length,
          Math.max(INITIAL_THREADS_PER_WORKSPACE, currentCount, selectedCount)
        );

        next[key] = count;

        if (current[key] !== count) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [filteredProjects, selectedThread]);

  useEffect(() => {
    setExpandedThreads((current) => {
      const next = new Set(current);
      let changed = false;

      for (const project of filteredProjects) {
        for (const ancestorId of ancestorThreadIds(
          project.threads,
          selectedThread
        )) {
          if (!next.has(ancestorId)) {
            next.add(ancestorId);
            changed = true;
          }
        }
      }

      return changed ? next : current;
    });
  }, [filteredProjects, selectedThread]);

  useEffect(() => {
    setVisibleWorkspaceCount((current) => {
      const selectedWorkspaceIndex = filteredProjects.findIndex((project) =>
        flattenThreads(project.threads).some(
          (thread) => thread.id === selectedThread
        )
      );
      const selectedCount =
        selectedWorkspaceIndex === -1 ? 0 : selectedWorkspaceIndex + 1;

      return Math.min(
        filteredProjects.length,
        Math.max(INITIAL_WORKSPACES, current, selectedCount)
      );
    });
  }, [filteredProjects, selectedThread]);

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

  function showMoreThreads(key: string, totalThreads: number) {
    setVisibleThreadCounts((current) => {
      const currentCount = current[key] ?? INITIAL_THREADS_PER_WORKSPACE;

      return {
        ...current,
        [key]: Math.min(totalThreads, currentCount + THREAD_LOAD_INCREMENT)
      };
    });
  }

  function showMoreWorkspaces() {
    setVisibleWorkspaceCount((current) =>
      Math.min(filteredProjects.length, current + WORKSPACE_LOAD_INCREMENT)
    );
  }

  function toggleThread(threadId: string) {
    setExpandedThreads((current) => {
      const next = new Set(current);

      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }

      return next;
    });
  }

  async function openDiscordInvite() {
    try {
      if (window.composer?.openExternalUrl) {
        await window.composer.openExternalUrl(DISCORD_INVITE_URL);
        return;
      }
    } catch (error) {
      console.warn("Failed to open Discord invite externally", error);
    }

    window.open(DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
  }

  const visibleProjects = filteredProjects.slice(0, visibleWorkspaceCount);
  const hiddenWorkspaceCount = filteredProjects.length - visibleProjects.length;
  const showWorkspaceLoading = sessionsLoading && visibleProjects.length === 0;
  const showEmptyWorkspaces =
    !sessionsLoading && providerFilter === "all" && visibleProjects.length === 0;
  const showEmptyFilter =
    !sessionsLoading && providerFilter !== "all" && visibleProjects.length === 0;
  const updateDownloaded =
    autoUpdateState?.status === "downloaded" ||
    autoUpdateState?.status === "installing" ||
    autoUpdateState?.status === "install-error";
  const updateInstalling = autoUpdateState?.status === "installing";
  const updateInstallError = autoUpdateState?.status === "install-error";
  const renderThread = (thread: ProjectThread, depth = 0): ReactNode => {
    const children = thread.children ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedThreads.has(thread.id);
    const childrenId = `thread-children-${thread.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;

    return (
      <div key={thread.id} className="grid gap-1">
        <div
          className={cn(
            "group/thread grid min-h-7 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-md pr-1 text-[13px] text-app-muted/70 transition-colors",
            appHoverSurfaceSubtle,
            selectedThread === thread.id && `${appActiveSurface} text-app-text`
          )}
          style={{ paddingLeft: 36 + depth * 18 }}
        >
          <TooltipButton
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-left"
            aria-expanded={hasChildren ? expanded : undefined}
            aria-controls={hasChildren ? childrenId : undefined}
            tooltip={
              thread.subagent
                ? `${thread.name} (${thread.subagent.type ?? thread.subagent.role ?? "subagent"})`
                : thread.name
            }
            onClick={() => {
              if (selectedThread === thread.id && hasChildren) {
                toggleThread(thread.id);
                return;
              }

              setSelectedThread(thread.id);
              onThreadSelect?.(thread.id);

              if (hasChildren) {
                setExpandedThreads((current) => {
                  if (current.has(thread.id)) {
                    return current;
                  }

                  return new Set(current).add(thread.id);
                });
              }
            }}
          >
            <ProviderLogo
              provider={thread.provider}
              className={cn(
                thread.provider === "claude" && appWarningText,
                thread.provider === "codex" && appAccentText,
                thread.provider === "meta" && appSuccessText
              )}
            />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{thread.name}</span>
              {thread.subagent && (
                <span className="shrink-0 rounded-sm border border-app-border/70 px-1 text-[10px] uppercase tracking-[0.04em] text-app-dim">
                  Subagent
                </span>
              )}
              {runningSessionIds.has(thread.id) && <ThreadActivityIndicator />}
            </span>
            <em className="text-[12px] not-italic text-app-dim">{thread.age}</em>
          </TooltipButton>
          {hasChildren && (
            <TooltipButton
              aria-label={
                expanded ? `Collapse ${thread.name}` : `Expand ${thread.name}`
              }
              className={cn(nestedIconButton, "text-app-muted")}
              aria-expanded={expanded}
              aria-controls={childrenId}
              tooltip={
                expanded ? `Collapse ${thread.name}` : `Expand ${thread.name}`
              }
              onClick={(event) => {
                event.stopPropagation();
                toggleThread(thread.id);
              }}
            >
              <ArrowRight
                className={cn("transition-transform", expanded && "rotate-90")}
                size={13}
              />
            </TooltipButton>
          )}
          <ThreadActionButton
            label={`Archive ${thread.name}`}
            onClick={() => onThreadArchive?.(thread.id)}
          >
            <Archive size={12} />
          </ThreadActionButton>
        </div>
        {hasChildren && expanded && (
          <div id={childrenId} className="grid gap-1">
            {children.map((child) => renderThread(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden transition-opacity duration-[220ms] ease-in-out motion-reduce:transition-none max-[900px]:hidden",
        // Glass on: a translucent dark tint over the native window vibrancy that
        // shows through the transparent shell (see App root + styles.css). Off:
        // the solid sidebar surface, identical to before.
        liquidGlass ? "bg-app-sidebar/60" : "bg-app-sidebar/85",
        open ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
    >
      <div
        className={cn(
          "app-drag h-11 w-full shrink-0 pr-2",
          titlebarControlRow
        )}
      >
        <TooltipButton
          className={cn("app-no-drag", subtleIconButton)}
          aria-label={open ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={open}
          tooltip={open ? "Hide sidebar" : "Show sidebar"}
          onClick={() => setSidebarOpen(!open)}
        >
          <PanelRight className={cn(open && "rotate-180")} size={13} />
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

      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden px-2 pb-2.5 pt-3">
        <nav className="grid shrink-0 gap-1" aria-label="Primary">
          <SidebarButton
            icon={Edit3}
            label="New session"
            active={newSessionActive}
            onClick={() => {
              setActiveNav("New session");
              setSelectedThread("");
              onNewSession?.();
            }}
          />
          <SidebarButton icon={Search} label="Search" onClick={onSearch} />
        </nav>

        <div className="relative flex min-h-0 flex-1 flex-col gap-1">
          <div className="grid h-8 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1">
            <TooltipButton
              className={cn(
                "flex h-full min-w-0 items-center rounded-md px-2 text-left text-[13px] text-app-dim transition-colors",
                appHoverSurfaceSubtle,
                focusRing
              )}
              aria-expanded={workspacesOpen}
              aria-controls="workspace-list"
              tooltip={
                workspacesOpen ? "Collapse workspaces" : "Expand workspaces"
              }
              onClick={() => setWorkspacesOpen(!workspacesOpen)}
            >
              <span>Workspaces</span>
            </TooltipButton>
            <TooltipButton
              className={cn(
                subtleIconButton,
                providerFilter !== "all" &&
                  `${appActiveSurfaceStrong} text-app-text hover:bg-app-text/[0.12]`
              )}
              aria-label={`Show ${selectedProviderFilter.label}`}
              aria-haspopup="menu"
              aria-expanded={providerFilterOpen}
              tooltip={`Show: ${selectedProviderFilter.label}`}
              onClick={(event) => {
                event.stopPropagation();
                setProviderFilterOpen((value) => !value);
              }}
            >
              <ListFilter size={15} />
            </TooltipButton>
            <TooltipButton
              className={subtleIconButton}
              aria-label={workspacesOpen ? "Collapse workspaces" : "Expand workspaces"}
              aria-expanded={workspacesOpen}
              aria-controls="workspace-list"
              tooltip={
                workspacesOpen ? "Collapse workspaces" : "Expand workspaces"
              }
              onClick={() => setWorkspacesOpen(!workspacesOpen)}
            >
              <ArrowRight
                className={cn(
                  "transition-transform",
                  dimIcon,
                  workspacesOpen && "rotate-90"
                )}
                size={14}
              />
            </TooltipButton>
          </div>
          {providerFilterOpen && (
            <GlassPanel
              variant="menu"
              className="absolute right-0 top-9 z-30 grid min-w-[188px] gap-1 p-3 text-[13px]"
              role="menu"
            >
              <div className="px-2 pb-1 text-[13px] text-app-dim">Show</div>
              {providerFilterOptions.map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    "grid min-h-7 grid-cols-[18px_minmax(0,1fr)_18px] items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-app-muted transition-colors",
                    appHoverSurfaceSubtle,
                    focusRing,
                    providerFilter === option.value &&
                      `${appActiveSurface} text-app-text`
                  )}
                  role="menuitemradio"
                  aria-checked={providerFilter === option.value}
                  onClick={() => {
                    setProviderFilter(option.value);
                    setProviderFilterOpen(false);
                    setVisibleWorkspaceCount(INITIAL_WORKSPACES);
                  }}
                >
                  {option.provider ? (
                    <ProviderLogo
                      provider={option.provider}
                      className={cn(
                        "h-3.5 w-3.5",
                        option.provider === "claude" && appWarningText,
                        option.provider === "codex" && appAccentText,
                        option.provider === "meta" && appSuccessText
                      )}
                    />
                  ) : (
                    <ListFilter className={dimIcon} size={14} />
                  )}
                  <span>{option.label}</span>
                  {providerFilter === option.value ? (
                    <Check className="text-app-muted" size={16} />
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </button>
              ))}
            </GlassPanel>
          )}
          <div
            className={cn(
              "relative min-h-0 flex-1",
              !workspacesOpen && "hidden"
            )}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-app-sidebar via-app-sidebar/70 to-app-sidebar/0" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-app-sidebar via-app-sidebar/70 to-app-sidebar/0" />
            <div
              id="workspace-list"
              className="thin-scrollbar grid h-full min-h-0 auto-rows-min content-start gap-1 overflow-x-hidden overflow-y-auto py-2 pr-1"
            >
              {showWorkspaceLoading && (
                <div
                  className="flex min-h-20 items-center gap-2 rounded-md px-2 py-3 text-[13px] text-app-muted"
                  role="status"
                  aria-live="polite"
                >
                  <LoaderCircle
                    className="shrink-0 animate-spin text-app-accent"
                    size={14}
                  />
                  <span>Loading sessions</span>
                </div>
              )}
              {showEmptyWorkspaces && (
                <div className="rounded-md px-2 py-3 text-[13px] leading-5 text-app-dim">
                  No sessions yet
                </div>
              )}
              {showEmptyFilter && (
                <div className="rounded-md px-2 py-3 text-[13px] leading-5 text-app-dim">
                  No {selectedProviderFilter.label.toLowerCase()} yet
                </div>
              )}
              {!showWorkspaceLoading && visibleProjects.map((project) => {
                const key = projectKey(project);
                const expanded = expandedWorkspaces.has(key);
                const workspaceId = `workspace-${key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
                const WorkspaceFolder = expanded ? FolderOpen : Folder;
                const visibleThreadCount =
                  visibleThreadCounts[key] ?? INITIAL_THREADS_PER_WORKSPACE;
                const visibleThreads = project.threads.slice(0, visibleThreadCount);
                const hiddenThreadCount =
                  project.threads.length - visibleThreads.length;

                return (
                  <div key={key} className="grid gap-0.5">
                    <div
                      className={cn(
                        "group/workspace grid min-h-7 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md text-app-muted transition-colors",
                        appHoverSurfaceSubtle
                      )}
                    >
                      <TooltipButton
                        className={cn(
                          "grid min-h-7 min-w-0 grid-cols-[17px_minmax(0,1fr)] items-center gap-2 rounded-md py-1 pl-2 pr-1 text-left text-[13px]",
                          focusRing
                        )}
                        aria-expanded={expanded}
                        aria-controls={workspaceId}
                        tooltip={
                          expanded
                            ? `Collapse ${project.name}`
                            : `Expand ${project.name}`
                        }
                        onClick={() => toggleWorkspace(key)}
                      >
                        <WorkspaceFolder className={mutedIcon} size={14} />
                        <span className="truncate">{project.name}</span>
                      </TooltipButton>
                      <TooltipButton
                        aria-label={`New session in ${project.name}`}
                        className={cn(
                          "mr-1 opacity-0 transition-opacity group-hover/workspace:opacity-100 focus-visible:opacity-100",
                          nestedIconButton
                        )}
                        tooltip={`New session in ${project.name}`}
                        onClick={() => onNewSession?.(project)}
                      >
                        <Plus size={13} />
                      </TooltipButton>
                    </div>
                    <div
                      id={workspaceId}
                      className={cn("grid gap-1", !expanded && "hidden")}
                    >
                      {visibleThreads.map((thread) => renderThread(thread))}
                      {hiddenThreadCount > 0 && (
                        <TooltipButton
                          className={cn(
                            "grid min-h-7 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md py-1 pl-[36px] pr-2 text-left text-[13px] text-app-muted transition-colors hover:text-app-text",
                            appHoverSurfaceSubtle,
                            focusRing
                          )}
                          tooltip={`Show ${hiddenThreadCount} more ${
                            hiddenThreadCount === 1 ? "thread" : "threads"
                          } in ${project.name}`}
                          onClick={() =>
                            showMoreThreads(key, project.threads.length)
                          }
                        >
                          <MoreHorizontal size={14} />
                          <span>More</span>
                        </TooltipButton>
                      )}
                    </div>
                  </div>
                );
              })}
              {hiddenWorkspaceCount > 0 && (
                <TooltipButton
                  className={cn(
                    "grid min-h-7 w-full grid-cols-[17px_minmax(0,1fr)] items-center gap-2 rounded-md py-1 pl-2 pr-2 text-left text-[13px] text-app-muted transition-colors hover:text-app-text",
                    appHoverSurfaceSubtle,
                    focusRing
                  )}
                  tooltip={`Show ${hiddenWorkspaceCount} more ${
                    hiddenWorkspaceCount === 1 ? "workspace" : "workspaces"
                  }`}
                  onClick={showMoreWorkspaces}
                >
                  <MoreHorizontal size={14} />
                  <span>More</span>
                </TooltipButton>
              )}
            </div>
          </div>
        </div>

        <div className="relative grid shrink-0 gap-1">
          <div className="grid min-h-8 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-1">
            <TooltipButton
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-app-muted/85 transition-colors",
                appHoverSurfaceSubtle,
                focusRing
              )}
              aria-label="Join Discord"
              tooltip="Join Discord"
              onClick={() => void openDiscordInvite()}
            >
              <HelpCircle className={mutedIcon} size={17} />
            </TooltipButton>
            <TooltipButton
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-app-muted/85 transition-colors",
                appHoverSurfaceSubtle,
                focusRing
              )}
              tooltip="Settings"
              onClick={onSettings}
            >
              <Settings className={mutedIcon} size={15} />
            </TooltipButton>
            {updateDownloaded && (
              <TooltipButton
                className={cn(
                  "justify-self-end rounded-full bg-app-accent px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-app-accent/90",
                  updateInstalling && "cursor-default opacity-80 hover:bg-app-accent",
                  updateInstallError && "bg-red-500/90 hover:bg-red-500",
                  focusRing
                )}
                tooltip={
                  updateInstallError
                    ? `Update failed: ${autoUpdateState.message}`
                    : `Install Composer ${autoUpdateState.version}`
                }
                disabled={updateInstalling}
                onClick={onInstallAutoUpdate}
              >
                <span>
                  {updateInstalling ? "Installing" : updateInstallError ? "Retry" : "Update"}
                </span>
              </TooltipButton>
            )}
            <span className="text-[11px] tabular-nums text-app-dim">
              v{__APP_VERSION__}
            </span>
          </div>
          {updateInstallError && (
            <div className="max-h-8 overflow-hidden px-2 text-[11px] leading-4 text-red-300/90">
              {autoUpdateState.message}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function ThreadActionButton({
  children,
  label,
  onClick
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <TooltipButton
      aria-label={label}
      className={cn(
        nestedIconButton,
        "opacity-0 transition-opacity focus-visible:opacity-100 group-hover/thread:opacity-100",
        "text-app-muted"
      )}
      tooltip={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </TooltipButton>
  );
}

function projectKey(project: Project) {
  return project.id ?? project.cwd ?? project.name;
}

function filterThreadTree(
  threads: ProjectThread[],
  providerFilter: ProviderFilter
): ProjectThread[] {
  return threads.flatMap((thread) => {
    const children = filterThreadTree(thread.children ?? [], providerFilter);

    if (thread.provider === providerFilter || children.length > 0) {
      return [{ ...thread, children }];
    }

    return [];
  });
}

function flattenThreads(threads: ProjectThread[]): ProjectThread[] {
  return threads.flatMap((thread) => [
    thread,
    ...flattenThreads(thread.children ?? [])
  ]);
}

/** Drop subagent threads at every level, keeping only top-level agent threads. */
function stripSubagentThreads(threads: ProjectThread[]): ProjectThread[] {
  return threads
    .filter((thread) => !thread.subagent)
    .map((thread) => ({
      ...thread,
      children: stripSubagentThreads(thread.children ?? [])
    }));
}

function ancestorThreadIds(
  threads: ProjectThread[],
  threadId: string
): string[] {
  if (!threadId) {
    return [];
  }

  for (const thread of threads) {
    if (thread.id === threadId) {
      return [];
    }

    const childAncestors = ancestorThreadIds(thread.children ?? [], threadId);

    if (childAncestors.length > 0) {
      return [thread.id, ...childAncestors];
    }

    if ((thread.children ?? []).some((child) => child.id === threadId)) {
      return [thread.id];
    }
  }

  return [];
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
    <TooltipButton
      className={cn(sidebarItem, active && `${appActiveSurface} text-app-text`)}
      tooltip={label}
      onClick={onClick}
    >
      <Icon className={mutedIcon} size={15} />
      <span>{label}</span>
    </TooltipButton>
  );
}
