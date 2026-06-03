import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";

import App from "./App";

// Code-based routing (no file-based plugin/codegen). Composer selects views
// from location.pathname itself (appRouteFromPathname), so a single catch-all
// splat route under the root renders <App /> for every path — "/", "/new",
// "/sessions/:id", "/settings", and so on. The default root component is an
// <Outlet />, which renders this child.
const rootRoute = createRootRoute();

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: App
});

const routeTree = rootRoute.addChildren([appRoute]);

export const router = createRouter({
  routeTree,
  // Hash history matches the previous HashRouter (Electron file:// + in-app
  // hash navigation).
  history: createHashHistory(),
  // Return stable references from useRouterState selectors so navigation does
  // not hand subscribers fresh objects when nothing changed.
  defaultStructuralSharing: true,
  // No route loaders to warm.
  defaultPreload: false
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
