#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ComposerClient,
  isRuntimeProviderId,
  providerDefaultIntelligence,
  providerDefaultModel,
  providerLabel,
  providerModelOptions,
  runtimeProviderDefinitions,
  type BaseLiveAgentEvent,
  type IntelligenceMode,
  type PermissionMode,
  type ReviewDiff,
  type ReviewBranchList,
  type ReviewDiffScope,
  type SessionProvider
} from "@composer/client";
import {
  READY_PATTERN,
  spawnServer,
  startSidecar,
  stopProcess,
  type Sidecar
} from "./connection.js";
import { resolveServerEntrypoint } from "./server-entrypoint.js";
import { launchTui } from "./launch-tui.js";

type LiveAgentEvent = BaseLiveAgentEvent;

type CliOptions = {
  server?: string;
  provider?: SessionProvider;
  model?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  intelligence?: IntelligenceMode;
  session?: string;
  continueLast?: boolean;
  json: boolean;
};

const CLI_READY_PREFIX = "COMPOSER_CLI_SERVER_READY";

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main() {
  const [command, ...args] = process.argv.slice(2);

  // A bare invocation — or a leading TUI flag like `composer --cwd .` — launches
  // the interactive TUI in a terminal. Explicit `--help`/`-h` always show usage;
  // `serve`/`run`/`session`/… stay the scripted paths.
  const isHelpFlag = command === "--help" || command === "-h";
  const isVersionFlag = command === "--version" || command === "-v";

  if (isVersionFlag) {
    process.stdout.write(`${readVersion()}\n`);
    process.exitCode = 0;
    return;
  }

  const isLeadingFlag =
    command !== undefined &&
    command.startsWith("-") &&
    !isHelpFlag &&
    !isVersionFlag;

  if (!command || isLeadingFlag) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      process.exitCode = await launchTui(command ? [command, ...args] : args);
      return;
    }
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (isHelpFlag) {
    printHelp();
    process.exitCode = 0;
    return;
  }

  if (command === "tui") {
    process.exitCode = await launchTui(args);
    return;
  }

  if (command === "serve") {
    await serve(args);
    return;
  }

  if (command === "run") {
    await run(args);
    return;
  }

  if (command === "session" || command === "sessions") {
    await sessionCommand(args);
    return;
  }

  if (command === "review") {
    await reviewCommand(args);
    return;
  }

  if (command === "branches") {
    await branchesCommand(args);
    return;
  }

  if (command === "capabilities" || command === "skills") {
    await capabilitiesCommand(args);
    return;
  }

  if (command === "models") {
    modelsCommand(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

// ---------------------------------------------------------------------------
// Non-interactive read commands (data → stdout, diagnostics → stderr)
// ---------------------------------------------------------------------------

type ServerHandle = { url: string; wsUrl: string; stop: () => Promise<void> };

/** Attach to an existing loopback server, or start an ephemeral sidecar. */
async function openServer(server?: string): Promise<ServerHandle> {
  if (server) {
    const url = normalizeServerUrl(server);
    return {
      url,
      wsUrl: url.replace(/^http/u, "ws"),
      stop: async () => undefined
    };
  }

  const sidecar = await startSidecar();
  return { url: sidecar.url, wsUrl: sidecar.wsUrl, stop: sidecar.stop };
}

/** Pull simple `--json`, `--server`, `--cwd`, `--provider`, `--scope` flags. */
function parseReadFlags(args: string[]) {
  const flags: {
    json: boolean;
    server?: string;
    cwd?: string;
    provider?: SessionProvider;
    scope?: ReviewDiffScope;
    rest: string[];
  } = { json: false, rest: [] };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--server") {
      flags.server = args[(index += 1)];
    } else if (arg.startsWith("--server=")) {
      flags.server = arg.slice("--server=".length);
    } else if (arg === "--cwd") {
      flags.cwd = path.resolve(args[(index += 1)] ?? ".");
    } else if (arg.startsWith("--cwd=")) {
      flags.cwd = path.resolve(arg.slice("--cwd=".length));
    } else if (arg === "--provider") {
      flags.provider = parseProvider(requireOptionValue("provider", args[(index += 1)]));
    } else if (arg === "--scope") {
      flags.scope = parseScope(args[(index += 1)]);
    } else if (arg.startsWith("--scope=")) {
      flags.scope = parseScope(arg.slice("--scope=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      flags.rest.push(arg);
    }
  }

  return flags;
}

function parseScope(value: string | undefined): ReviewDiffScope {
  switch (value) {
    case "unstaged":
    case "staged":
    case "commit":
    case "branch":
    case "last-turn":
      return value;
    default:
      throw new Error(`Invalid --scope: ${value}`);
  }
}

async function sessionCommand(args: string[]) {
  const [sub, ...rest] = args;

  if (sub === "list" || sub === undefined) {
    const flags = parseReadFlags(rest);
    const handle = await openServer(flags.server);
    try {
      const snapshot = await fetchSnapshot(handle);
      if (flags.json) {
        process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
        return;
      }
      const threads = snapshot.projects.flatMap((project) =>
        project.threads.map((thread) => ({ project: project.name, thread }))
      );
      if (threads.length === 0) {
        process.stdout.write("No sessions.\n");
        return;
      }
      for (const { project, thread } of threads) {
        const meta = [thread.provider, thread.age].filter(Boolean).join(" · ");
        process.stdout.write(
          `${thread.id}\t${thread.name}${meta ? `\t(${meta})` : ""}\t[${project}]\n`
        );
      }
    } finally {
      await handle.stop();
    }
    return;
  }

  if (sub === "show") {
    const flags = parseReadFlags(rest);
    const sessionId = flags.rest[0];
    if (!sessionId) {
      throw new Error("Usage: composer session show <id> [--json]");
    }
    const handle = await openServer(flags.server);
    try {
      const client = new ComposerClient({ httpUrl: handle.url });
      const session = await client.loadSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
    } finally {
      await handle.stop();
    }
    return;
  }

  if (sub === "archive") {
    const flags = parseReadFlags(rest);
    const sessionId = flags.rest[0];
    if (!sessionId) {
      throw new Error("Usage: composer session archive <id>");
    }
    const handle = await openServer(flags.server);
    try {
      const client = new ComposerClient({ httpUrl: handle.url });
      await client.updateSessionVisibility(sessionId, "archive");
      process.stderr.write(`[session] archived ${sessionId}\n`);
    } finally {
      await handle.stop();
    }
    return;
  }

  throw new Error(`Unknown session subcommand: ${sub}`);
}

async function reviewCommand(args: string[]) {
  const flags = parseReadFlags(args);
  const handle = await openServer(flags.server);
  try {
    const client = new ComposerClient<BaseLiveAgentEvent, unknown, ReviewDiff>({
      httpUrl: handle.url
    });
    const scope = flags.scope === "last-turn" ? "unstaged" : flags.scope;
    const diff = await client.loadReviewDiff({
      cwd: flags.cwd ?? process.cwd(),
      scope: scope ?? "unstaged"
    });
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(diff, null, 2)}\n`);
      return;
    }
    if (diff.gitAvailable === false) {
      process.stderr.write("[review] git is unavailable in this directory\n");
      return;
    }
    process.stdout.write(diff.raw || "No changes.\n");
  } finally {
    await handle.stop();
  }
}

async function branchesCommand(args: string[]) {
  const flags = parseReadFlags(args);
  const handle = await openServer(flags.server);
  try {
    const client = new ComposerClient<
      BaseLiveAgentEvent,
      unknown,
      unknown,
      ReviewBranchList
    >({ httpUrl: handle.url });
    const list = await client.loadReviewBranches(flags.cwd ?? process.cwd());
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
      return;
    }
    for (const branch of list.branches) {
      const marker = branch.name === list.currentRef ? "*" : " ";
      process.stdout.write(`${marker} ${branch.name} (${branch.kind})\n`);
    }
  } finally {
    await handle.stop();
  }
}

async function capabilitiesCommand(args: string[]) {
  const flags = parseReadFlags(args);
  const handle = await openServer(flags.server);
  try {
    const client = new ComposerClient<
      BaseLiveAgentEvent,
      unknown,
      unknown,
      unknown,
      { items: Array<Record<string, unknown>> }
    >({ httpUrl: handle.url });
    const catalog = await client.loadCapabilities();
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
      return;
    }
    for (const item of catalog.items) {
      process.stdout.write(`${item.kind}\t${item.name}\t${item.source}\n`);
    }
  } finally {
    await handle.stop();
  }
}

function modelsCommand(args: string[]) {
  const flags = parseReadFlags(args);
  const providers = flags.provider
    ? [flags.provider]
    : runtimeProviderDefinitions.map((definition) => definition.id);

  if (flags.json) {
    const rows = providers.flatMap((provider) =>
      providerModelOptions(provider).map((model) => ({
        provider,
        value: model.value,
        label: model.label,
        detail: model.detail,
        efforts: model.efforts
      }))
    );
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  for (const provider of providers) {
    process.stdout.write(`${providerLabel(provider)}:\n`);
    for (const model of providerModelOptions(provider)) {
      process.stdout.write(`  ${model.value}\t${model.detail}\n`);
    }
  }
}

/** Open a socket, wait for the metadata snapshot the server pushes on connect. */
function fetchSnapshot(
  handle: ServerHandle
): Promise<{ projects: Array<{ name: string; threads: Array<{ id: string; name: string; provider?: string; age?: string }> }>; sessions: Record<string, unknown> }> {
  const client = new ComposerClient<BaseLiveAgentEvent>({
    httpUrl: handle.url,
    wsUrl: handle.wsUrl
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out waiting for session snapshot."));
    }, 10_000);

    const socket = client.openEventSocket({
      onEvent: (event) => {
        if (event.type === "sessions.snapshot") {
          clearTimeout(timer);
          socket.close();
          resolve(
            (event as unknown as { snapshot: ReturnType<typeof Object> }).snapshot as never
          );
        }
      }
    });

    socket.requestSnapshot();
  });
}

async function serve(args: string[]) {
  const { port } = parseServeArgs(args);
  const entrypoint = await resolveServerEntrypoint();
  const child = spawnServer(entrypoint, port, process.cwd());
  let ready = false;

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    process.stdout.write(text);

    const match = text.match(READY_PATTERN);
    if (match && !ready) {
      ready = true;
      process.stdout.write(`${CLI_READY_PREFIX} http://127.0.0.1:${match[1]}\n`);
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  const stop = async () => {
    await stopProcess(child);
  };

  process.once("SIGINT", () => void stop().finally(() => process.exit(130)));
  process.once("SIGTERM", () => void stop().finally(() => process.exit(143)));

  const [code, signal] = await once(child, "exit") as [number | null, NodeJS.Signals | null];
  if (signal) {
    process.exitCode = signal === "SIGINT" ? 130 : 1;
    return;
  }

  process.exitCode = code ?? 1;
}

async function run(args: string[]) {
  const { options, messageArgs } = parseRunArgs(args);
  const stdin = await readStdin();
  const prompt = composePrompt(messageArgs, stdin);

  if (!prompt.trim()) {
    throw new Error("Missing prompt. Provide a message argument or pipe text on stdin.");
  }

  let sidecar: Sidecar | undefined;
  const requestId = randomUUID();
  const controller = new AbortController();
  let interrupted = false;
  const serverUrl = options.server
    ? normalizeServerUrl(options.server)
    : (sidecar = await startSidecar()).url;

  const interrupt = (signal: NodeJS.Signals) => {
    if (interrupted) {
      return;
    }

    const exitCode = signal === "SIGTERM" ? 143 : 130;
    interrupted = true;
    controller.abort();
    void interruptRequest(serverUrl, requestId).catch(() => undefined);
    void Promise.resolve(sidecar?.stop()).finally(() => process.exit(exitCode));
  };
  const handleSigint = () => interrupt("SIGINT");
  const handleSigterm = () => interrupt("SIGTERM");

  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  try {
    let sessionId = options.session;
    if (!sessionId && options.continueLast) {
      sessionId = await resolveLatestSessionId(serverUrl);
      if (!sessionId) {
        throw new Error("No previous session to continue.");
      }
    }

    await sendPrompt(serverUrl, {
      prompt,
      requestId,
      sessionId,
      provider: options.provider,
      model: options.model,
      cwd: options.cwd,
      permissionMode: options.permissionMode,
      intelligence: options.intelligence,
      json: options.json,
      signal: controller.signal
    });
  } finally {
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
    if (sidecar) {
      await sidecar.stop();
    }
  }
}


async function resolveLatestSessionId(serverUrl: string) {
  const snapshot = await fetchSnapshot({
    url: serverUrl,
    wsUrl: serverUrl.replace(/^http/u, "ws"),
    stop: async () => undefined
  });

  for (const project of snapshot.projects) {
    const thread = project.threads[0];
    if (thread?.id) {
      return thread.id;
    }
  }

  return undefined;
}

async function sendPrompt(
  serverUrl: string,
  request: {
    prompt: string;
    requestId: string;
    sessionId?: string;
    provider?: SessionProvider;
    model?: string;
    cwd?: string;
    permissionMode?: PermissionMode;
    intelligence?: IntelligenceMode;
    json: boolean;
    signal: AbortSignal;
  }
) {
  const client = new ComposerClient<LiveAgentEvent>({ httpUrl: serverUrl });
  const provider = request.provider ?? "codex";
  let sawDelta = false;
  for await (const event of client.chatEvents({
    prompt: request.prompt,
    requestId: request.requestId,
    sessionId: request.sessionId,
    provider,
    model: request.model ?? providerDefaultModel(provider),
    cwd: request.cwd,
    permissionMode: request.permissionMode ?? "Full access",
    intelligence: request.intelligence ?? providerDefaultIntelligence(provider),
    signal: request.signal
  })) {
    if (event.type === "approval.requested") {
      writeStatusSummary(event);
      await interruptRequest(serverUrl, request.requestId).catch(() => undefined);
      throw new Error(
        "Approval requested during non-interactive CLI run. Re-run with --permission-mode full-access or continue in the desktop app."
      );
    }

    if (request.json) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
      continue;
    }

    if (event.type === "message.delta" && typeof event.delta === "string") {
      sawDelta = true;
      process.stdout.write(event.delta);
      continue;
    }

    if (event.type === "message.completed" && !sawDelta && typeof event.body === "string") {
      process.stdout.write(event.body);
      sawDelta = true;
      continue;
    }

    writeStatusSummary(event);
  }

  if (!request.json && sawDelta) {
    process.stdout.write("\n");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function writeStatusSummary(event: LiveAgentEvent) {
  switch (event.type) {
    case "session.started":
      if (isRecord(event.session) && typeof event.session.id === "string") {
        process.stderr.write(`[session] ${event.session.id}\n`);
      }
      return;
    case "turn.started":
      process.stderr.write(`[turn] ${typeof event.label === "string" ? event.label : "started"}\n`);
      return;
    case "tool.started":
      process.stderr.write(`[tool] ${typeof event.label === "string" ? event.label : "started"}\n`);
      return;
    case "tool.completed":
      process.stderr.write(`[tool] completed${typeof event.label === "string" ? `: ${event.label}` : ""}\n`);
      return;
    case "approval.requested":
      if (isRecord(event.approval) && typeof event.approval.title === "string") {
        process.stderr.write(`[approval] ${event.approval.title}\n`);
      }
      return;
    case "turn.completed":
      process.stderr.write(`[turn] completed${typeof event.status === "string" ? `: ${event.status}` : ""}\n`);
      return;
    case "error":
      process.stderr.write(`[error] ${typeof event.message === "string" ? event.message : "Unknown error"}\n`);
      return;
    default:
      return;
  }
}

async function interruptRequest(serverUrl: string, requestId: string) {
  await new ComposerClient({ httpUrl: serverUrl }).interrupt({ requestId });
}

function parseServeArgs(args: string[]) {
  let port = 0;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--port") {
      const value = args[index + 1];
      index += 1;
      port = parsePort(value);
      continue;
    }

    if (arg.startsWith("--port=")) {
      port = parsePort(arg.slice("--port=".length));
      continue;
    }

    throw new Error(`Unknown serve option: ${arg}`);
  }

  return { port };
}

function parseRunArgs(args: string[]) {
  const options: CliOptions = { json: false };
  const messageArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      messageArgs.push(...args.slice(index + 1));
      break;
    }

    if (!arg.startsWith("--")) {
      messageArgs.push(arg);
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--continue") {
      options.continueLast = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    const { name, value, consumedNext } = parseOptionValue(arg, args[index + 1]);
    if (consumedNext) {
      index += 1;
    }

    switch (name) {
      case "server":
        options.server = requireOptionValue(name, value);
        break;
      case "provider":
        options.provider = parseProvider(requireOptionValue(name, value));
        break;
      case "model":
        options.model = requireOptionValue(name, value);
        break;
      case "cwd":
        options.cwd = path.resolve(requireOptionValue(name, value));
        break;
      case "permission-mode":
        options.permissionMode = parsePermissionMode(requireOptionValue(name, value));
        break;
      case "intelligence":
        options.intelligence = parseIntelligence(requireOptionValue(name, value));
        break;
      case "session":
        options.session = requireOptionValue(name, value);
        break;
      default:
        throw new Error(`Unknown run option: --${name}`);
    }
  }

  return { options, messageArgs };
}

function parseOptionValue(arg: string, nextArg: string | undefined) {
  const inlineSeparator = arg.indexOf("=");
  if (inlineSeparator !== -1) {
    return {
      name: arg.slice(2, inlineSeparator),
      value: arg.slice(inlineSeparator + 1),
      consumedNext: false
    };
  }

  return {
    name: arg.slice(2),
    value: nextArg,
    consumedNext: true
  };
}

function requireOptionValue(name: string, value: string | undefined) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for --${name}`);
  }

  return value;
}

function parsePort(value: string | undefined) {
  if (!value) {
    throw new Error("Missing value for --port");
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return port;
}

function parseProvider(value: string): SessionProvider {
  if (isRuntimeProviderId(value)) {
    return value;
  }

  throw new Error(`Invalid provider: ${value}`);
}

function parsePermissionMode(value: string): PermissionMode {
  switch (normalizeMode(value)) {
    case "default":
    case "default-permissions":
      return "Default permissions";
    case "auto-review":
      return "Auto-review";
    case "full":
    case "full-access":
      return "Full access";
    default:
      throw new Error(`Invalid permission mode: ${value}`);
  }
}

function parseIntelligence(value: string): IntelligenceMode {
  switch (normalizeMode(value)) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "extra-high":
    case "extra":
    case "xhigh":
      return "Extra High";
    default:
      throw new Error(`Invalid intelligence mode: ${value}`);
  }
}

function normalizeMode(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

async function readStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function composePrompt(args: string[], stdin: string) {
  const argPrompt = args.join(" ");
  const hasArgs = argPrompt.trim().length > 0;
  const hasStdin = stdin.trim().length > 0;

  if (hasArgs && hasStdin) {
    return `${argPrompt}\n${stdin}`;
  }

  return hasArgs ? argPrompt : stdin;
}

function normalizeServerUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "http:") {
    throw new Error("--server must use an http:// loopback URL");
  }

  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)) {
    throw new Error("--server must target a loopback host");
  }

  return url.toString().replace(/\/$/u, "");
}

function readVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function printHelp() {
  process.stdout.write(`Usage:
  composer                       Launch the interactive TUI (in a terminal).
  composer tui                   Launch the interactive TUI explicitly.
  composer serve [--port <n>]
  composer run [options] [message...]
  composer session <list|show <id>|archive <id>> [--json]
  composer review [--scope <s>] [--cwd <path>] [--json]
  composer branches [--cwd <path>] [--json]
  composer capabilities [--json]
  composer models [--provider <p>] [--json]

Commands:
  serve          Start the Composer server on 127.0.0.1.
  run            Send one prompt, stream the result, and exit.
  session        List, show, or archive sessions.
  review         Print the working-tree diff (scope: unstaged|staged|commit|branch).
  branches       List git branches for the working directory.
  capabilities   List installed skills and plugins.
  models         List provider models (static; no server needed).

Run options:
  --server <url>                 Attach to an existing loopback server.
  --provider codex|claude|meta   Select a provider.
  --model <id>                   Select a provider model.
  --cwd <path>                   Run from a working directory.
  --session <id>                 Continue a specific session.
  --continue                     Continue the most recent session.
  --permission-mode <mode>       default, auto-review, or full-access. Defaults to full-access.
  --intelligence <mode>          low, medium, high, or extra-high. Defaults by provider.
  --json                         Emit raw LiveAgentEvent JSONL.

Shared read options:
  --server <url>                 Attach to an existing loopback server.
  --json                         Emit machine-readable JSON.
`);
}
