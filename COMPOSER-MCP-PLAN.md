# Composer ↔ Codex / Claude Code via plugins — design plan

**Status:** design / plan (no code yet)
**Scope this pass:** MCP-first bridge (works in both tools), two capabilities — **Handoff** and **Compose (2nd opinion)** — with thin slash-command plugins layered on top.

---

## 1. Goal

Let a user working *inside* the native Codex CLI or Claude Code reach into **Composer's runtime** — to hand the current task to the *other* engine (context preserved) or run both engines in parallel and adopt the better result — without leaving their tool.

Composer already is a local orchestration service; it just doesn't face outward yet. This plan adds the outward face as an **MCP server**, because MCP is the one extension mechanism *both* tools speak natively:

- **Claude Code** plugins bundle MCP servers via a plugin-root `.mcp.json` (`/plugin marketplace add` → `/plugin install`).
- **Codex** consumes MCP servers via `[mcp_servers.<name>]` in `~/.codex/config.toml` (or `codex mcp add`).

So **one Composer MCP server works for both** — we author the orchestration tools once.

(The example we modeled on, `openai/codex-plugin-cc`, is the one-directional version: a Claude Code plugin whose `/codex:*` commands shell out to the local `codex` binary. We invert it into a hub: thin plugins in *both* tools call into Composer, which drives both engines.)

---

## 2. Architecture

```
  Codex CLI  ─┐                          ┌─ spawns ─> codex app-server (provider)
              ├─ MCP (stdio/HTTP) ─> composer mcp ─> AgentRuntime ─┤
  Claude Code ┘   (composer_handoff,        (thin wrapper)         └─ spawns ─> claude agent sdk (provider)
                   composer_compose, …)
```

- The **MCP server** is a thin adapter: it exposes orchestration *tools* and translates each call into existing runtime operations (`/api/chat`, compaction/handoff, parallel-compose, adopt).
- It does **not** re-implement orchestration — it reuses `AgentRuntime` (in-process) or the running `composer serve` HTTP API.
- Native tools remain the user's primary surface; Composer is a callable service.

### Build seams it reuses (already exist)

| Need | Where |
|---|---|
| HTTP/WS API (chat stream, sessions, steer, queue, adopt, compact, interrupt) | `packages/composer-runtime/src/composer-server.ts` (routes ~`146–239`) |
| Headless server + discovery (`COMPOSER_AGENT_SERVER_READY <port>`, loopback) | `packages/composer-runtime/src/server-entry.ts` |
| Spawn/attach a runtime from a CLI process | `apps/cli/src/connection.ts` (`startSidecar`, `resolveServerEntrypoint`) |
| CLI subcommand scaffolding (`serve`, `run --json`) | `apps/cli/src/index.ts` |
| Parallel compose + adopt | `AgentRuntime.createSession({provider:"meta", model:"Compare agents"})`, `adoptParallelThread` |
| Handoff/compaction (cross-engine context) | `AgentRuntime.compactSession`, the handoff/contextPrompt path in `startProviderRun` |
| Capability scan (already reads `~/.claude/plugins`, `~/.codex/plugins`) | `packages/composer-runtime/src/capabilities.ts` |
| Provider env injection (recursion guard hook) | `packages/composer-runtime/src/cli-env.ts` (`desktopCliEnvironment`) |

---

## 3. Component: `composer mcp`

A new subcommand in `apps/cli` (alongside `serve`/`run`). MCP SDK: `@modelcontextprotocol/sdk` (`McpServer` + `StdioServerTransport` / `StreamableHTTPServerTransport`).

```
composer mcp                 # stdio MCP server (default; per native session)
composer mcp --http [--port] # HTTP MCP server (shared; cross-tool continuity)
composer mcp --server <url>  # attach to an existing `composer serve` runtime
```

**Runtime connection (two modes):**
- **Sidecar (default, simplest):** the MCP process spawns its own Composer runtime via `startSidecar()` — mirrors `composer run`. Self-contained, no setup.
- **Shared (recommended for continuity):** attach to a long-lived `composer serve` runtime, so a session a user adopts in Composer's desktop/TUI is the same one the plugin sees. One runtime, shared state.

**Transport:** stdio is enough for both tools and is the simplest install (Codex `command`/`args`; Claude Code `.mcp.json`). HTTP is the upgrade for a shared runtime.

---

## 4. Tools (v1)

Schemas are MCP `tools/call` inputs/outputs. Inputs validated with zod; outputs returned as text content (+ structured JSON block).

### `composer_handoff`
> Continue the current task in the *other* engine, context preserved.

```jsonc
// input
{
  "prompt": "string",                     // what to do next
  "to": "codex" | "claude",               // target engine
  "includeContext": true,                  // default true: adopt the caller's
                                           //   native session (by cwd+recency),
                                           //   compact it, seed the target engine
  "cwd": "string?",                        // defaults to the MCP server's cwd
  "async": false                           // false: block + return result;
                                           // true: return { jobId } (see §6)
}
// output (blocking)
{ "engine": "codex", "summary": "…", "result": "…final assistant message…",
  "sessionId": "composer-…", "filesChanged": ["…"] }
```

Mapping: `includeContext` → locate the most recent session for `cwd` from the registry / transcript scan (`capabilities`/session-loader already read `~/.codex` + `~/.claude`), compact it (`compactSession`), then run `prompt` in `to` seeded with that summary (the existing handoff `contextPrompt` path). Without context → a fresh `POST /api/chat {provider: to, prompt, cwd}`.

### `composer_compose`
> Run the task in **both** engines in parallel; return both + a synthesis.

```jsonc
// input
{ "prompt": "string", "includeContext": true, "cwd": "string?", "async": false }
// output
{
  "codex":  { "result": "…", "sessionId": "…" },
  "claude": { "result": "…", "sessionId": "…" },
  "synthesis": "…short comparison / recommendation…",
  "composeSessionId": "composer-…"          // to adopt one later
}
```

Mapping: `createSession({ provider: "meta", model: "Compare agents", prompt, cwd })` → parallel hybrid session → read both columns → produce a synthesis (a small Composer-side summarization turn, or just return both and let the caller decide). Optionally expose `composer_adopt(composeSessionId, engine)` later.

**Why these two first:** they're the orchestration Composer uniquely offers and are read-mostly (low blast radius). Queue/async/status (the codex-plugin-cc background pattern) and cross-engine review come next, on the same job layer.

---

## 5. The result model: blocking vs async

Handoff/compose can take minutes; MCP `tools/call` is request/response with a client-side timeout (Codex `tool_timeout_sec` default 60s; configurable).

**Decision:** support both, default **blocking**:
- **Blocking** (`async:false`): the tool runs the Composer turn(s) to completion and returns the final result. Emit `notifications/progress` (when the client passes a progressToken) for liveness. The packaged plugin/config sets a generous `tool_timeout_sec` (e.g. 600).
- **Async** (`async:true`): returns `{ jobId }` immediately; pair with `composer_status(jobId)` / `composer_cancel(jobId)`. This is the forward-compatible path for the queue capability and avoids timeout fragility for very long runs.

Internally, **both go through one job registry** (`Map<jobId, { run, status, result, cancel }>`), so blocking is just "await the job," and async/status/cancel reuse the same machinery. This is the seam the future queue/rescue tools plug into.

---

## 6. Recursion guard (the one real risk)

Composer **spawns** Codex/Claude as providers. If the user has the Composer plugin enabled, a Composer-spawned provider could load it and call back into Composer → loop.

**Guards:**
1. Composer already injects env into provider processes via `desktopCliEnvironment` (`cli-env.ts`). Add `COMPOSER_MANAGED=1` and `COMPOSER_DEPTH=<n>`.
2. `composer mcp` on startup: if `COMPOSER_MANAGED` is set, either register **no** orchestration tools, or restrict to the *other* engine and refuse beyond `COMPOSER_DEPTH >= 1`. Each delegation increments depth.
3. Document a hard depth cap. Surface a clear tool error ("already running inside a Composer-managed engine") rather than silently looping.

---

## 7. Plugin packaging (MCP-first, slash commands on top)

### Claude Code plugin — `composer-plugin-cc/`
```
.claude-plugin/plugin.json     # { name: "composer", description, version }
.mcp.json                      # { mcpServers: { composer: { command: "composer", args: ["mcp"] } } }
skills/handoff/SKILL.md        # /composer:handoff — thin wrapper that calls the MCP tool
skills/compose/SKILL.md        # /composer:compose
README.md
```
Install: `/plugin marketplace add atemaguer/composer-plugin-cc` → `/plugin install composer@composer`. The `.mcp.json` auto-starts `composer mcp`; the skills give explicit human-invocable commands (the "slash commands on top").

### Codex — config + (optional) marketplace
```toml
# ~/.codex/config.toml  (or: codex mcp add composer -- composer mcp)
[mcp_servers.composer]
command = "composer"
args = ["mcp"]
startup_timeout_sec = 20
tool_timeout_sec = 600
```
Optionally publish a Codex plugin-marketplace entry (`codex plugin marketplace add atemaguer/composer-plugin-codex`) bundling the same config + prompt commands.

Both reference the **same** `composer mcp` binary → identical tools in both tools.

---

## 8. Security / auth

- Loopback only; the MCP server and runtime run locally as the user. No new secrets — providers reuse the user's existing Codex/Claude auth (same machine), exactly like `codex-plugin-cc`.
- `composer mcp` only binds stdio (or 127.0.0.1 for `--http`). No remote surface.

---

## 9. Phases

1. **MCP skeleton** — `composer mcp` (stdio) over a sidecar runtime; `composer_ping`/`composer_sessions` to prove the bridge end-to-end inside both tools.
2. **Handoff (blocking)** — context-aware via compaction; recursion guard.
3. **Compose (blocking)** — parallel + synthesis; optional `composer_adopt`.
4. **Job layer + async** — `composer_status`/`composer_cancel`; unblocks the queue/rescue family later.
5. **Packaging** — Claude Code plugin + marketplace entry; Codex config/marketplace; docs.
6. **Shared runtime (`--http`)** — cross-tool/desktop session continuity.

Milestones 1–3 are the demoable core; 4–6 productionize.

---

## 10. Open decisions

- **Sidecar vs shared runtime for v1** — sidecar is simplest to ship; shared unlocks "adopt my native session into the desktop app." Lean sidecar first, design for shared.
- **`includeContext` session discovery** — by cwd + most-recent is the heuristic; confirm it's precise enough, or pass an explicit session id from the plugin.
- **Synthesis for compose** — return both raw + a Composer-generated recommendation, or just both and let the caller's model compare? (Leaning: include a short recommendation, cheap.)
- **Distribution** — own marketplace repo(s) vs submit to `claude-community` / Codex marketplace.
