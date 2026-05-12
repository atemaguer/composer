# composer

Monorepo managed with npm workspaces and Turborepo.

## Apps

- `apps/desktop` - Electron + Vite Composer desktop app
- `apps/web` - Next.js landing page for Composer

## Commands

- `npm run dev` - start all app development workflows through Turbo
- `npm run dev:desktop` - start the desktop app development workflow
- `npm run dev:web` - start the Composer landing page
- `npm run build` - build all workspaces through Turbo
- `npm run build:web` - build only the Composer landing page
- `npm run typecheck` - typecheck all workspaces through Turbo
- `npm run preview` - preview the desktop web bundle
