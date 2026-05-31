import { useEffect, useState, type ReactNode } from "react";
import { TextAttributes } from "@opentui/core";
import type {
  ComposerCapabilityCatalog,
  DelegateSessionProvider,
  ReviewBranchList
} from "@composer/client";
import { useTui } from "../../store.js";
import type { RuntimeApi } from "../../runtime.js";
import { DialogSelect } from "./DialogSelect.js";

function Panel({
  title,
  tone = "default",
  children
}: {
  title: string;
  tone?: "default" | "error";
  children: ReactNode;
}) {
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={tone === "error" ? "#f7768e" : "#7aa2f7"}
      backgroundColor="#1a1b26"
      title={title}
      style={{ padding: 1, minWidth: 44, maxWidth: 80, flexDirection: "column" }}
    >
      <text fg={tone === "error" ? "#f7768e" : "#c0caf5"}>{children}</text>
      <box style={{ marginTop: 1 }}>
        <text attributes={TextAttributes.DIM}>esc close</text>
      </box>
    </box>
  );
}

/** Branch picker (`/branch`) — checks out the selected branch. */
export function DialogBranch({ runtime }: { runtime: RuntimeApi }) {
  const { dispatch } = useTui();
  const [list, setList] = useState<ReviewBranchList | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void runtime.loadReviewBranches().then((result) => {
      if (!cancelled) {
        setList(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  if (loading) {
    return <Panel title="Branches">Loading branches…</Panel>;
  }
  if (!list || list.gitAvailable === false) {
    return (
      <Panel title="Branches" tone="error">
        No git repository or git is unavailable.
      </Panel>
    );
  }

  return (
    <DialogSelect<string>
      title={`Branches · on ${list.currentRef}`}
      options={list.branches.map((branch) => ({
        name: `${branch.name === list.currentRef ? "● " : "  "}${branch.name}`,
        description: branch.kind,
        value: branch.name
      }))}
      onSelect={(option) => {
        if (option.value !== list.currentRef) {
          void runtime.checkoutBranch(option.value);
          dispatch({ type: "setNotice", notice: `Checked out ${option.value}` });
        }
        dispatch({ type: "popDialog" });
      }}
    />
  );
}

/** Skills/plugins browser (`/skills`). */
export function DialogCapabilities({ runtime }: { runtime: RuntimeApi }) {
  const { dispatch } = useTui();
  const [catalog, setCatalog] = useState<ComposerCapabilityCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void runtime.loadCapabilities().then((result) => {
      if (!cancelled) {
        setCatalog(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  if (loading) {
    return <Panel title="Skills & plugins">Loading capabilities…</Panel>;
  }
  if (!catalog || catalog.items.length === 0) {
    return <Panel title="Skills & plugins">No skills or plugins found.</Panel>;
  }

  return (
    <DialogSelect<string>
      title="Skills & plugins"
      options={catalog.items.map((item) => ({
        name: `${item.kind === "skill" ? "✦" : "▪"} ${item.name}`,
        description: `${item.source}${item.enabled ? "" : " · disabled"} · ${item.description}`,
        value: item.id
      }))}
      onSelect={(option) => {
        const item = catalog.items.find((entry) => entry.id === option.value);
        dispatch({
          type: "setNotice",
          notice: item ? `${item.kind}: ${item.name}` : null
        });
        dispatch({ type: "popDialog" });
      }}
    />
  );
}

/** Confirm archiving the active session (`/archive`). */
export function DialogArchive({ runtime }: { runtime: RuntimeApi }) {
  const { state, dispatch } = useTui();
  const sessionId = state.selectedThread;

  if (!sessionId) {
    return <Panel title="Archive session">No active session to archive.</Panel>;
  }

  return (
    <DialogSelect<"yes" | "no">
      title="Archive this session?"
      footer="enter confirm · esc cancel"
      options={[
        { name: "Archive session", value: "yes" },
        { name: "Cancel", value: "no" }
      ]}
      onSelect={(option) => {
        if (option.value === "yes") {
          runtime.archiveSession(sessionId);
          dispatch({ type: "newSession" });
          dispatch({ type: "setNotice", notice: "Session archived" });
        } else {
          dispatch({ type: "popDialog" });
        }
      }}
    />
  );
}

/** In Compose/meta mode, pick a provider's parallel thread to continue (`/adopt`). */
export function DialogAdopt({ runtime }: { runtime: RuntimeApi }) {
  const { state, dispatch } = useTui();
  const sessionId = state.selectedThread;

  if (!sessionId) {
    return <Panel title="Adopt parallel thread">No active session.</Panel>;
  }

  return (
    <DialogSelect<DelegateSessionProvider>
      title="Adopt parallel thread"
      options={[
        { name: "Continue with Codex", description: "Adopt Codex's thread", value: "codex" },
        { name: "Continue with Claude", description: "Adopt Claude's thread", value: "claude" }
      ]}
      onSelect={(option) => {
        runtime.adoptParallel(sessionId, option.value);
        dispatch({ type: "setProvider", provider: option.value });
        dispatch({
          type: "setNotice",
          notice: `Continuing with ${option.value === "codex" ? "Codex" : "Claude"}`
        });
        dispatch({ type: "popDialog" });
      }}
    />
  );
}
