import {
  Archive,
  ChevronRight,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { cn } from "../lib/cn";
import { GlassPanel } from "./liquid-glass/GlassPanel";
import {
  appHoverSurfaceSubtle,
  focusRing,
  menuItem,
  subtleIconButton
} from "./style-tokens";

type ConversationTitleMenuProps = {
  title: string;
  className?: string;
  onRename: (title: string) => void;
  onArchive: () => void;
  onCopyTranscript: () => void;
  onCopyTitle: () => void;
  onOpenInNewWindow?: () => void;
};

const rowClass = cn(
  menuItem,
  "grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-1.5 text-[13px] text-app-text"
);

const shortcutClass = "text-[12px] tracking-wide text-app-muted/70";

export function ConversationTitleMenu({
  title,
  className,
  onRename,
  onArchive,
  onCopyTranscript,
  onCopyTitle,
  onOpenInNewWindow
}: ConversationTitleMenuProps) {
  const [open, setOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setCopyOpen(false);
  }, []);

  const beginRename = useCallback(() => {
    closeMenu();
    setDraft(title);
    setEditing(true);
  }, [closeMenu, title]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) {
      onRename(next);
    }
  }, [draft, onRename, title]);

  const cancelRename = useCallback(() => {
    setEditing(false);
    setDraft(title);
  }, [title]);

  // Focus + select the title when rename starts.
  useEffect(() => {
    if (editing) {
      const input = inputRef.current;
      input?.focus();
      input?.select();
    }
  }, [editing]);

  // Dismiss the menu on outside click / Escape, mirroring the composer menus.
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        closeMenu();
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeMenu]);

  // Keyboard shortcuts: ⌥⌘R rename, ⇧⌘A archive — matching the menu hints.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!event.metaKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.altKey && !event.shiftKey && key === "r") {
        event.preventDefault();
        beginRename();
      } else if (event.shiftKey && !event.altKey && key === "a") {
        event.preventDefault();
        closeMenu();
        onArchive();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [beginRename, closeMenu, onArchive]);

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={cn(
          "h-7 max-w-[280px] min-w-[160px] rounded-md border border-app-line bg-app-text/[0.05] px-2 text-[13px] text-app-text outline-none",
          focusRing,
          className
        )}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onInputKeyDown}
        onBlur={commitRename}
        aria-label="Rename chat"
      />
    );
  }

  const canOpenInNewWindow = Boolean(onOpenInNewWindow);

  return (
    <div
      ref={rootRef}
      className={cn("relative flex min-w-0 items-center gap-2", className)}
    >
      <span className="max-w-[220px] truncate">{title}</span>
      <button
        type="button"
        className={cn(subtleIconButton, "h-6 w-6")}
        onClick={() => setOpen((value) => !value)}
        aria-label="Chat options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <GlassPanel
          variant="menu"
          role="menu"
          aria-label="Chat options"
          className="absolute left-0 top-[34px] z-30 grid w-[260px] gap-0.5"
        >
          <button type="button" className={rowClass} role="menuitem" onClick={beginRename}>
            <Pencil size={15} className="text-app-muted" />
            <span className="truncate text-left">Rename chat</span>
            <span className={shortcutClass}>⌥⌘R</span>
          </button>
          <button
            type="button"
            className={rowClass}
            role="menuitem"
            onClick={() => {
              closeMenu();
              onArchive();
            }}
          >
            <Archive size={15} className="text-app-muted" />
            <span className="truncate text-left">Archive chat</span>
            <span className={shortcutClass}>⇧⌘A</span>
          </button>

          <div className="my-1 h-px bg-app-line" />

          <div
            className="relative"
            onMouseEnter={() => setCopyOpen(true)}
            onMouseLeave={() => setCopyOpen(false)}
          >
            <button
              type="button"
              className={cn(rowClass, copyOpen && appHoverSurfaceSubtle)}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={copyOpen}
              onClick={() => setCopyOpen((value) => !value)}
            >
              <Copy size={15} className="text-app-muted" />
              <span className="truncate text-left">Copy</span>
              <ChevronRight size={14} className="text-app-muted" />
            </button>

            {copyOpen && (
              <GlassPanel
                variant="menu"
                role="menu"
                aria-label="Copy"
                className="absolute left-[calc(100%-4px)] top-[-6px] z-40 grid w-[200px] gap-0.5"
              >
                <button
                  type="button"
                  className={rowClass}
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onCopyTranscript();
                  }}
                >
                  <Copy size={15} className="text-app-muted" />
                  <span className="truncate text-left">Copy transcript</span>
                  <span />
                </button>
                <button
                  type="button"
                  className={rowClass}
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onCopyTitle();
                  }}
                >
                  <Pencil size={15} className="text-app-muted" />
                  <span className="truncate text-left">Copy title</span>
                  <span />
                </button>
              </GlassPanel>
            )}
          </div>

          {canOpenInNewWindow && (
            <button
              type="button"
              className={rowClass}
              role="menuitem"
              onClick={() => {
                closeMenu();
                onOpenInNewWindow?.();
              }}
            >
              <ExternalLink size={15} className="text-app-muted" />
              <span className="truncate text-left">Open in new window</span>
              <span />
            </button>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
