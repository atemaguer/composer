export type StateUpdater<T> = T | ((current: T) => T);

export function resolveState<T>(updater: StateUpdater<T>, current: T): T {
  return typeof updater === "function"
    ? (updater as (current: T) => T)(current)
    : updater;
}
