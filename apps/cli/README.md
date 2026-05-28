# Composer CLI MVP

The Composer CLI is the first non-desktop interface on top of the shared
Composer server and `ComposerClient` API. It is intentionally non-interactive in
this pass: it can start a loopback server and run a single prompt, but it does
not provide a TUI or approval flow.

## Commands

```sh
composer serve [--port <n>]
composer run [options] [message...]
```

## Serve

`composer serve` starts the Composer server on `127.0.0.1`.

- `--port <n>` selects the listen port.
- `--port 0` asks the OS for a free port and is the default.
- The command prints the existing server readiness banner:
  `COMPOSER_AGENT_SERVER_READY <port>`.
- The command also prints a CLI-friendly URL banner:
  `COMPOSER_CLI_SERVER_READY http://127.0.0.1:<port>`.

The v1 server is loopback-only and has no authentication. Non-loopback serving
and auth are out of scope for this MVP.

## Run

`composer run` sends one prompt, streams the response, and exits.

By default, `run` starts a sidecar Composer server on a free loopback port,
waits for readiness, sends the prompt, then stops the sidecar on success, error,
or interrupt.

Use `--server http://127.0.0.1:<port>` to attach to an existing server. Attach
mode never stops the remote server.

Prompt input rules:

- Message arguments are joined with spaces.
- If stdin is piped, stdin is used as prompt input.
- If both message arguments and stdin are present, Composer concatenates the
  arguments, a newline, then stdin.
- Empty prompts fail before contacting the server.

Run options:

```sh
--server <url>                 Attach to an existing loopback server.
--provider codex|claude|meta   Select a provider.
--model <id>                   Select a provider model.
--cwd <path>                   Run from a working directory.
--permission-mode <mode>       default, auto-review, or full-access.
--intelligence <mode>          low, medium, high, or extra-high.
--json                         Emit raw LiveAgentEvent JSONL.
```

Defaults:

- Provider defaults to `codex`.
- Model and intelligence defaults come from the shared provider registry.
- Permission mode defaults to `full-access` for non-interactive runs.

## Output

Default mode:

- Assistant text is written to stdout.
- Session, turn, tool, approval, and error summaries are written to stderr.

JSON mode:

- `--json` writes each `LiveAgentEvent` as one JSON object per stdout line.
- Stderr remains reserved for process/server diagnostics.

Approval requests are not interactive in this MVP. If the runtime requests
approval, the CLI prints a status summary, interrupts the request, and exits with
an error explaining that the user should rerun with `--permission-mode
full-access` or continue in the desktop app.

## Server Entrypoint

The packaged CLI expects a bundled server entrypoint at
`dist-server/server/index.js` inside the `@composer/cli` package. This keeps the
CLI from resolving desktop build output at runtime. Local tests can override the
entrypoint with `COMPOSER_SERVER_ENTRYPOINT=/path/to/server.js`.

## Non-Goals

- No interactive TUI.
- No interactive approval handling.
- No OpenCode provider implementation.
- No remote serving or authentication.
