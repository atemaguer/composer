import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  File as FileIcon,
  FileCode2,
  Folder,
  GitBranch,
  ListTree,
  LoaderCircle,
  Maximize2,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  SquareTerminal,
  X
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import "@xterm/xterm/css/xterm.css";

import { cn } from "../lib/cn";
import type {
  ComposerReviewCommentAttachment,
  FilePreview,
  InspectorPanelTab,
  ReviewBranchComparison,
  ReviewBranchRef,
  ReviewDiff,
  ReviewDiffFile,
  ReviewDiffLine,
  ReviewDiffScope,
  WorkspaceFileEntry
} from "../types";
import { CodeEditor } from "./CodeEditor";
import {
  cardSurface,
  pillButton,
  subtleIconButton
} from "./style-tokens";
import { TooltipButton } from "./ui/tooltip-button";

type ReviewPanelProps = {
  className?: string;
  open: boolean;
  present: boolean;
  activeTab: InspectorPanelTab;
  review?: ReviewDiff | null;
  reviewScope: ReviewDiffScope;
  lastTurnAvailable?: boolean;
  reviewLoading?: boolean;
  reviewError?: string | null;
  branchRefs?: ReviewBranchRef[];
  branchRefsLoading?: boolean;
  branchRefsError?: string | null;
  branchComparison?: ReviewBranchComparison | null;
  selectedReviewPath?: string | null;
  filePreviewTabOpen?: boolean;
  filePreviewPath?: string | null;
  filePreview?: FilePreview | null;
  filePreviewError?: string | null;
  filePreviewLoading?: boolean;
  filePreviewTabs?: string[];
  canNavigateFilePreviewBack?: boolean;
  canNavigateFilePreviewForward?: boolean;
  workspaceCwd?: string | null;
  workspaceName?: string;
  workspaceFiles?: WorkspaceFileEntry[];
  workspaceFilesLoading?: boolean;
  workspaceFilesError?: string | null;
  fullscreen?: boolean;
  onTabChange?: (tab: InspectorPanelTab) => void;
  onAddFilePreviewTab?: () => void;
  onCloseFilePreviewTab?: (filePath?: string) => void;
  onNavigateFilePreviewHistory?: (direction: -1 | 1) => void;
  onOpenFile?: (filePath: string) => void;
  onReviewScopeChange?: (scope: ReviewDiffScope) => void;
  onBranchComparisonChange?: (comparison: ReviewBranchComparison) => void;
  onAddReviewComment?: (attachment: Omit<ComposerReviewCommentAttachment, "id">) => void;
  onRefreshReview?: () => void;
  onToggleFullscreen?: () => void;
  onClose?: () => void;
};

const reviewScopeLabelByValue: Record<ReviewDiffScope, string> = {
  "last-turn": "Last turn",
  unstaged: "Unstaged",
  staged: "Staged",
  commit: "Commit",
  branch: "Branch"
};

const reviewScopeOptions: Array<{
  value: ReviewDiffScope;
  label: string;
}> = [
  { value: "unstaged", label: reviewScopeLabelByValue.unstaged },
  { value: "staged", label: reviewScopeLabelByValue.staged },
  { value: "commit", label: reviewScopeLabelByValue.commit },
  { value: "branch", label: reviewScopeLabelByValue.branch },
  { value: "last-turn", label: reviewScopeLabelByValue["last-turn"] }
];

type TerminalTab = {
  id: string;
  label: string;
};

let terminalTabSeed = 0;

function createTerminalTab(index: number): TerminalTab {
  terminalTabSeed += 1;

  return {
    id: `terminal-${Date.now()}-${terminalTabSeed}`,
    label: index === 1 ? "zsh" : `zsh ${index}`
  };
}

export function ReviewPanel({
  className,
  open,
  present,
  activeTab,
  review,
  reviewScope,
  lastTurnAvailable = false,
  reviewLoading,
  reviewError,
  branchRefs = [],
  branchRefsLoading = false,
  branchRefsError,
  branchComparison,
  selectedReviewPath,
  filePreviewTabOpen = false,
  filePreviewPath,
  filePreview,
  filePreviewError,
  filePreviewLoading,
  filePreviewTabs = [],
  canNavigateFilePreviewBack = false,
  canNavigateFilePreviewForward = false,
  workspaceCwd,
  workspaceName = "Workspace",
  workspaceFiles = [],
  workspaceFilesLoading = false,
  workspaceFilesError,
  fullscreen = false,
  onTabChange,
  onAddFilePreviewTab,
  onCloseFilePreviewTab,
  onNavigateFilePreviewHistory,
  onOpenFile,
  onReviewScopeChange,
  onBranchComparisonChange,
  onAddReviewComment,
  onRefreshReview,
  onToggleFullscreen,
  onClose
}: ReviewPanelProps) {
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(() => [
    createTerminalTab(1)
  ]);
  const [activeTerminalTabId, setActiveTerminalTabId] = useState(() =>
    terminalTabs[0]?.id ?? ""
  );
  const scopeButtonRef = useRef<HTMLButtonElement>(null);
  const scopeMenuRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const openFileTabs = useMemo(
    () =>
      filePreviewTabs.length
        ? filePreviewTabs
        : filePreviewPath
          ? [filePreviewPath]
          : [],
    [filePreviewPath, filePreviewTabs]
  );
  const hasFilePreviewTab =
    filePreviewTabOpen ||
    openFileTabs.length > 0 ||
    Boolean(filePreview || filePreviewLoading || filePreviewError);
  const activePanelTab =
    activeTab === "file-preview" && !hasFilePreviewTab ? "review" : activeTab;
  const showingReview = activePanelTab === "review";
  const showingFilePreview = activePanelTab === "file-preview";
  const showingTerminal = activePanelTab === "terminal";
  const showingBoundedPanel = showingFilePreview || showingTerminal;
  const previewPath = filePreview?.path ?? filePreviewPath;
  const additions = review?.additions ?? 0;
  const deletions = review?.deletions ?? 0;
  const fileCount = review?.files.length ?? 0;
  const hasReviewChanges = fileCount > 0;
  const reviewScopeLabel = reviewScopeLabelByValue[reviewScope];

  function addTerminalTab() {
    setTerminalTabs((current) => {
      const nextTab = createTerminalTab(current.length + 1);
      setActiveTerminalTabId(nextTab.id);
      return [...current, nextTab];
    });
    setAddMenuOpen(false);
    onTabChange?.("terminal");
  }

  function selectTerminalTab(tabId: string) {
    setActiveTerminalTabId(tabId);
    onTabChange?.("terminal");
  }

  function closeTerminalTab(tabId: string) {
    setTerminalTabs((current) => {
      if (current.length <= 1 || current[0]?.id === tabId) {
        return current;
      }

      const closedIndex = current.findIndex((tab) => tab.id === tabId);

      if (closedIndex === -1) {
        return current;
      }

      const next = current.filter((tab) => tab.id !== tabId);

      if (activeTerminalTabId === tabId) {
        const nextActiveTab =
          next[Math.min(closedIndex, next.length - 1)] ?? next[0];
        setActiveTerminalTabId(nextActiveTab.id);
      }

      return next;
    });
  }

  useEffect(() => {
    if (!scopeMenuOpen) {
      return;
    }

    function closeOnOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;

      if (
        scopeMenuRef.current?.contains(target) ||
        scopeButtonRef.current?.contains(target)
      ) {
        return;
      }

      setScopeMenuOpen(false);
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setScopeMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [scopeMenuOpen]);

  useEffect(() => {
    if (!addMenuOpen) {
      return;
    }

    function closeOnOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;

      if (
        addMenuRef.current?.contains(target) ||
        addButtonRef.current?.contains(target)
      ) {
        return;
      }

      setAddMenuOpen(false);
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setAddMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [addMenuOpen]);

  return (
    <aside
      aria-label="Review changes"
      aria-hidden={!open}
      hidden={!present}
      className={cn(
        "min-h-0 min-w-0 overflow-hidden bg-app-shell/94 transition-opacity duration-[220ms] ease-in-out motion-reduce:transition-none",
        open ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
    >
      <div
        className={cn(
          "thin-scrollbar h-full overflow-x-hidden",
          fullscreen
            ? "w-full min-w-0"
            : "w-[var(--review-content-width)] min-w-[var(--review-content-width)]",
          showingBoundedPanel
            ? "grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
            : "overflow-y-auto"
        )}
      >
        <div className={cn("top-0 z-10 bg-app-shell/95", !showingBoundedPanel && "sticky")}>
          <div className="grid h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-app-line px-3">
            <div
              className="flex min-w-0 items-center gap-1.5 overflow-hidden"
              role="tablist"
              aria-label="Inspector tabs"
            >
              <InspectorIconTabButton
                active={showingReview}
                tooltip="Review changes"
                onClick={() => onTabChange?.("review")}
              >
                <GitBranch size={15} />
              </InspectorIconTabButton>
              {terminalTabs.map((tab, index) => (
                <TerminalIconTabButton
                  key={tab.id}
                  active={showingTerminal && activeTerminalTabId === tab.id}
                  label={tab.label}
                  closable={index > 0}
                  onSelect={() => selectTerminalTab(tab.id)}
                  onClose={() => closeTerminalTab(tab.id)}
                />
              ))}
              {!showingFilePreview && (
                <InspectorIconTabButton
                  active={false}
                  tooltip="File preview"
                  onClick={() => {
                    if (hasFilePreviewTab) {
                      onTabChange?.("file-preview");
                    } else {
                      onAddFilePreviewTab?.();
                    }
                  }}
                >
                  <FileIcon size={15} />
                </InspectorIconTabButton>
              )}
              {hasFilePreviewTab && showingFilePreview && (
                <>
                  <div className="mx-1 h-5 w-px shrink-0 bg-app-line" />
                  <FilePreviewTabStrip
                    paths={openFileTabs}
                    activePath={previewPath}
                    onSelect={(path) => {
                      onTabChange?.("file-preview");
                      onOpenFile?.(path);
                    }}
                    onClose={(path) => onCloseFilePreviewTab?.(path)}
                  />
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 text-app-dim">
              <div className="relative">
                <TooltipButton
                  ref={addButtonRef}
                  className={cn(
                    subtleIconButton,
                    addMenuOpen && "bg-app-text/[0.08] text-app-text"
                  )}
                  aria-label="Add panel"
                  aria-haspopup="menu"
                  aria-expanded={addMenuOpen}
                  tooltip="Add panel"
                  onClick={() => setAddMenuOpen((value) => !value)}
                >
                  <Plus size={16} />
                </TooltipButton>
                {addMenuOpen && (
                  <AddPanelMenu
                    menuRef={addMenuRef}
                    onAddTerminal={addTerminalTab}
                  />
                )}
              </div>
              <TooltipButton
                className={cn(
                  subtleIconButton,
                  fullscreen && "bg-app-text/[0.08] text-app-text"
                )}
                aria-label={fullscreen ? "Exit fullscreen inspector" : "Expand inspector"}
                tooltip={fullscreen ? "Exit fullscreen" : "Expand inspector"}
                onClick={onToggleFullscreen}
              >
                {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </TooltipButton>
              <TooltipButton
                className={subtleIconButton}
                aria-label="Hide inspector"
                tooltip="Hide inspector"
                onClick={onClose}
              >
                <PanelRight size={15} />
              </TooltipButton>
            </div>
          </div>
          {showingFilePreview || showingTerminal ? null : (
            <div className="flex h-11 items-center justify-between border-b border-app-line px-5 text-[13px]">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <TooltipButton
                    ref={scopeButtonRef}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-0 text-[15px] font-medium text-app-text hover:text-app-muted"
                    )}
                    aria-haspopup="menu"
                    aria-expanded={scopeMenuOpen}
                    tooltip="Choose diff scope"
                    onClick={() => setScopeMenuOpen((value) => !value)}
                  >
                    <span className="whitespace-nowrap">{reviewScopeLabel}</span>
                    {reviewScope === "unstaged" && hasReviewChanges && (
                      <span className="mx-1 rounded-full bg-app-text/[0.08] px-2 py-0.5 text-[12px] text-app-muted">
                        {fileCount}
                      </span>
                    )}
                    <ChevronDown size={14} className="text-app-dim" />
                  </TooltipButton>
                  {scopeMenuOpen && (
                    <ReviewScopeMenu
                      menuRef={scopeMenuRef}
                      selectedScope={reviewScope}
                      lastTurnAvailable={lastTurnAvailable}
                      onSelect={(scope) => {
                        setScopeMenuOpen(false);
                        onReviewScopeChange?.(scope);
                      }}
                    />
                  )}
                </div>
                {hasReviewChanges && (
                  <>
                    <span className="ml-4 text-app-green">+{additions}</span>
                    <span className="text-destructive">-{deletions}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3.5 text-app-dim">
                <MoreHorizontal size={14} />
                <TooltipButton
                  className={subtleIconButton}
                  aria-label="Refresh review"
                  tooltip="Refresh review"
                  onClick={onRefreshReview}
                >
                  <RefreshCw
                    size={13}
                    className={cn(reviewLoading && "animate-spin")}
                  />
                </TooltipButton>
              </div>
            </div>
          )}
          {showingReview && reviewScope === "branch" && (
            <BranchComparisonBar
              comparison={review?.comparison ?? branchComparison ?? undefined}
              branches={branchRefs}
              loading={branchRefsLoading}
              error={branchRefsError}
              onChange={onBranchComparisonChange}
            />
          )}
        </div>

        <div
          className={cn(
            "grid min-h-0",
            showingBoundedPanel
              ? "h-full overflow-hidden"
              : "min-h-[calc(100%_-_88px)]"
          )}
        >
          {showingFilePreview ? (
            <FilePreviewWorkspace
              cwd={workspaceCwd}
              workspaceName={workspaceName}
              files={workspaceFiles}
              filesLoading={workspaceFilesLoading}
              filesError={workspaceFilesError}
              previewPath={previewPath}
              filePreview={filePreview}
              filePreviewLoading={filePreviewLoading}
              filePreviewError={filePreviewError}
              canNavigateBack={canNavigateFilePreviewBack}
              canNavigateForward={canNavigateFilePreviewForward}
              onNavigateHistory={onNavigateFilePreviewHistory}
              onOpenFile={onOpenFile}
            />
          ) : showingTerminal ? (
            <TerminalWorkspace
              tabs={terminalTabs}
              activeTabId={activeTerminalTabId}
              cwd={workspaceCwd}
            />
          ) : (
            <ReviewDiffPreview
              review={review}
              reviewScope={reviewScope}
              selectedPath={selectedReviewPath}
              loading={Boolean(reviewLoading)}
              error={reviewError}
              onAddReviewComment={onAddReviewComment}
              onRefresh={onRefreshReview}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

function InspectorIconTabButton({
  active,
  tooltip,
  children,
  onClick
}: {
  active: boolean;
  tooltip: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <TooltipButton
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-app-dim transition-colors hover:bg-app-text/[0.08] hover:text-app-text",
        active && "bg-app-text/[0.10] text-app-text"
      )}
      role="tab"
      aria-selected={active}
      aria-label={tooltip}
      tooltip={tooltip}
      onClick={onClick}
    >
      {children}
    </TooltipButton>
  );
}

function TerminalIconTabButton({
  active,
  label,
  closable,
  onSelect,
  onClose
}: {
  active: boolean;
  label: string;
  closable: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "group/terminal-tab grid h-8 shrink-0 items-center rounded-[10px] text-app-dim transition-colors hover:bg-app-text/[0.08] hover:text-app-text",
        closable
          ? "w-[118px] grid-cols-[minmax(0,1fr)_18px] pr-1"
          : "w-[86px] grid-cols-[minmax(0,1fr)]",
        active && "bg-app-text/[0.10] text-app-text"
      )}
    >
      <TooltipButton
        className="grid h-8 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[10px] px-2 text-left text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
        role="tab"
        aria-selected={active}
        aria-label={label}
        tooltip={label}
        onClick={onSelect}
      >
        <SquareTerminal size={15} className="shrink-0" />
        <span className="truncate">{label}</span>
      </TooltipButton>
      {closable && (
        <TooltipButton
          className={cn(
            "inline-flex size-[18px] items-center justify-center rounded-md text-app-dim transition-opacity hover:bg-app-text/[0.12] hover:text-app-text focus-visible:opacity-100",
            active ? "opacity-100" : "opacity-0 group-hover/terminal-tab:opacity-100"
          )}
          aria-label={`Close ${label}`}
          tooltip={`Close ${label}`}
          onClick={onClose}
        >
          <X size={11} />
        </TooltipButton>
      )}
    </div>
  );
}

function AddPanelMenu({
  menuRef,
  onAddTerminal
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  onAddTerminal: () => void;
}) {
  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-[calc(100%+8px)] z-50 w-[220px] rounded-xl border border-app-line bg-app-panel p-1.5 shadow-2xl"
      role="menu"
    >
      <button
        type="button"
        className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] text-app-text transition-colors hover:bg-app-text/[0.08]"
        role="menuitem"
        onClick={onAddTerminal}
      >
        <SquareTerminal size={15} className="text-app-muted" />
        <span>Terminal</span>
      </button>
    </div>
  );
}

function FilePreviewTabStrip({
  paths,
  activePath,
  onSelect,
  onClose
}: {
  paths: string[];
  activePath?: string | null;
  onSelect: (path: string) => void;
  onClose: (path?: string) => void;
}) {
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
  }, [activePath, paths, updateScrollEdges]);

  if (!paths.length) {
    return (
      <div className="min-w-0 flex-1">
        <FilePreviewTabPill
          active
          label="File preview"
          onClick={() => undefined}
          onClose={() => onClose()}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full min-w-0 flex-1">
      {scrollEdges.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-app-shell via-app-shell/85 to-transparent" />
      )}
      {scrollEdges.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-app-shell via-app-shell/85 to-transparent" />
      )}
      <div
        ref={scrollerRef}
        className="no-scrollbar flex h-full min-w-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden px-1"
        onScroll={updateScrollEdges}
      >
        {paths.map((path) => (
          <FilePreviewTabPill
            key={path}
            active={path === activePath}
            label={basename(path)}
            onClick={() => onSelect(path)}
            onClose={() => onClose(path)}
          />
        ))}
      </div>
    </div>
  );
}

function FilePreviewTabPill({
  active,
  label,
  onClick,
  onClose
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "group/file-tab grid h-8 shrink-0 items-center gap-1 rounded-xl border px-1.5 transition-colors",
        active
          ? "w-[210px] grid-cols-[minmax(0,1fr)_auto] border-app-line-bright bg-app-text/[0.10] text-app-text"
          : "w-[158px] grid-cols-[minmax(0,1fr)_auto] border-transparent bg-transparent text-app-muted/75 hover:border-app-text/[0.08] hover:bg-app-text/[0.06] hover:text-app-text"
      )}
    >
      <button
        type="button"
        className="grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg px-1.5 text-left text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-blue/70"
        role="tab"
        aria-selected={active}
        onClick={onClick}
      >
        <Braces size={14} className="shrink-0 text-app-muted" />
        <span className="truncate">{label}</span>
      </button>
      {onClose && (
        <TooltipButton
          className={cn(
            subtleIconButton,
            "text-app-muted transition-opacity focus-visible:opacity-100",
            active ? "opacity-100" : "opacity-0 group-hover/file-tab:opacity-100"
          )}
          aria-label="Close file preview"
          tooltip="Close file preview"
          onClick={onClose}
        >
          <X size={12} />
        </TooltipButton>
      )}
    </div>
  );
}

function TerminalWorkspace({
  tabs,
  activeTabId,
  cwd
}: {
  tabs: TerminalTab[];
  activeTabId: string;
  cwd?: string | null;
}) {
  return (
    <div className="relative h-full min-h-0 min-w-0 bg-app-shell">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "absolute inset-0 min-h-0 min-w-0",
            tab.id === activeTabId ? "block" : "hidden"
          )}
        >
          <TerminalPanel cwd={cwd} />
        </div>
      ))}
    </div>
  );
}

function TerminalPanel({ cwd }: { cwd?: string | null }) {
  const terminalHostRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = terminalHostRef.current;
    const terminalApi = window.composer;

    if (!host) {
      return;
    }

    if (
      !terminalApi?.createTerminalSession ||
      !terminalApi.writeTerminalSession ||
      !terminalApi.resizeTerminalSession ||
      !terminalApi.disposeTerminalSession ||
      !terminalApi.onTerminalData ||
      !terminalApi.onTerminalExit
    ) {
      setError("Terminal sessions are available in the desktop app.");
      return;
    }

    setError(null);

    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: cssVariable("--app-font-mono", "monospace"),
      fontSize: 13,
      lineHeight: 1.45,
      scrollback: 10_000,
      theme: {
        background: cssVariable("--app-shell", "#091522"),
        black: "#1f2937",
        blue: cssVariable("--app-accent", "#65a7ff"),
        brightBlack: "#6b7280",
        brightBlue: "#93c5fd",
        brightCyan: "#67e8f9",
        brightGreen: "#86efac",
        brightMagenta: "#d8b4fe",
        brightRed: "#fca5a5",
        brightWhite: "#f8fafc",
        brightYellow: "#fde68a",
        cursor: cssVariable("--app-text", "#e7edf5"),
        cyan: "#22d3ee",
        foreground: cssVariable("--app-editor-text", "#e4e4e7"),
        green: cssVariable("--app-success", "#71d697"),
        magenta: "#c084fc",
        red: cssVariable("--app-danger", "#f87171"),
        selectionBackground: cssVariable("--app-selection", "rgba(101, 167, 255, 0.28)"),
        white: cssVariable("--app-text", "#e7edf5"),
        yellow: "#facc15"
      }
    });
    const fitAddon = new FitAddon();
    const bufferedData = new Map<string, string[]>();
    let disposed = false;
    let fitFrame: number | null = null;

    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminal.focus();

    const scheduleFit = () => {
      if (fitFrame !== null) {
        return;
      }

      fitFrame = window.requestAnimationFrame(() => {
        fitFrame = null;

        if (disposed) {
          return;
        }

        try {
          fitAddon.fit();

          const sessionId = sessionIdRef.current;

          if (sessionId) {
            terminalApi.resizeTerminalSession?.({
              sessionId,
              cols: terminal.cols,
              rows: terminal.rows
            });
          }
        } catch {
          // xterm cannot measure while the panel is hidden.
        }
      });
    };

    const inputDisposable = terminal.onData((data) => {
      const sessionId = sessionIdRef.current;

      if (sessionId) {
        terminalApi.writeTerminalSession?.({ sessionId, data });
      }
    });
    const unsubscribeData = terminalApi.onTerminalData((event) => {
      if (event.sessionId === sessionIdRef.current) {
        terminal.write(event.data);
        return;
      }

      if (!sessionIdRef.current) {
        const queue = bufferedData.get(event.sessionId) ?? [];
        queue.push(event.data);
        bufferedData.set(event.sessionId, queue);
      }
    });
    const unsubscribeExit = terminalApi.onTerminalExit((event) => {
      if (event.sessionId !== sessionIdRef.current) {
        return;
      }

      const signal = event.signal ? ` signal ${event.signal}` : "";
      terminal.writeln(`\r\n[process exited with code ${event.exitCode}${signal}]`);
      sessionIdRef.current = null;
    });
    const resizeObserver = new ResizeObserver(scheduleFit);

    resizeObserver.observe(host);
    scheduleFit();

    void terminalApi
      .createTerminalSession({
        cwd,
        cols: terminal.cols,
        rows: terminal.rows
      })
      .then((session) => {
        if (disposed) {
          terminalApi.disposeTerminalSession?.(session.id);
          return;
        }

        sessionIdRef.current = session.id;

        for (const data of bufferedData.get(session.id) ?? []) {
          terminal.write(data);
        }

        bufferedData.clear();
        scheduleFit();
        terminal.focus();
      })
      .catch((caught) => {
        if (!disposed) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });

    return () => {
      disposed = true;

      if (fitFrame !== null) {
        window.cancelAnimationFrame(fitFrame);
      }

      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;

      if (sessionId) {
        terminalApi.disposeTerminalSession?.(sessionId);
      }

      resizeObserver.disconnect();
      unsubscribeData();
      unsubscribeExit();
      inputDisposable.dispose();
      terminal.dispose();
    };
  }, [cwd]);

  return (
    <div className="relative grid h-full min-h-0 bg-app-shell p-3">
      <div
        ref={terminalHostRef}
        className="min-h-0 min-w-0 overflow-hidden [&_.xterm]:h-full [&_.xterm-viewport]:!bg-transparent [&_.xterm-screen]:h-full"
      />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-app-shell px-6 text-center text-[13px] leading-5 text-app-dim">
          {error}
        </div>
      )}
    </div>
  );
}

function BranchComparisonBar({
  comparison,
  branches,
  loading,
  error,
  onChange
}: {
  comparison?: ReviewBranchComparison;
  branches: ReviewBranchRef[];
  loading: boolean;
  error?: string | null;
  onChange?: (comparison: ReviewBranchComparison) => void;
}) {
  const [openSide, setOpenSide] = useState<"head" | "base" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = comparison?.headRef ?? "HEAD";
  const baseRef = comparison?.baseRef ?? "base";
  const branchOptions = buildBranchOptions(branches, [headRef, baseRef]);

  useEffect(() => {
    if (!openSide) {
      return;
    }

    function closeOnOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;

      if (containerRef.current?.contains(target)) {
        return;
      }

      setOpenSide(null);
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenSide(null);
      }
    }

    window.addEventListener("mousedown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openSide]);

  function selectRef(ref: string) {
    if (!openSide) {
      return;
    }

    setOpenSide(null);
    const nextComparison =
      openSide === "head"
        ? { headRef: ref, baseRef }
        : { headRef, baseRef: ref };

    if (
      nextComparison.headRef !== comparison?.headRef ||
      nextComparison.baseRef !== comparison?.baseRef
    ) {
      onChange?.(nextComparison);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-10 min-w-0 items-center gap-2 border-b border-app-line px-5 text-[14px] text-app-dim"
    >
      <BranchRefButton
        label={headRef}
        active={openSide === "head"}
        onClick={() => setOpenSide((side) => side === "head" ? null : "head")}
      />
      <ArrowRight size={14} className="shrink-0" />
      <BranchRefButton
        label={baseRef}
        active={openSide === "base"}
        onClick={() => setOpenSide((side) => side === "base" ? null : "base")}
      />
      {loading && (
        <LoaderCircle size={13} className="ml-auto shrink-0 animate-spin text-app-dim" />
      )}
      {openSide && (
        <BranchRefMenu
          side={openSide}
          selectedRef={openSide === "head" ? headRef : baseRef}
          branches={branchOptions}
          error={error}
          onSelect={selectRef}
        />
      )}
    </div>
  );
}

function BranchRefButton({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-w-0 max-w-[45%] items-center gap-1.5 rounded-md text-app-dim transition hover:text-app-text",
        active && "text-app-text"
      )}
      aria-expanded={active}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      <ChevronDown size={13} className="shrink-0" />
    </button>
  );
}

function BranchRefMenu({
  side,
  selectedRef,
  branches,
  error,
  onSelect
}: {
  side: "head" | "base";
  selectedRef: string;
  branches: ReviewBranchRef[];
  error?: string | null;
  onSelect: (ref: string) => void;
}) {
  return (
    <div
      className={cn(
        "absolute top-9 z-50 grid max-h-[260px] w-[min(300px,calc(var(--review-content-width)-40px))] overflow-hidden rounded-[16px] border border-app-line bg-app-panel-2 p-1.5 text-[13px] shadow-[0_18px_48px_color-mix(in_srgb,var(--color-app-bg)_42%,transparent)]",
        side === "head" ? "left-5" : "left-24"
      )}
      role="menu"
      aria-label={`Select ${side} branch`}
    >
      {error && (
        <div className="px-3 py-2 text-destructive">{error}</div>
      )}
      <div className="thin-scrollbar max-h-[240px] overflow-y-auto">
        {branches.map((branch) => {
          const selected = branch.name === selectedRef;

          return (
            <button
              key={`${branch.kind}:${branch.name}`}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              className={cn(
                "grid min-h-9 w-full grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-2 rounded-xl px-3 text-left text-app-muted transition-colors hover:bg-app-text/[0.08] hover:text-app-text",
                selected && "text-app-text"
              )}
              onClick={() => onSelect(branch.name)}
            >
              <span className="truncate">{branch.name}</span>
              <span className="text-[11px] uppercase tracking-[0.08em] text-app-dim">
                {branch.kind}
              </span>
              {selected ? <Check size={14} /> : <span aria-hidden="true" />}
            </button>
          );
        })}
        {branches.length === 0 && !error && (
          <div className="px-3 py-2 text-app-dim">No branches found.</div>
        )}
      </div>
    </div>
  );
}

function buildBranchOptions(branches: ReviewBranchRef[], refs: string[]) {
  const options = [...branches];
  const seen = new Set(options.map((branch) => branch.name));

  for (const ref of refs) {
    if (ref && !seen.has(ref)) {
      options.unshift({ name: ref, kind: "local" });
      seen.add(ref);
    }
  }

  return options;
}

function ReviewScopeMenu({
  menuRef,
  selectedScope,
  lastTurnAvailable,
  onSelect
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  selectedScope: ReviewDiffScope;
  lastTurnAvailable: boolean;
  onSelect: (scope: ReviewDiffScope) => void;
}) {
  return (
    <div
      ref={menuRef}
      className={cn(
        "absolute left-0 top-9 z-50 grid min-w-[220px] overflow-hidden rounded-[18px] border border-app-line bg-app-panel-2 p-1.5 text-[14px] shadow-[0_18px_48px_color-mix(in_srgb,var(--color-app-bg)_42%,transparent)]"
      )}
      role="menu"
      aria-label="Diff scope"
    >
      {reviewScopeOptions.map((option) => {
        const disabled = option.value === "last-turn" && !lastTurnAvailable;
        const selected = option.value === selectedScope;

        return (
          <button
            key={option.value}
            className={cn(
              "grid min-h-10 grid-cols-[minmax(0,1fr)_20px] items-center gap-3 rounded-xl px-3 text-left text-app-muted transition-colors",
              disabled
                ? "cursor-not-allowed opacity-45"
                : "hover:bg-app-text/[0.08] hover:text-app-text",
              selected && "text-app-text"
            )}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
          >
            <span>{option.label}</span>
            {selected ? <Check size={15} /> : <span aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

function ReviewDiffPreview({
  review,
  reviewScope,
  selectedPath,
  loading,
  error,
  onAddReviewComment,
  onRefresh
}: {
  review?: ReviewDiff | null;
  reviewScope: ReviewDiffScope;
  selectedPath?: string | null;
  loading: boolean;
  error?: string | null;
  onAddReviewComment?: (attachment: Omit<ComposerReviewCommentAttachment, "id">) => void;
  onRefresh?: () => void;
}) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(selectedPath ? [selectedPath] : [])
  );

  useEffect(() => {
    if (!review?.files.length) {
      setExpandedPaths(new Set());
      return;
    }

    const nextExpandedPath =
      selectedPath && review.files.some((file) => file.path === selectedPath)
        ? selectedPath
        : null;

    setExpandedPaths(new Set(nextExpandedPath ? [nextExpandedPath] : []));
  }, [review?.generatedAt, reviewScope, selectedPath]);

  if (loading) {
    return (
      <div className="grid min-h-[520px] place-items-center text-[13px] text-app-dim">
        <div className="inline-flex items-center gap-2">
          <LoaderCircle size={14} className="animate-spin" />
          <span>Loading changes</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 rounded-[14px] border border-destructive/20 bg-destructive/10 p-4 text-[13px] text-destructive">
        {error}
      </div>
    );
  }

  if (!review || review.files.length === 0) {
    const emptyState = emptyReviewStateByScope[reviewScope];

    return (
      <div className="grid min-h-[520px] place-items-center p-6 text-center text-[14px] text-app-dim">
        <div className="grid gap-2">
          <div className="text-[15px] font-medium text-app-text">
            {emptyState.title}
          </div>
          <div>{emptyState.description}</div>
          {onRefresh && (
            <TooltipButton
              className={cn("mx-auto mt-2 h-8 gap-2 px-3 text-app-muted", pillButton)}
              tooltip="Refresh review"
              onClick={onRefresh}
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </TooltipButton>
          )}
        </div>
      </div>
    );
  }

  const files = orderReviewFiles(review.files, selectedPath);

  return (
    <div className="min-h-0 min-w-0 max-w-full overflow-x-hidden bg-app-bg/35">
      {files.map((file) => (
        <DiffFileSection
          key={file.path}
          cwd={review.cwd}
          file={file}
          expanded={expandedPaths.has(file.path)}
          onToggle={() => {
            setExpandedPaths((current) => {
              const next = new Set(current);

              if (next.has(file.path)) {
                next.delete(file.path);
              } else {
                next.add(file.path);
              }

              return next;
            });
          }}
          onAddReviewComment={onAddReviewComment}
        />
      ))}
    </div>
  );
}

const emptyReviewStateByScope: Record<
  ReviewDiffScope,
  { title: string; description: string }
> = {
  "last-turn": {
    title: "No last-turn changes",
    description: "Run or select a turn with file edits."
  },
  unstaged: {
    title: "No unstaged changes",
    description: "Workspace edits will appear here."
  },
  staged: {
    title: "No staged changes",
    description: "Accept edits to stage them."
  },
  commit: {
    title: "No commit changes",
    description: "The latest commit has no patch to show."
  },
  branch: {
    title: "No branch changes",
    description: "This branch matches the selected base."
  }
};

function orderReviewFiles(files: ReviewDiffFile[], selectedPath?: string | null) {
  if (!selectedPath) {
    return files;
  }

  const selectedFile = files.find((file) => file.path === selectedPath);

  if (!selectedFile) {
    return files;
  }

  return [selectedFile, ...files.filter((file) => file.path !== selectedPath)];
}

function DiffFileSection({
  cwd,
  file,
  expanded,
  onToggle,
  onAddReviewComment
}: {
  cwd: string;
  file: ReviewDiffFile;
  expanded: boolean;
  onToggle: () => void;
  onAddReviewComment?: (attachment: Omit<ComposerReviewCommentAttachment, "id">) => void;
}) {
  return (
    <section className="min-w-0 max-w-full border-b border-app-line last:border-b-0">
      <button
        className={cn(
          "grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto_22px] items-center gap-4 px-5 text-left text-[14px] font-medium text-app-text transition-colors hover:bg-app-text/[0.035]",
          expanded && "border-b border-app-line bg-app-text/[0.025]"
        )}
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="truncate">{file.path}</span>
        <span className="whitespace-nowrap text-[14px] font-medium">
          <span className="text-app-green">+{file.additions}</span>{" "}
          <span className="text-destructive">-{file.deletions}</span>
        </span>
        {expanded ? (
          <ChevronUp size={15} className="justify-self-end text-app-dim" />
        ) : (
          <ChevronDown size={15} className="justify-self-end text-app-dim" />
        )}
      </button>
      {expanded && (
        <DiffFileView
          cwd={cwd}
          file={file}
          onAddReviewComment={onAddReviewComment}
        />
      )}
    </section>
  );
}

function FilePreviewLoading() {
  return (
    <div className="grid h-full min-h-0 place-items-center bg-app-editor-bg text-[13px] text-app-dim">
      <div className="inline-flex items-center gap-2">
        <LoaderCircle size={14} className="animate-spin" />
        <span>Opening file</span>
      </div>
    </div>
  );
}

function FilePreviewError({ message }: { message: string }) {
  return (
    <div className="grid h-full min-h-0 place-items-center bg-app-editor-bg p-6 text-center text-[13px] text-destructive">
      <div className="max-w-[320px]">{message}</div>
    </div>
  );
}

function FilePreviewEmpty() {
  return (
    <div className="grid h-full min-h-0 place-items-center bg-app-editor-bg p-6 text-center text-[13px] text-app-dim">
      <div className="text-[15px] font-medium text-app-text">No file selected</div>
    </div>
  );
}

function FilePreviewWorkspace({
  cwd,
  workspaceName,
  files,
  filesLoading,
  filesError,
  previewPath,
  filePreview,
  filePreviewLoading,
  filePreviewError,
  canNavigateBack,
  canNavigateForward,
  onNavigateHistory,
  onOpenFile
}: {
  cwd?: string | null;
  workspaceName: string;
  files: WorkspaceFileEntry[];
  filesLoading: boolean;
  filesError?: string | null;
  previewPath?: string | null;
  filePreview?: FilePreview | null;
  filePreviewLoading?: boolean;
  filePreviewError?: string | null;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateHistory?: (direction: -1 | 1) => void;
  onOpenFile?: (filePath: string) => void;
}) {
  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(150px,34%)_minmax(0,1fr)] overflow-hidden bg-app-editor-bg">
      <WorkspaceFilePane
        cwd={cwd}
        workspaceName={workspaceName}
        files={files}
        loading={filesLoading}
        error={filesError}
        selectedPath={previewPath}
        canNavigateBack={canNavigateBack}
        canNavigateForward={canNavigateForward}
        onNavigateHistory={onNavigateHistory}
        onOpenFile={onOpenFile}
      />
      <div className="relative h-full min-h-0 min-w-0 overflow-hidden border-l border-app-line bg-app-editor-bg">
        {filePreview && !filePreviewError && (
          <FilePreviewEditor file={filePreview} />
        )}
        {filePreviewLoading && !filePreview && <FilePreviewLoading />}
        {filePreviewLoading && filePreview && (
          <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-2 rounded-lg border border-app-line bg-app-panel/95 px-2.5 py-1.5 text-[12px] text-app-muted shadow-lg">
            <LoaderCircle size={12} className="animate-spin" />
            <span>Loading file</span>
          </div>
        )}
        {filePreviewError && !filePreviewLoading && (
          <FilePreviewError message={filePreviewError} />
        )}
        {!filePreview && !filePreviewLoading && !filePreviewError && (
          <FilePreviewEmpty />
        )}
      </div>
    </div>
  );
}

type WorkspaceTreeNode = {
  kind: "directory" | "file";
  name: string;
  path: string;
  absolutePath?: string;
  children: WorkspaceTreeNode[];
};

const WorkspaceFilePane = memo(function WorkspaceFilePane({
  cwd,
  workspaceName,
  files,
  loading,
  error,
  selectedPath,
  canNavigateBack,
  canNavigateForward,
  onNavigateHistory,
  onOpenFile
}: {
  cwd?: string | null;
  workspaceName: string;
  files: WorkspaceFileEntry[];
  loading: boolean;
  error?: string | null;
  selectedPath?: string | null;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateHistory?: (direction: -1 | 1) => void;
  onOpenFile?: (filePath: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tree = useMemo(() => buildWorkspaceTree(files), [files]);
  const filteredTree = useMemo(
    () => filterWorkspaceTree(tree, searchQuery),
    [searchQuery, tree]
  );
  const searchExpandedPaths = useMemo(
    () => collectDirectoryPaths(filteredTree),
    [filteredTree]
  );
  const selectedRelativePath = useMemo(
    () => relativeWorkspacePath(cwd, selectedPath),
    [cwd, selectedPath]
  );
  const selectedParentPaths = useMemo(
    () => parentDirectoryPaths(selectedRelativePath),
    [selectedRelativePath]
  );
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedParentPaths.length === 0) {
      return;
    }

    setExpandedPaths((current) => {
      const next = new Set(current);

      for (const path of selectedParentPaths) {
        next.add(path);
      }

      return next;
    });
  }, [selectedParentPaths]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  function toggleDirectory(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
  }

  const searchActive = searchOpen || searchQuery.length > 0;
  const visibleTree = searchActive ? filteredTree : tree;
  const visibleExpandedPaths = searchActive ? searchExpandedPaths : expandedPaths;

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-app-shell/60">
      <div className="flex h-11 items-center justify-between gap-2 border-b border-app-line px-4 text-[13px] font-medium text-app-muted">
        {searchOpen ? (
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-app-text/[0.06] px-2.5 py-1.5 text-app-muted">
            <Search size={14} className="shrink-0" />
            <input
              ref={searchInputRef}
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-app-text outline-none placeholder:text-app-dim"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeSearch();
                }
              }}
              placeholder="Search files"
            />
            {searchQuery && (
              <button
                type="button"
                className="grid size-4 shrink-0 place-items-center rounded-full text-app-dim transition-colors hover:bg-app-text/[0.10] hover:text-app-text"
                aria-label="Clear file search"
                onClick={() => setSearchQuery("")}
              >
                <X size={11} />
              </button>
            )}
          </label>
        ) : (
          <span className="min-w-0 truncate">{workspaceName}</span>
        )}
        <div className="flex shrink-0 items-center gap-1 text-app-dim">
          <TooltipButton
            className={cn(subtleIconButton, searchActive && "bg-app-text/[0.08] text-app-text")}
            aria-label={searchOpen ? "Close file search" : "Search files"}
            tooltip={searchOpen ? "Close file search" : "Search files"}
            onClick={() => {
              if (searchOpen) {
                closeSearch();
              } else {
                setSearchOpen(true);
              }
            }}
          >
            <Search size={14} />
          </TooltipButton>
          <TooltipButton
            className={subtleIconButton}
            aria-label="Previous file"
            tooltip="Previous file"
            disabled={!canNavigateBack}
            onClick={() => onNavigateHistory?.(-1)}
          >
            <ArrowLeft size={14} />
          </TooltipButton>
          <TooltipButton
            className={subtleIconButton}
            aria-label="Next file"
            tooltip="Next file"
            disabled={!canNavigateForward}
            onClick={() => onNavigateHistory?.(1)}
          >
            <ArrowRight size={14} />
          </TooltipButton>
        </div>
      </div>
      <div className="thin-scrollbar min-h-0 overflow-y-auto py-2">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-2 text-[12px] text-app-dim">
            <LoaderCircle size={13} className="animate-spin" />
            <span>Loading files</span>
          </div>
        )}
        {error && !loading && (
          <div className="px-4 py-2 text-[12px] text-destructive">{error}</div>
        )}
        {!loading && !error && tree.length === 0 && (
          <div className="px-4 py-2 text-[12px] text-app-dim">No files found.</div>
        )}
        {!loading && !error && tree.length > 0 && visibleTree.length === 0 && (
          <div className="px-4 py-2 text-[12px] text-app-dim">
            No files match "{searchQuery}".
          </div>
        )}
        {!error && (
          <WorkspaceTreeRows
            nodes={visibleTree}
            depth={0}
            expandedPaths={visibleExpandedPaths}
            selectedPath={selectedRelativePath}
            onToggleDirectory={toggleDirectory}
            onOpenFile={onOpenFile}
          />
        )}
      </div>
    </div>
  );
});

function WorkspaceTreeRows({
  nodes,
  depth,
  expandedPaths,
  selectedPath,
  onToggleDirectory,
  onOpenFile
}: {
  nodes: WorkspaceTreeNode[];
  depth: number;
  expandedPaths: Set<string>;
  selectedPath?: string | null;
  onToggleDirectory: (path: string) => void;
  onOpenFile?: (filePath: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const selected = node.kind === "file" && node.path === selectedPath;
        const expanded = expandedPaths.has(node.path);
        const indentation = 12 + depth * 14;

        if (node.kind === "directory") {
          return (
            <div key={node.path}>
              <button
                type="button"
                className="flex h-7 w-full min-w-0 items-center gap-2 pr-2 text-left text-[13px] text-app-muted transition-colors hover:bg-app-text/[0.06] hover:text-app-text"
                style={{ paddingLeft: indentation }}
                onClick={() => onToggleDirectory(node.path)}
              >
                <ChevronRight
                  size={13}
                  className={cn(
                    "shrink-0 transition-transform",
                    expanded && "rotate-90"
                  )}
                />
                <Folder size={14} className="shrink-0" />
                <span className="truncate">{node.name}</span>
              </button>
              {expanded && (
                <WorkspaceTreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  selectedPath={selectedPath}
                  onToggleDirectory={onToggleDirectory}
                  onOpenFile={onOpenFile}
                />
              )}
            </div>
          );
        }

        return (
          <button
            key={node.path}
            type="button"
            className={cn(
              "flex h-7 w-full min-w-0 items-center gap-2 pr-2 text-left text-[13px] text-app-muted transition-colors hover:bg-app-text/[0.06] hover:text-app-text",
              selected && "bg-app-text/[0.08] text-app-text"
            )}
            style={{ paddingLeft: indentation + 18 }}
            title={node.path}
            onClick={() => {
              if (node.absolutePath) {
                onOpenFile?.(node.absolutePath);
              }
            }}
          >
            {fileTreeIcon(node.name)}
            <span className="truncate">{node.name}</span>
          </button>
        );
      })}
    </>
  );
}

function FilePreviewEditor({ file }: { file: FilePreview }) {
  return (
    <div
      className={cn(
        "grid h-full min-h-0 overflow-hidden bg-app-editor-bg",
        file.truncated
          ? "grid-rows-[auto_minmax(0,1fr)]"
          : "grid-rows-[minmax(0,1fr)]"
      )}
    >
      {file.truncated && (
        <div className="border-b border-app-line bg-app-orange/10 px-3 py-2 text-[12px] text-app-orange">
          Showing the first {formatBytes(file.content.length)} of{" "}
          {formatBytes(file.size)}.
        </div>
      )}
      <CodeEditor path={file.path} value={file.content} />
    </div>
  );
}

function DiffFileView({
  cwd,
  file,
  onAddReviewComment
}: {
  cwd: string;
  file: ReviewDiffFile;
  onAddReviewComment?: (attachment: Omit<ComposerReviewCommentAttachment, "id">) => void;
}) {
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");

  if (file.isBinary) {
    return (
      <div className="grid min-h-[160px] place-items-center p-6 text-center text-[13px] text-app-dim">
        Binary file changed.
      </div>
    );
  }

  if (file.hunks.length === 0) {
    return (
      <div className="grid min-h-[160px] place-items-center p-6 text-center text-[13px] text-app-dim">
        No text diff available for this file.
      </div>
    );
  }

  let previousOldEnd = 0;
  let previousNewEnd = 0;
  const absoluteFilePath = resolveReviewFilePath(cwd, file.path);

  function renderLine(line: ReviewDiffLine, lineKey: string) {
    const lineNumber = line.newLine ?? line.oldLine;
    const side = line.newLine === null ? "L" : "R";

    return (
      <div key={lineKey}>
        <DiffLineRow
          line={line}
          onAddComment={
            lineNumber && onAddReviewComment
              ? () => {
                  setDraftKey(lineKey);
                  setDraftValue("");
                }
              : undefined
          }
        />
        {draftKey === lineKey && lineNumber && (
          <ReviewCommentForm
            filePath={file.path}
            lineNumber={lineNumber}
            side={side}
            value={draftValue}
            onChange={setDraftValue}
            onCancel={() => {
              setDraftKey(null);
              setDraftValue("");
            }}
            onSubmit={() => {
              const body = draftValue.trim();

              if (!body) {
                return;
              }

              onAddReviewComment?.({
                filePath: file.path,
                lineNumber,
                side,
                body,
                lineContent: line.content,
                lineKind: line.kind
              });
              setDraftKey(null);
              setDraftValue("");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-0 w-full max-w-full overflow-x-hidden font-mono text-[12px] leading-5">
      {file.hunks.map((hunk, hunkIndex) => {
        const hiddenOldStart = previousOldEnd + 1;
        const hiddenNewStart = previousNewEnd + 1;
        const unchangedBefore = Math.max(
          Math.min(
            hunk.oldStart - hiddenOldStart,
            hunk.newStart - hiddenNewStart
          ),
          0
        );
        previousOldEnd = hunk.oldStart + hunk.oldLines - 1;
        previousNewEnd = hunk.newStart + hunk.newLines - 1;

        return (
          <div key={`${hunk.oldStart}-${hunk.newStart}-${hunkIndex}`}>
            {unchangedBefore > 0 && (
              <CollapsedDiffLines
                count={unchangedBefore}
                filePath={absoluteFilePath}
                oldStart={hiddenOldStart}
                newStart={hiddenNewStart}
                renderLine={(line, lineIndex) =>
                  renderLine(
                    line,
                    `hidden-${hunkIndex}-${lineIndex}-${line.oldLine ?? "x"}-${line.newLine ?? "x"}`
                  )
                }
              />
            )}
            {hunk.lines.map((line, lineIndex) => {
              const lineKey = `${hunkIndex}-${lineIndex}-${line.oldLine ?? "x"}-${line.newLine ?? "x"}`;
              return renderLine(line, lineKey);
            })}
          </div>
        );
      })}
    </div>
  );
}

function CollapsedDiffLines({
  count,
  filePath,
  oldStart,
  newStart,
  renderLine
}: {
  count: number;
  filePath: string | null;
  oldStart: number;
  newStart: number;
  renderLine: (line: ReviewDiffLine, index: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<ReviewDiffLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(false);
    setLoading(false);
    setLines(null);
    setError(null);
  }, [count, filePath, oldStart, newStart]);

  async function toggleExpanded() {
    if (loading) {
      return;
    }

    if (expanded) {
      setExpanded(false);
      return;
    }

    if (lines) {
      setExpanded(true);
      return;
    }

    if (!filePath || !window.composer?.readTextFile) {
      setError("Could not load hidden lines.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const file = await window.composer.readTextFile(filePath);
      const fileLines = file.content.split(/\r?\n/);

      if (fileLines.at(-1) === "") {
        fileLines.pop();
      }

      const nextLines = fileLines
        .slice(newStart - 1, newStart - 1 + count)
        .map((content, index): ReviewDiffLine => ({
          kind: "context",
          oldLine: oldStart + index,
          newLine: newStart + index,
          content
        }));

      setLines(nextLines);
      setExpanded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="grid h-8 w-full grid-cols-[4px_64px_minmax(0,1fr)] border-y border-app-line bg-app-line-strong text-left text-app-dim transition hover:bg-app-text/[0.12] hover:text-app-muted"
        type="button"
        aria-expanded={expanded}
        onClick={toggleExpanded}
      >
        <div className="col-span-2 grid place-items-center border-r border-app-bg/70">
          {loading ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronUp size={14} />
          )}
        </div>
        <div className="flex min-w-0 items-center px-5 font-sans text-[12px]">
          {count} unmodified {count === 1 ? "line" : "lines"}
        </div>
      </button>
      {error && (
        <div className="grid min-h-7 w-full grid-cols-[4px_64px_minmax(0,1fr)] bg-destructive/10 text-[12px] text-destructive">
          <div className="bg-destructive" />
          <div />
          <div className="px-5 py-1 font-sans">{error}</div>
        </div>
      )}
      {expanded && lines?.map((line, index) => renderLine(line, index))}
    </>
  );
}

function resolveReviewFilePath(cwd: string, filePath: string) {
  if (filePath.startsWith("/")) {
    return filePath;
  }

  if (!cwd) {
    return null;
  }

  return `${cwd.replace(/\/+$/, "")}/${filePath.replace(/^\/+/, "")}`;
}

function buildWorkspaceTree(files: WorkspaceFileEntry[]) {
  const root: WorkspaceTreeNode = {
    kind: "directory",
    name: "",
    path: "",
    children: []
  };
  const directories = new Map<string, WorkspaceTreeNode>([["", root]]);

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (const part of parts.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let directory = directories.get(currentPath);

      if (!directory) {
        directory = {
          kind: "directory",
          name: part,
          path: currentPath,
          children: []
        };
        directories.set(currentPath, directory);
        current.children.push(directory);
      }

      current = directory;
    }

    const fileName = parts.at(-1);

    if (!fileName) {
      continue;
    }

    current.children.push({
      kind: "file",
      name: fileName,
      path: file.path,
      absolutePath: file.absolutePath,
      children: []
    });
  }

  sortWorkspaceTree(root.children);
  return root.children;
}

function sortWorkspaceTree(nodes: WorkspaceTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });

  for (const node of nodes) {
    sortWorkspaceTree(node.children);
  }
}

function filterWorkspaceTree(
  nodes: WorkspaceTreeNode[],
  query: string
): WorkspaceTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const nodeMatches =
      node.name.toLowerCase().includes(normalizedQuery) ||
      node.path.toLowerCase().includes(normalizedQuery);

    if (node.kind === "file") {
      return nodeMatches ? [node] : [];
    }

    const matchingChildren: WorkspaceTreeNode[] = filterWorkspaceTree(
      node.children,
      normalizedQuery
    );

    if (!nodeMatches && matchingChildren.length === 0) {
      return [];
    }

    return [
      {
        ...node,
        children: nodeMatches ? node.children : matchingChildren
      }
    ];
  });
}

function collectDirectoryPaths(nodes: WorkspaceTreeNode[]): Set<string> {
  const paths = new Set<string>();

  function visit(node: WorkspaceTreeNode) {
    if (node.kind !== "directory") {
      return;
    }

    paths.add(node.path);

    for (const child of node.children) {
      visit(child);
    }
  }

  for (const node of nodes) {
    visit(node);
  }

  return paths;
}

function relativeWorkspacePath(cwd?: string | null, filePath?: string | null) {
  if (!filePath) {
    return null;
  }

  if (!cwd) {
    return filePath;
  }

  const normalizedCwd = normalizeFilePath(cwd).replace(/\/+$/, "");
  const normalizedPath = normalizeFilePath(filePath);

  if (normalizedPath === normalizedCwd) {
    return "";
  }

  if (normalizedPath.startsWith(`${normalizedCwd}/`)) {
    return normalizedPath.slice(normalizedCwd.length + 1);
  }

  return normalizedPath;
}

function parentDirectoryPaths(filePath?: string | null) {
  if (!filePath) {
    return [];
  }

  const parts = filePath.split("/").filter(Boolean);
  const paths: string[] = [];

  for (let index = 0; index < parts.length - 1; index += 1) {
    paths.push(parts.slice(0, index + 1).join("/"));
  }

  return paths;
}

function fileTreeIcon(fileName: string) {
  if (fileName.endsWith(".json")) {
    return <Braces size={13} className="shrink-0 text-app-orange" />;
  }

  return <FileCode2 size={13} className="shrink-0 text-app-dim" />;
}

function basename(filePath: string) {
  return normalizeFilePath(filePath).replace(/\/+$/, "").split("/").pop() || filePath;
}

function cssVariable(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value || fallback;
}

function normalizeFilePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function DiffLineRow({
  line,
  onAddComment
}: {
  line: ReviewDiffLine;
  onAddComment?: () => void;
}) {
  const displayLineNumber = line.newLine ?? line.oldLine ?? "";

  return (
    <div
      className={cn(
        "group/diff-line relative grid min-h-5 w-full grid-cols-[4px_64px_minmax(0,1fr)]",
        line.kind === "add"
          ? "bg-app-green/15"
          : line.kind === "delete"
            ? "bg-destructive/14"
            : "bg-transparent"
          )}
    >
      <span
        className={cn(
          line.kind === "add"
            ? "bg-app-green"
            : line.kind === "delete"
              ? "bg-destructive"
              : "bg-transparent"
        )}
      />
      {onAddComment && (
        <TooltipButton
          className="absolute left-1 top-1/2 z-[1] grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md bg-app-panel text-app-muted opacity-0 shadow-sm ring-1 ring-app-line transition hover:text-app-text group-hover/diff-line:opacity-100"
          aria-label="Add review comment"
          tooltip="Add review comment"
          onClick={onAddComment}
          type="button"
        >
          <Plus size={13} />
        </TooltipButton>
      )}
      <span
        className={cn(
          "select-none pr-3 text-right",
          line.kind === "delete"
            ? "text-destructive"
            : line.kind === "add"
              ? "text-app-green"
              : "text-app-dim"
        )}
      >
        {displayLineNumber}
      </span>
      <code className="min-w-0 whitespace-pre-wrap break-words px-5 text-app-muted [overflow-wrap:anywhere]">{line.content}</code>
    </div>
  );
}

function ReviewCommentForm({
  filePath,
  lineNumber,
  side,
  value,
  onChange,
  onCancel,
  onSubmit
}: {
  filePath: string;
  lineNumber: number;
  side: "L" | "R";
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid w-full grid-cols-[4px_64px_minmax(0,1fr)] bg-app-accent/15 py-2">
      <div className="bg-app-accent" />
      <div className="pr-3 pt-2 text-right text-app-accent">{lineNumber}</div>
      <div className={cn("mr-5 overflow-hidden font-sans", cardSurface)}>
        <div className="flex items-center justify-between border-b border-app-line px-3 py-2 text-[12px] text-app-muted">
          <div className="inline-flex min-w-0 items-center gap-2 font-medium text-app-text">
            <MessageSquare size={14} />
            <span>Local comment</span>
          </div>
          <span className="shrink-0">Comment on line {side}{lineNumber}</span>
        </div>
        <textarea
          className="min-h-[72px] w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-5 text-app-text outline-none placeholder:text-app-dim"
          autoFocus
          placeholder="Request change"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }

            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="flex items-center justify-end gap-2 px-3 pb-3">
          <TooltipButton
            className={cn("h-8 gap-1.5 px-3 text-[12px]", pillButton)}
            tooltip="Cancel comment"
            onClick={onCancel}
            type="button"
          >
            <X size={13} />
            <span>Cancel</span>
          </TooltipButton>
          <TooltipButton
            className={cn("h-8 gap-1.5 px-3 text-[12px]", pillButton, value.trim() && "bg-app-accent text-white hover:bg-app-accent/90")}
            tooltip="Add comment"
            disabled={!value.trim()}
            onClick={onSubmit}
            type="button"
          >
            <Check size={13} />
            <span>Comment</span>
          </TooltipButton>
        </div>
      </div>
    </div>
  );
}
