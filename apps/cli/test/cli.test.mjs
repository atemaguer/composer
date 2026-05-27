import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const fakeServerPath = fileURLToPath(new URL("./fixtures/fake-server.mjs", import.meta.url));

test("serve starts a loopback server and exposes the ready URL", async () => {
  const child = spawnCli(["serve", "--port", "0"], {
    env: { COMPOSER_SERVER_ENTRYPOINT: fakeServerPath }
  });

  try {
    const { url } = await waitForCliReady(child);
    const response = await fetch(`${url}/health`);

    assert.equal(response.ok, true);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await stopProcess(child);
  }
});

test("run --json streams raw LiveAgentEvent JSONL and forwards options", async () => {
  const server = await startFakeServer();

  try {
    const cwd = process.cwd();
    const result = await runCli([
      "run",
      "--server",
      server.url,
      "--json",
      "--provider",
      "claude",
      "--model",
      "claude-sonnet-4-6",
      "--cwd",
      cwd,
      "--permission-mode",
      "auto-review",
      "--intelligence",
      "extra-high",
      "hello"
    ]);

    assert.equal(result.code, 0);
    const events = result.stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    assert.equal(events.some((event) => event.type === "message.delta" && event.delta === "hello"), true);
    assert.equal(events[0].session.provider, "claude");
    assert.equal(events[0].session.cwd, cwd);
    assert.equal(events[0].session.settings.model, "claude-sonnet-4-6");
    assert.equal(events[0].session.settings.permissionMode, "Auto-review");
    assert.equal(events[0].session.settings.intelligence, "Extra High");
  } finally {
    await stopProcess(server.child);
  }
});

test("run concatenates message args and stdin in default output mode", async () => {
  const server = await startFakeServer();

  try {
    const result = await runCli(["run", "--server", server.url, "hello"], {
      input: "from stdin\n"
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "hello\nfrom stdin\n\n");
    assert.match(result.stderr, /\[tool\] fake tool/u);
    assert.match(result.stderr, /\[turn\] completed: idle/u);
  } finally {
    await stopProcess(server.child);
  }
});

test("run stops its spawned sidecar after success", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "composer-cli-"));
  const marker = path.join(directory, "stopped");

  try {
    const result = await runCli(["run", "sidecar"], {
      env: {
        COMPOSER_SERVER_ENTRYPOINT: fakeServerPath,
        FAKE_SERVER_EXIT_MARKER: marker
      }
    });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "sidecar\n");
    assert.equal(existsSync(marker), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("run --server attach mode leaves the remote server running", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "composer-cli-"));
  const marker = path.join(directory, "stopped");
  const server = await startFakeServer({ marker });

  try {
    const result = await runCli(["run", "--server", server.url, "attached"]);

    assert.equal(result.code, 0);
    assert.equal(result.stdout, "attached\n");
    assert.equal(existsSync(marker), false);

    const response = await fetch(`${server.url}/health`);
    assert.equal(response.ok, true);
  } finally {
    await stopProcess(server.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test("run fails fast when a non-interactive approval is requested", async () => {
  const server = await startFakeServer();

  try {
    const result = await runCli(["run", "--server", server.url, "approval"]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /\[approval\] Fake approval/u);
    assert.match(result.stderr, /Approval requested during non-interactive CLI run/u);
  } finally {
    await stopProcess(server.child);
  }
});

test("run fails on an empty prompt", async () => {
  const result = await runCli(["run"], { input: "" });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Missing prompt/u);
});

function spawnCli(args, options = {}) {
  return spawn(process.execPath, [cliPath, ...args], {
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"]
  });
}

async function runCli(args, options = {}) {
  const child = spawnCli(args, options);
  const output = collectOutput(child);
  child.stdin.end(options.input ?? "");

  const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
  const [code, signal] = await once(child, "exit");
  clearTimeout(timeout);

  return {
    code,
    signal,
    stdout: output.stdout(),
    stderr: output.stderr()
  };
}

async function startFakeServer(options = {}) {
  const child = spawn(process.execPath, [fakeServerPath], {
    env: {
      ...process.env,
      COMPOSER_AGENT_SERVER_PORT: "0",
      ...(options.marker ? { FAKE_SERVER_EXIT_MARKER: options.marker } : {})
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const { port } = await waitForServerReady(child);

  return {
    child,
    port,
    url: `http://127.0.0.1:${port}`
  };
}

function collectOutput(child) {
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return {
    stdout: () => stdout,
    stderr: () => stderr
  };
}

async function waitForCliReady(child) {
  const output = collectOutput(child);
  const started = Date.now();

  while (Date.now() - started < 5_000) {
    const match = output.stdout().match(/COMPOSER_CLI_SERVER_READY\s+(http:\/\/127\.0\.0\.1:(\d+))/u);

    if (match) {
      return { url: match[1], port: Number(match[2]) };
    }

    if (child.exitCode !== null) {
      throw new Error(`CLI exited before ready\n${output.stdout()}\n${output.stderr()}`);
    }

    await delay(25);
  }

  throw new Error(`Timed out waiting for CLI ready\n${output.stdout()}\n${output.stderr()}`);
}

async function waitForServerReady(child) {
  const output = collectOutput(child);
  const started = Date.now();

  while (Date.now() - started < 5_000) {
    const match = output.stdout().match(/COMPOSER_AGENT_SERVER_READY\s+(\d+)/u);

    if (match) {
      return { port: Number(match[1]) };
    }

    if (child.exitCode !== null) {
      throw new Error(`Server exited before ready\n${output.stdout()}\n${output.stderr()}`);
    }

    await delay(25);
  }

  throw new Error(`Timed out waiting for server ready\n${output.stdout()}\n${output.stderr()}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);

  try {
    await once(child, "exit");
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
