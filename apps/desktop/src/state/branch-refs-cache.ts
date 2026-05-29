import type {
  ReviewBranchComparison,
  ReviewBranchList
} from "../types.js";

/**
 * Per-workspace cache of the last successfully loaded review branches. Lets the
 * branch dropdown render instantly from cache and refresh in the background,
 * instead of blocking on git/server I/O every time it opens.
 */
export class BranchRefsCache {
  private readonly entries = new Map<string, ReviewBranchList>();

  get(cwd: string): ReviewBranchList | undefined {
    return this.entries.get(cwd);
  }

  set(cwd: string, data: ReviewBranchList): void {
    this.entries.set(cwd, data);
  }

  has(cwd: string): boolean {
    return this.entries.has(cwd);
  }

  delete(cwd: string): void {
    this.entries.delete(cwd);
  }

  clear(): void {
    this.entries.clear();
  }
}

export function resolveCurrentBranchRef(data: ReviewBranchList): string | null {
  return data.gitAvailable === false ? null : data.currentRef ?? null;
}

/**
 * Preserve the user's explicitly selected branch when it is still a valid local
 * branch in the refreshed list; otherwise fall back to the workspace's current
 * branch.
 */
export function resolveSelectedBranchRef(
  current: string | null,
  data: ReviewBranchList
): string | null {
  if (data.gitAvailable === false) {
    return null;
  }

  if (
    current &&
    data.branches.some(
      (branch) => branch.kind === "local" && branch.name === current
    )
  ) {
    return current;
  }

  return resolveCurrentBranchRef(data);
}

/** Sublabel shown on the current branch, e.g. "Uncommitted: 1 file". */
export function describeUncommitted(
  count: number | undefined
): string | undefined {
  if (!count || count <= 0) {
    return undefined;
  }

  return `Uncommitted: ${count} file${count === 1 ? "" : "s"}`;
}

/**
 * Returns a reason string when a branch switch must be blocked because the
 * current branch has uncommitted changes, or null when the switch is allowed.
 * Re-selecting the current branch is always allowed.
 */
export function blockedBranchSwitchReason(
  targetId: string,
  currentRef: string | null,
  uncommittedCount: number | undefined
): string | null {
  if (!uncommittedCount || uncommittedCount <= 0) {
    return null;
  }

  if (targetId === currentRef) {
    return null;
  }

  const label = `${uncommittedCount} uncommitted file${
    uncommittedCount === 1 ? "" : "s"
  }`;

  return `Commit or stash your ${label} before switching branches.`;
}

export function resolveBranchComparison(
  current: ReviewBranchComparison | null,
  data: ReviewBranchList
): ReviewBranchComparison | null {
  if (current) {
    return current;
  }

  return data.gitAvailable !== false && data.defaultBaseRef
    ? { headRef: data.currentRef, baseRef: data.defaultBaseRef }
    : null;
}
