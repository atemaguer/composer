import { useRef } from "react";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HISTORY_DIR = path.join(homedir(), ".composer", "state");
const HISTORY_FILE = path.join(HISTORY_DIR, "prompt-history.jsonl");
const MAX_ENTRIES = 200;

/** Read persisted prompt history (oldest → newest), capped to the last N. */
export function loadPromptHistory(): string[] {
  try {
    const raw = readFileSync(HISTORY_FILE, "utf8");
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          const parsed = JSON.parse(line) as { input?: unknown };
          return typeof parsed.input === "string" ? parsed.input : null;
        } catch {
          return null;
        }
      })
      .filter((value): value is string => Boolean(value));
    return entries.slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Append one submitted prompt to the persistent history file (best effort). */
export function appendPromptHistory(input: string): void {
  const trimmed = input.trim();
  if (!trimmed) {
    return;
  }
  try {
    mkdirSync(HISTORY_DIR, { recursive: true });
    appendFileSync(
      HISTORY_FILE,
      `${JSON.stringify({ input: trimmed, at: Date.now() })}\n`,
      "utf8"
    );
  } catch {
    // History is best-effort; never break the prompt on an I/O failure.
  }
}

export type PromptHistoryApi = {
  /** Record a submitted prompt and reset the navigation cursor to the end. */
  append: (input: string) => void;
  /** Walk one entry older. Returns the entry text, or null at the top. */
  prev: (currentDraft: string) => string | null;
  /** Walk one entry newer. Returns the entry (or the saved draft) / null. */
  next: () => string | null;
  /** Reset the navigation cursor back to the live draft. */
  reset: () => void;
};

/**
 * Bash-style prompt history with an in-memory navigation cursor. The cursor
 * sits "past the end" on the live draft; `prev`/`next` walk through prior
 * submissions and restore the draft when you walk back down to it.
 */
export function usePromptHistory(): PromptHistoryApi {
  const entriesRef = useRef<string[]>(loadPromptHistory());
  const cursorRef = useRef<number>(entriesRef.current.length);
  const draftRef = useRef<string>("");

  const append = (input: string) => {
    const trimmed = input.trim();
    const entries = entriesRef.current;
    if (trimmed && entries[entries.length - 1] !== trimmed) {
      entries.push(trimmed);
      appendPromptHistory(trimmed);
    }
    cursorRef.current = entries.length;
    draftRef.current = "";
  };

  const prev = (currentDraft: string): string | null => {
    const entries = entriesRef.current;
    if (entries.length === 0) {
      return null;
    }
    if (cursorRef.current === entries.length) {
      draftRef.current = currentDraft;
    }
    cursorRef.current = Math.max(0, cursorRef.current - 1);
    return entries[cursorRef.current] ?? null;
  };

  const next = (): string | null => {
    const entries = entriesRef.current;
    if (cursorRef.current >= entries.length) {
      return null;
    }
    cursorRef.current += 1;
    return cursorRef.current === entries.length
      ? draftRef.current
      : entries[cursorRef.current] ?? null;
  };

  const reset = () => {
    cursorRef.current = entriesRef.current.length;
  };

  return { append, prev, next, reset };
}
