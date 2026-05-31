# Composer CLI

## Install

```sh
curl -fsSL https://getcomposer.dev/install.sh | bash
# or
brew install https://getcomposer.dev/homebrew/composer.rb
```

Requires Node.js >= 20; the interactive TUI also needs [Bun](https://bun.sh).

---

The Composer CLI is the terminal interface on top of the shared Composer
runtime server and `ComposerClient` API — the same runtime the desktop app
drives. It has two faces:

- An **interactive TUI** (the default) — a slash-command-first terminal UI.
- A set of **non-interactive commands** for scripting (`run`, `session`,
  `review`, …).

Composer is an orchestration frontend over the real **Codex** and **Claude
Code** engines: your input is routed to the selected provider, and the
slash-command menu is provider-aware so the experience mirrors launching that
provider's CLI directly.

## Interactive TUI

```sh
composer            # launch the TUI in a terminal
composer tui        # launch it explicitly
composer --cwd <path>
```

The TUI requires [Bun](https://bun.sh) (it hosts the `@opentui/react` renderer).

### Navigation

Navigation is **slash commands, arrow keys, and Esc** — no chord soup.

| Key | Action |
|---|---|
| `/` | Open the slash-command autocomplete (provider-aware) |
| `↑` / `↓` | Move the autocomplete selection, or recall prompt history |
| `Tab` / `Enter` | Accept the highlighted command |
| `Enter` | Submit the message (or run a typed `/command`) |
| `Ctrl+J` / `Shift+Enter` | Insert a newline (multiline prompts) |
| `Esc` | Close the popup → clear the draft → interrupt a running turn |
| `Esc Esc` | Recall the previous prompt (when the draft is empty) |
| `Shift+Tab` | Cycle the permission mode |
| `Ctrl+C` | Interrupt while busy, otherwise quit |

While a dialog/picker is open it owns the arrows + Enter; Esc closes it.

### Slash commands

The menu adapts to the active provider. Core commands:

- `/new`, `/clear` — start a fresh conversation
- `/sessions` (`/resume`) — open the session list
- `/provider` — switch Codex / Claude / Compose
- `/model`, `/effort`, `/permissions` — provider settings
- `/diff` — working-tree diff viewer
- `/branch` — list and check out a git branch
- `/skills` — browse installed skills and plugins
- `/compact` — summarize the conversation to free context
- `/review`, `/init` — passthrough to the active provider
- `/archive`, `/stop`, `/status`, `/help`, `/quit`
- `/adopt` — Compose mode only: continue with one parallel provider

## Non-interactive commands

```sh
composer serve [--port <n>]
composer run [options] [message...]
composer session <list|show <id>|archive <id>> [--json]
composer review [--scope <s>] [--cwd <path>] [--json]
composer branches [--cwd <path>] [--json]
composer capabilities [--json]
composer models [--provider <p>] [--json]
```

### serve

`composer serve` starts the Composer server on `127.0.0.1`.

- `--port <n>` selects the listen port (`--port 0`, the default, asks the OS).
- Prints `COMPOSER_AGENT_SERVER_READY <port>` and a CLI URL banner
  `COMPOSER_CLI_SERVER_READY http://127.0.0.1:<port>`.

The server is loopback-only with no authentication.

### run

`composer run` sends one prompt, streams the response, and exits. By default it
starts a sidecar server on a free loopback port and stops it when done.

```sh
--server <url>                 Attach to an existing loopback server.
--provider codex|claude|meta   Select a provider.
--model <id>                   Select a provider model.
--cwd <path>                   Run from a working directory.
--session <id>                 Continue a specific session.
--continue                     Continue the most recent session.
--permission-mode <mode>       default, auto-review, or full-access.
--intelligence <mode>          low, medium, high, or extra-high.
--json                         Emit raw LiveAgentEvent JSONL.
```

Prompt input: message args are joined with spaces; piped stdin is appended.
Empty prompts fail before contacting the server.

### Read commands

`session`, `review`, `branches`, `capabilities`, and `models` start (or attach
to, via `--server`) a server, query it, and print results. Pass `--json` for
machine-readable output; human output goes to stdout and diagnostics to stderr.
`models` is fully static and needs no server.

## Output

- Default mode: assistant text → stdout; session/turn/tool/approval/error
  summaries → stderr.
- `--json`: one `LiveAgentEvent` (or one JSON document for read commands) per
  line on stdout.

Approval requests are not interactive in `run`: the CLI prints a summary,
interrupts the request, and exits with guidance to use the TUI or
`--permission-mode full-access`.

## Server entrypoint

The packaged CLI expects a bundled server entrypoint at
`dist-server/server/index.js` inside `@composer/cli`. Tests and local runs can
override it with `COMPOSER_SERVER_ENTRYPOINT=/path/to/server.js`.
