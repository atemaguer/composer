/**
 * Build a human-readable, single-line message for surfacing an error in a
 * toast, prefixed with the action that failed (e.g. "Failed to switch branch").
 */
export function formatActionError(prefix: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.trim() || "Unknown error";

  return `${prefix}: ${message}`;
}
