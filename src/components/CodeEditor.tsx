import { useEffect, useMemo, useRef } from "react";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";

import { cn } from "../lib/cn";

type CodeEditorProps = {
  className?: string;
  path: string;
  value: string;
};

export function CodeEditor({ className, path, value }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const language = useMemo(() => languageForPath(path), [path]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          oneDark,
          language,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          editorTheme
        ]
      })
    });

    return () => view.destroy();
  }, [language, value]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full min-h-0 overflow-hidden", className)}
    />
  );
}

function languageForPath(filePath: string): Extension {
  const extension = filePath.split(".").pop()?.toLowerCase();

  if (
    extension === "js" ||
    extension === "jsx" ||
    extension === "ts" ||
    extension === "tsx" ||
    extension === "mjs" ||
    extension === "cjs"
  ) {
    return javascript({
      jsx: extension === "jsx" || extension === "tsx",
      typescript: extension === "ts" || extension === "tsx"
    });
  }

  if (extension === "json" || extension === "jsonl") {
    return json();
  }

  if (extension === "css" || extension === "scss" || extension === "less") {
    return css();
  }

  if (extension === "html" || extension === "htm") {
    return html();
  }

  if (extension === "md" || extension === "mdx" || extension === "markdown") {
    return markdown();
  }

  return [];
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "rgb(228 228 231)"
  },
  ".cm-scroller": {
    fontFamily:
      '"SF Mono", "Menlo", "Monaco", "Cascadia Code", "Roboto Mono", monospace',
    fontSize: "12px",
    lineHeight: "1.65"
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "rgb(214 235 255)"
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid rgba(214, 235, 255, 0.08)",
    color: "rgba(164, 174, 190, 0.62)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(214, 235, 255, 0.055)"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(214, 235, 255, 0.04)"
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(96, 165, 250, 0.28) !important"
  },
  ".cm-line": {
    padding: "0 14px"
  },
  ".cm-tooltip": {
    backgroundColor: "rgb(18 31 45)",
    border: "1px solid rgba(214, 235, 255, 0.12)"
  }
});
