export type AppToastTone = "error" | "info";

export type AppToast = {
  id: string;
  message: string;
  tone: AppToastTone;
};

/**
 * Append a toast, de-duplicating identical (message + tone) entries so repeated
 * failures don't stack up, and capping the visible count to the most recent
 * `max` toasts.
 */
export function addToast(
  toasts: AppToast[],
  toast: AppToast,
  max = 4
): AppToast[] {
  const deduped = toasts.filter(
    (existing) =>
      !(existing.message === toast.message && existing.tone === toast.tone)
  );

  return [...deduped, toast].slice(-max);
}

/**
 * Build a human-readable, single-line message for surfacing an error in a
 * toast, prefixed with the action that failed (e.g. "Failed to switch branch").
 */
export function formatActionError(prefix: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.trim() || "Unknown error";

  return `${prefix}: ${message}`;
}
