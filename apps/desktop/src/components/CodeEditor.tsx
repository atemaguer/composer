import { useEffect, useMemo, useRef } from "react";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";

import { cn } from "../lib/cn";

type CodeEditorProps = {
  className?: string;
  path: string;
  value: string;
};

export function CodeEditor({ className, path, value }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const language = useMemo(() => languageForPath(path), [path]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          basicSetup,
          language,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          editorTheme,
          syntaxHighlighting(editorHighlightStyle)
        ]
      })
    });
    viewRef.current = view;

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;

    valueRef.current = value;

    if (!view || view.state.doc.toString() === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value
      }
    });
  }, [value]);

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
    backgroundColor: "var(--app-editor-bg)",
    color: "var(--app-editor-text)"
  },
  ".cm-scroller": {
    fontFamily: "var(--app-font-mono)",
    fontSize: "var(--app-code-font-size)",
    lineHeight: "1.65"
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "var(--app-accent)"
  },
  ".cm-gutters": {
    backgroundColor: "var(--app-editor-bg)",
    borderRight: "1px solid var(--app-line)",
    color: "var(--app-editor-muted)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--app-editor-gutter-active)"
  },
  ".cm-activeLine": {
    backgroundColor: "var(--app-editor-active-line)"
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--app-selection) !important"
  },
  ".cm-line": {
    padding: "0 14px"
  },
  ".cm-tooltip": {
    backgroundColor: "var(--app-editor-tooltip-bg)",
    border: "1px solid var(--app-line-strong)"
  }
});

const editorHighlightStyle = HighlightStyle.define([
  {
    tag: tags.comment,
    color: "var(--app-dim)"
  },
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
    color: "var(--app-accent)"
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: "var(--app-success)"
  },
  {
    tag: [tags.number, tags.bool, tags.null],
    color: "var(--app-warning)"
  },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.function(tags.variableName))],
    color: "var(--app-text)"
  },
  {
    tag: [tags.variableName, tags.propertyName, tags.attributeName],
    color: "var(--app-muted)"
  },
  {
    tag: [tags.typeName, tags.className, tags.tagName],
    color: "var(--app-accent)"
  },
  {
    tag: tags.invalid,
    color: "hsl(var(--destructive))"
  }
]);
