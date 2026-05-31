# composer

Monorepo managed with npm workspaces and Turborepo.

## Apps

- `apps/desktop` - Electron + Vite Composer desktop app
- `apps/web` - Next.js landing page for Composer
- `apps/cli` - Composer CLI + interactive TUI (shares the desktop runtime)

## Install the CLI

```sh
curl -fsSL https://getcomposer.dev/install.sh | bash
# or
brew install https://getcomposer.dev/homebrew/composer.rb
```

Requires Node.js >= 20; the interactive TUI also needs [Bun](https://bun.sh).
See `packaging/README.md` for the release/distribution flow and `apps/cli/README.md`
for usage.

## Commands

- `npm run dev` - start all app development workflows through Turbo
- `npm run dev:desktop` - start the desktop app development workflow
- `npm run dev:web` - start the Composer landing page
- `npm run build` - build all workspaces through Turbo
- `npm run build:web` - build only the Composer landing page
- `npm run typecheck` - typecheck all workspaces through Turbo
- `npm run preview` - preview the desktop web bundle
