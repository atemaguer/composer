import { once } from "node:events";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { resolveServerEntrypoint } from "./server-entrypoint.js";

export type ServerProcess = ChildProcessByStdio<null, Readable, Readable>;

export type Sidecar = {
  process: ServerProcess;
  url: string;
  wsUrl: string;
  port: number;
  stop: () => Promise<void>;
};

export const READY_PATTERN = /COMPOSER_AGENT_SERVER_READY\s+(\d+)/;

export const NODE_PATH_OVERRIDE_ENV = "COMPOSER_NODE_PATH";

/**
 * Resolve the Node executable to launch the runtime server with. The server
 * depends on Node-only builtins (e.g. `node:sqlite`), so it must run under
 * Node even when the launching process is Bun (the interactive TUI). When the
 * Node CLI re-execs into the Bun TUI it forwards its own path via
 * `COMPOSER_NODE_PATH`; otherwise (e.g. `bun src/tui/index.tsx` in dev) we fall
 * back to `node` on PATH. Under Node, `process.execPath` is already correct.
 */
export function resolveNodeExecutable(): string {
  const override = process.env[NODE_PATH_OVERRIDE_ENV];
  if (override) {
    return override;
  }
  if (process.versions.bun) {
    return "node";
  }
  return process.execPath;
}

export function spawnServer(entrypoint: string, port: number, cwd: string): ServerProcess {
  return spawn(resolveNodeExecutable(), [entrypoint], {
    cwd,
    env: {
      ...process.env,
      COMPOSER_AGENT_SERVER_PORT: String(port),
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

export async function waitForReadyPort(
  child: ServerProcess,
  readStdout: () => string,
  readStderr: () => string
): Promise<number> {
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
  throw new Error(
    `Timed out waiting for Composer server readiness.${formatCapturedError(readStdout(), readStderr())}`
  );
}

/**
 * Spawn the Node runtime server as a sidecar and resolve once it reports its
 * port. Shared by the non-interactive `run` command and the interactive TUI.
 */
export async function startSidecar(cwd: string = process.cwd()): Promise<Sidecar> {
  const entrypoint = await resolveServerEntrypoint();
  const child = spawnServer(entrypoint, 0, cwd);
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
    wsUrl: `ws://127.0.0.1:${port}`,
    stop: () => stopProcess(child)
  };
}

export async function stopProcess(child: ServerProcess): Promise<void> {
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

export function formatCapturedError(stdout: string, stderr: string): string {
  const captured = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return captured ? `\n${captured}` : "";
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
