# Composer

**Composer is an orchestration frontend over the real [Codex](https://developers.openai.com/codex) and [Claude Code](https://www.claude.com/product/claude-code) coding agents.** It lets you work with both engines in one continuous project thread — start a task with one agent, hand it off to the other when the work calls for it, or run both in parallel and adopt the better result — while keeping the working directory, branch context, and conversation state attached to the same real workspace.

Composer doesn't reimplement the agents. It drives the actual `codex` and `claude` CLIs you already have installed and authenticated, so the behavior matches launching them directly — just unified, with cross-engine orchestration on top.

> Website: **[getcomposer.dev](https://getcomposer.dev)** · Docs: **[getcomposer.dev/docs](https://getcomposer.dev/docs)**

---

## What it does

- **Handoff** — continue a task in the *other* engine without rebuilding context. Composer compacts the current session into a readable summary and seeds the next provider with it.
- **Compose (compare)** — run the same prompt through Codex *and* Claude in parallel, then **stop and adopt** the thread you prefer to keep working in.
- **Message queue** — type follow-ups while an agent is running; they queue (FIFO) and auto-send as each turn completes. Steer, edit, reorder, or cancel queued messages.
- **Clarifying questions** — when an engine asks a structured question (Claude's `AskUserQuestion` / Codex's `request_user_input`), the choices surface in an inline picker and your selection is sent back to the agent.
- **One shared runtime** — the desktop app and the CLI/TUI drive the *same* local runtime server and `ComposerClient` API, so sessions, handoffs, and review behave identically across surfaces.
- **Workspace-aware** — sessions carry their cwd, git branch, and worktree; review diffs and switch branches in-app.

## Surfaces

Composer is a single monorepo that ships three apps over two shared packages:

| Surface | Path | What it is |
|---|---|---|
| **Desktop app** | `apps/desktop` | Electron + Vite (React) — the primary GUI |
| **CLI + TUI** | `apps/cli` | A slash-command terminal UI (default) plus non-interactive commands (`run`, `session`, `review`, …) |
| **Website** | `apps/web` | Next.js landing page (getcomposer.dev) |
| `@composer/client` | `packages/composer-client` | Shared types, the live-event reducer, and the `ComposerClient` HTTP/WS client |
| `@composer/runtime` | `packages/composer-runtime` | The agent runtime: provider implementations (Codex / Claude / Compose), session loading, and the local HTTP + WebSocket server |

## Requirements

- **Node.js ≥ 20**
- **[Bun](https://bun.sh)** — required for the interactive TUI (it hosts the `@opentui/react` renderer)
- The **`codex`** and **`claude`** CLIs installed and authenticated on your machine. Composer resolves them from your `PATH`; override with `COMPOSER_CODEX_PATH` / `COMPOSER_CLAUDE_PATH` if they live elsewhere.

## Install (CLI)

```sh
curl -fsSL https://getcomposer.dev/install.sh | bash
# or
brew install https://getcomposer.dev/homebrew/composer.rb
```

Then launch the interactive TUI from any project:

```sh
composer                 # interactive TUI in the current directory
composer --cwd <path>    # …or a specific workspace
```

Non-interactive commands (scriptable; add `--json` for JSONL output):

```sh
composer run "fix the failing test"     # one-shot prompt, stream the result
composer session list                   # manage sessions
composer review --scope unstaged        # print a git diff for review
composer serve --port 0                 # run the runtime server headless
```

See [`apps/cli/README.md`](apps/cli/README.md) for the full command + keybinding reference.

The **desktop app** is distributed as a signed download from [getcomposer.dev](https://getcomposer.dev).

## Develop from source

```sh
git clone https://github.com/atemaguer/composer.git
cd composer
npm install
```

```sh
# Desktop app (Electron + Vite, hot-reloaded)
npm run dev:desktop

# Website (Next.js)
npm run dev:web

# CLI / TUI against the local workspace
npm --workspace @composer/cli run build    # build the client/runtime/cli dist
node apps/cli/dist/index.js                 # launch the TUI (needs Bun on PATH)
```

> The desktop app resolves `@composer/client` via a tsconfig path alias to source (no rebuild needed). The **CLI consumes the built `dist`**, so rebuild `@composer/client` / `@composer/runtime` before typechecking, testing, or bundling the CLI.

### Common commands

| Command | Description |
|---|---|
| `npm run dev` | Start every app dev workflow via Turborepo |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | Typecheck all workspaces |
| `npm --workspace composer run test:server` | Build + run the runtime/server test suite |
| `npm --workspace @composer/client run test` | Reducer property tests |
| `npm --workspace @composer/cli run test` | CLI tests |
| `npm run docs:dev` | Preview the docs site (Mintlify) |

### Repository layout

```
apps/
  desktop/   Electron + Vite renderer + the runtime server entry (dist-server)
  cli/       opentui TUI + non-interactive commands
  web/       Next.js landing page
packages/
  composer-client/    types, session reducer, ComposerClient (HTTP/WS)
  composer-runtime/   AgentRuntime, providers, session-loader, server
docs/        Mintlify docs (served at /docs)
packaging/   CLI release/distribution flow
```

## How it works

```
 Desktop app ─┐                          ┌─ spawns ─> codex app-server (JSON-RPC over stdio)
              ├─ HTTP + WebSocket ─> AgentRuntime ─┤
 CLI / TUI ───┘   (@composer/runtime server)      └─ spawns ─> claude (Claude Agent SDK)
```

Both surfaces connect to a **local, loopback-only runtime server** (`@composer/runtime`). The runtime owns session state and orchestration; each provider drives the real engine — Codex via its `app-server` JSON-RPC protocol, Claude via the Agent SDK's `query()`. Live agent events stream back over the WebSocket; clients reduce them into a session timeline with the shared reducer. Handoffs use context compaction; Compose mode runs both providers in parallel and lets you adopt one. The server binds `127.0.0.1` and reuses your existing provider auth — nothing leaves your machine.

## License

See the repository for license details.
