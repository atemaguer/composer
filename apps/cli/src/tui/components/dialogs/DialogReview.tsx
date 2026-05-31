import { useEffect, useState, type ReactNode } from "react";
import { TextAttributes } from "@opentui/core";
import type { ReviewDiff, ReviewDiffFile } from "@composer/client";
import type { RuntimeApi } from "../../runtime.js";

const MAX_LINES = 400;

function statusGlyph(status: ReviewDiffFile["status"]): string {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "binary":
      return "B";
    default:
      return "M";
  }
}

/**
 * Read-only working-tree diff viewer (`/diff`). Loads the unstaged diff via
 * `RuntimeApi.loadReviewDiff` on mount and renders a scrollable, syntax-tinted
 * unified diff with a per-file summary header.
 */
export function DialogReview({ runtime }: { runtime: RuntimeApi }) {
  const [diff, setDiff] = useState<ReviewDiff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void runtime.loadReviewDiff("unstaged").then((result) => {
      if (!cancelled) {
        setDiff(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title="Working tree diff"
      style={{
        padding: 1,
        minWidth: 70,
        maxWidth: 110,
        maxHeight: 30,
        flexDirection: "column"
      }}
    >
      {loading ? (
        <text attributes={TextAttributes.DIM}>Loading diff…</text>
      ) : !diff || diff.gitAvailable === false ? (
        <text fg="#f7768e">No git repository or git is unavailable.</text>
      ) : diff.files.length === 0 ? (
        <text attributes={TextAttributes.DIM}>No uncommitted changes.</text>
      ) : (
        <DiffBody diff={diff} />
      )}
      <box style={{ marginTop: 1 }}>
        <text attributes={TextAttributes.DIM}>
          ↑↓ scroll · esc close
        </text>
      </box>
    </box>
  );
}

function DiffBody({ diff }: { diff: ReviewDiff }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <box style={{ marginBottom: 1, flexDirection: "row" }}>
        <text fg="#9ece6a">{`+${diff.additions}`}</text>
        <text fg="#f7768e">{`  -${diff.deletions}`}</text>
        <text attributes={TextAttributes.DIM}>
          {`  ${diff.files.length} file${diff.files.length === 1 ? "" : "s"}`}
        </text>
      </box>
      <scrollbox
        focused
        style={{ maxHeight: 24, stickyScroll: false, flexDirection: "column" }}
      >
        {renderDiffLines(diff)}
      </scrollbox>
    </box>
  );
}

function renderDiffLines(diff: ReviewDiff) {
  const rows: ReactNode[] = [];
  let emitted = 0;

  for (const file of diff.files) {
    rows.push(
      <text key={`file-${file.path}`} fg="#7dcfff" attributes={TextAttributes.BOLD}>
        {`${statusGlyph(file.status)} ${file.path} (+${file.additions} −${file.deletions})`}
      </text>
    );

    for (const hunk of file.hunks) {
      if (emitted >= MAX_LINES) {
        rows.push(
          <text key={`trunc-${file.path}`} attributes={TextAttributes.DIM}>
            … diff truncated ({MAX_LINES}+ lines)
          </text>
        );
        return rows;
      }
      rows.push(
        <text key={`hunk-${file.path}-${hunk.header}`} fg="#bb9af7">
          {hunk.header}
        </text>
      );
      for (const line of hunk.lines) {
        if (emitted >= MAX_LINES) {
          break;
        }
        const prefix =
          line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " ";
        const color =
          line.kind === "add"
            ? "#9ece6a"
            : line.kind === "delete"
              ? "#f7768e"
              : "#9aa5ce";
        rows.push(
          <text
            key={`l-${file.path}-${hunk.newStart}-${emitted}`}
            fg={color}
          >
            {`${prefix}${line.content}`}
          </text>
        );
        emitted += 1;
      }
    }
  }

  return rows;
}
