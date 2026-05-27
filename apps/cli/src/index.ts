#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { Readable } from "node:stream";
import {
  ComposerClient,
  isRuntimeProviderId,
  providerDefaultIntelligence,
  providerDefaultModel,
  type BaseLiveAgentEvent,
  type IntelligenceMode,
  type PermissionMode,
  type SessionProvider
} from "@composer/client";

type LiveAgentEvent = BaseLiveAgentEvent;

type ServerProcess = ChildProcessByStdio<null, Readable, Readable>;

type CliOptions = {
  server?: string;
  provider?: SessionProvider;
  model?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  intelligence?: IntelligenceMode;
  json: boolean;
};

type Sidecar = {
  process: ServerProcess;
  url: string;
  port: number;
  stop: () => Promise<void>;
};

const READY_PATTERN = /COMPOSER_AGENT_SERVER_READY\s+(\d+)/;
const CLI_READY_PREFIX = "COMPOSER_CLI_SERVER_READY";

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exitCode = command ? 0 : 1;
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

  throw new Error(`Unknown command: ${command}`);
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
    await sendPrompt(serverUrl, {
      prompt,
      requestId,
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

async function startSidecar(): Promise<Sidecar> {
  const entrypoint = await resolveServerEntrypoint();
  const child = spawnServer(entrypoint, 0, process.cwd());
  let stdoutBuffer = "";
  let stderrBuffer = "";

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stderrBuffer += text;
    process.stderr.write(text);
  });

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stdoutBuffer += text;

    for (const line of text.split(/\r?\n/)) {
      if (line && !READY_PATTERN.test(line)) {
        process.stderr.write(`${line}\n`);
      }
    }
  });

  const port = await waitForReadyPort(child, () => stdoutBuffer, () => stderrBuffer);

  return {
    process: child,
    port,
    url: `http://127.0.0.1:${port}`,
    stop: () => stopProcess(child)
  };
}

function spawnServer(entrypoint: string, port: number, cwd: string) {
  return spawn(process.execPath, [entrypoint], {
    cwd,
    env: {
      ...process.env,
      COMPOSER_AGENT_SERVER_PORT: String(port),
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForReadyPort(
  child: ServerProcess,
  readStdout: () => string,
  readStderr: () => string
) {
  const started = Date.now();

  while (Date.now() - started < 30_000) {
    const match = readStdout().match(READY_PATTERN);
    if (match) {
      return Number(match[1]);
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Composer server exited before it was ready.${formatCapturedError(readStdout(), readStderr())}`
      );
    }

    await delay(25);
  }

  await stopProcess(child);
  throw new Error(`Timed out waiting for Composer server readiness.${formatCapturedError(readStdout(), readStderr())}`);
}

async function sendPrompt(
  serverUrl: string,
  request: {
    prompt: string;
    requestId: string;
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

async function resolveServerEntrypoint() {
  const override = process.env.COMPOSER_SERVER_ENTRYPOINT;
  const entrypoint = override
    ? path.resolve(override)
    : fileURLToPath(new URL("../../desktop/dist-server/server/index.js", import.meta.url));

  try {
    await access(entrypoint);
  } catch {
    throw new Error(
      `Composer server entrypoint not found at ${entrypoint}. Run npm --workspace composer run server:build first.`
    );
  }

  return entrypoint;
}

async function stopProcess(child: ServerProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  const timeout = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }, 2_000);

  try {
    await once(child, "exit");
  } finally {
    clearTimeout(timeout);
  }
}

function formatCapturedError(stdout: string, stderr: string) {
  const captured = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return captured ? `\n${captured}` : "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  process.stdout.write(`Usage:
  composer serve [--port <n>]
  composer run [options] [message...]

Commands:
  serve    Start the Composer server on 127.0.0.1.
  run      Send one prompt, stream the result, and exit.

Run options:
  --server <url>                 Attach to an existing loopback server.
  --provider codex|claude|meta   Select a provider.
  --model <id>                   Select a provider model.
  --cwd <path>                   Run from a working directory.
  --permission-mode <mode>       default, auto-review, or full-access. Defaults to full-access.
  --intelligence <mode>          low, medium, high, or extra-high. Defaults by provider.
  --json                         Emit raw LiveAgentEvent JSONL.
`);
}
