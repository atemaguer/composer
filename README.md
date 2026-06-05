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

## Architecture

Composer is a **thin, multi-surface client over a single local runtime**. The runtime is the brain; the desktop app and the CLI/TUI are interchangeable views of it. Everything runs on your machine and reuses the auth you already have for Codex and Claude.

```
  ┌──────────────┐     ┌──────────────┐
  │ Desktop app  │     │  CLI / TUI   │        surfaces (apps/)
  │ Electron+Vite│     │   opentui    │        thin clients over @composer/client
  └──────┬───────┘     └──────┬───────┘
         │  HTTP (chat stream, REST) + WebSocket (live events)
         └───────────┬────────┘
                     ▼
        ┌────────────────────────────┐
        │       AgentRuntime         │        @composer/runtime
        │  sessions · turns · queue  │        local server, binds 127.0.0.1
        │  handoff/compaction · adopt│
        └───┬──────────┬──────────┬──┘
            │          │          │
            ▼          ▼          ▼
        ┌───────┐  ┌───────┐  ┌─────────┐      providers
        │ Codex │  │Claude │  │ Compose │      (one per engine + a meta one)
        └───┬───┘  └───┬───┘  └────┬────┘
            │          │           │ runs both in parallel
   spawns   ▼          ▼           ▼
   `codex app-server`  `claude`  (Codex + Claude)
   JSON-RPC/stdio      Agent SDK  → adopt one thread
```

### The runtime (`@composer/runtime`)

`AgentRuntime` owns all session state and orchestration. It exposes a small local HTTP + WebSocket server (`composer-server.ts`) bound to `127.0.0.1`:

- **HTTP** — `/api/chat` (start/continue a turn, streamed), plus REST endpoints for sessions, steer, queue, adopt-parallel, compact, interrupt, review diffs, and the capability catalog.
- **WebSocket** — broadcasts the live `LiveAgentEvent` stream to every connected client and accepts commands (approvals, question answers, interrupts).

The server is **discovered, not configured**: it's spawned as a child process that prints `COMPOSER_AGENT_SERVER_READY <port>` on stdout; clients attach to that loopback port. The desktop app spawns it from Electron; the CLI spawns a sidecar (or `composer serve` runs it headless).

### Providers

Each provider drives the *real* engine — Composer never reimplements them:

- **Codex** — spawns `codex app-server` and speaks newline-delimited **JSON-RPC over stdio** (`thread/start`, `turn/start`, `turn/steer`, `turn/interrupt`, approval + `request_user_input` server-requests).
- **Claude** — uses the **Claude Agent SDK** `query()` (streaming messages, `canUseTool` for permissions + `AskUserQuestion`, a PostCompact hook for summaries).
- **Compose (meta)** — not a real engine; it runs Codex and Claude **in parallel** on the same prompt, remaps their events into a hybrid two-column timeline, and lets you **adopt** one thread to continue. The same provider also backs plan→execute handoffs.

The engines run with your existing auth and the workspace cwd/branch; Composer injects env so a Composer-spawned engine knows it's managed.

### Event model & reducer

A turn streams a sequence of `LiveAgentEvent`s — `turn.started`, `message.delta`, `tool.started/delta/completed`, `approval.requested`, `question.requested`, `turn.completed`, etc. A **single shared reducer** in `@composer/client` (`applyLiveSessionEvent`) folds those events into a `SessionContent` timeline. Both surfaces use the exact same reducer, so the desktop and CLI render identical session state from the same stream. Runtime-side state (status, queue, pending question) is derived the same way.

### Sessions & persistence

Sessions are reconstructed from the engines' **own on-disk transcripts** (`~/.codex`, `~/.claude`) plus a small Composer session registry that records cross-engine metadata (handoff/parallel lineage, adopted provider, worktrees). The `session-loader` parses each engine's transcript format into the shared `ConversationItem` model, so a session started in the native CLI can be loaded — and adopted — by Composer. (The live message queue and a few in-flight bits are in-memory only.)

### Surfaces (`apps/`)

- **Desktop** — Electron shell + a Vite/React renderer. State lives in Zustand stores; the conversation is virtualized (react-virtuoso) with memoized, structurally-shared rows so only the streaming tail re-renders. Routing is hash-based (TanStack Router).
- **CLI / TUI** — a slash-command-first terminal UI built on `@opentui/react` (run via Bun), plus non-interactive subcommands. It connects to the runtime exactly like the desktop app via `ComposerClient`.

### Key flows

- **Turn** — client `POST /api/chat` → runtime starts a provider run → events stream over WS → reducer builds the timeline → `turn.completed`.
- **Handoff** — the runtime compacts the current provider's context into a readable summary, then seeds the target provider's first turn with it.
- **Compose → adopt** — the meta provider runs both engines; stopping (or completion) surfaces an adopt picker; adopting collapses the session to that engine's thread and continues.
- **Queue** — messages sent mid-turn are parked in a per-session FIFO and drained one per `turn.completed`; "steer" interrupts to run the next now.
- **Clarifying question** — a provider's question pauses the turn (`question.requested`); the user's selection is sent back over WS and injected as the tool's answer.

### Local & private

The runtime binds loopback only, there's no remote surface, and the engines run as you with your existing credentials — nothing leaves your machine.

## License

See the repository for license details.
