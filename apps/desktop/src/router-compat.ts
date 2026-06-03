import { useCallback } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

import type { ParsedHistoryState } from "@tanstack/history";

// Thin react-router-compatible adapters backed by TanStack Router. Composer
// drives routing imperatively (it parses location.pathname itself and calls
// navigate(); there is no <Routes> tree), so the migration preserves that shape
// rather than adopting route loaders/params. These hooks keep App.tsx's call
// sites unchanged while the underlying router is TanStack. Importing only from
// @tanstack/* here keeps this module free of the App ↔ router import cycle.

export { useRouter } from "@tanstack/react-router";

export type AppLocation = {
  pathname: string;
  /** Per-entry key — changes on every navigation, including push-to-same-path. */
  key: string;
};

/** react-router-compatible useLocation. */
export function useLocation(): AppLocation {
  return useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      key: locationKey(state.location.state)
    })
  });
}

function locationKey(state: ParsedHistoryState): string {
  return `${state.__TSR_key ?? state.key ?? "default"}:${state.__TSR_index}`;
}

/**
 * react-router-compatible useNavigate covering the subset this app uses: an
 * absolute path (push, or replace via options) and a numeric delta (-1/1) for
 * back/forward. Backed by TanStack's history so routing stays imperative.
 */
export function useNavigate() {
  const router = useRouter();

  return useCallback(
    (to: string | number, options?: { replace?: boolean }) => {
      if (typeof to === "number") {
        router.history.go(to);
        return;
      }

      if (options?.replace) {
        router.history.replace(to);
        return;
      }

      router.history.push(to);
    },
    [router]
  );
}
