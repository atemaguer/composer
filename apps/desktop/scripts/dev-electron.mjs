import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");
const electronBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron"
);
const requiredFiles = [
  path.join(appRoot, "dist-electron/main.js"),
  path.join(appRoot, "dist-server/server/index.js")
];
const watchTargets = [
  path.join(appRoot, "dist-electron"),
  path.join(appRoot, "dist-server"),
  path.join(repoRoot, "packages/composer-runtime/dist"),
  path.join(repoRoot, "packages/composer-client/dist")
];
const viteUrl = new URL("http://127.0.0.1:5173");
const pollMs = 750;
const restartDebounceMs = 500;
const buildSettleMs = 1200;

let electronProcess = null;
let restartTimer = null;
let restarting = false;
let stopping = false;
let lastFingerprint = "";

lastFingerprint = await waitForDevInputs();
startElectron();
setInterval(checkForChanges, pollMs).unref();

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("exit", () => {
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }
});

async function waitForDevInputs() {
  log("waiting for Vite and compiled Electron bundles");

  while (!stopping) {
    const filesReady = requiredFiles.every((filePath) => fs.existsSync(filePath));
    const viteReady = await canReachVite();

    if (filesReady && viteReady) {
      log("waiting for compiled output to settle");
      return await waitForStableBuild();
    }

    await delay(300);
  }
}

function startElectron() {
  if (stopping) {
    return;
  }

  log("starting Electron");
  electronProcess = spawn(electronBin, ["."], {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit"
  });

  electronProcess.once("exit", (code, signal) => {
    electronProcess = null;

    if (stopping || restarting) {
      return;
    }

    log(`Electron exited (${signal ?? code ?? "unknown"})`);
    process.exit(typeof code === "number" ? code : 0);
  });
}

function checkForChanges() {
  if (restarting) {
    return;
  }

  const fingerprint = fingerprintTargets();

  if (!fingerprint || fingerprint === lastFingerprint) {
    return;
  }

  lastFingerprint = fingerprint;
  scheduleRestart();
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    void restartElectron();
  }, restartDebounceMs);
}

async function restartElectron() {
  if (stopping || restarting) {
    return;
  }

  restarting = true;
  log("compiled code changed; restarting Electron");
  lastFingerprint = await waitForStableBuild();

  const child = electronProcess;

  if (child && !child.killed) {
    const exited = waitForExit(child);
    child.kill();
    await exited;
  }

  restarting = false;
  startElectron();
}

function fingerprintTargets() {
  const entries = [];

  for (const target of watchTargets) {
    collectFingerprintEntries(target, entries);
  }

  return entries.sort().join("|");
}

async function waitForStableBuild() {
  let fingerprint = "";
  let stableSince = 0;

  while (!stopping) {
    const nextFingerprint = fingerprintTargets();

    if (nextFingerprint && nextFingerprint === fingerprint) {
      if (Date.now() - stableSince >= buildSettleMs) {
        return nextFingerprint;
      }
    } else {
      fingerprint = nextFingerprint;
      stableSince = Date.now();
    }

    await delay(250);
  }

  return fingerprint;
}

function collectFingerprintEntries(target, entries) {
  if (!fs.existsSync(target)) {
    return;
  }

  let stats;

  try {
    stats = fs.statSync(target);
  } catch {
    return;
  }

  if (stats.isDirectory()) {
    let children;

    try {
      children = fs.readdirSync(target, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of children) {
      collectFingerprintEntries(path.join(target, entry.name), entries);
    }

    return;
  }

  if (!/\.(cjs|js|json|mjs)$/.test(target)) {
    return;
  }

  entries.push(`${target}:${stats.mtimeMs}:${stats.size}`);
}

function canReachVite() {
  return new Promise((resolve) => {
    const request = http.get(viteUrl, (response) => {
      response.resume();
      resolve(true);
    });

    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, 3000).unref();
  });
}

async function stop(code) {
  stopping = true;
  clearTimeout(restartTimer);

  if (electronProcess && !electronProcess.killed) {
    const exited = waitForExit(electronProcess);
    electronProcess.kill();
    await exited;
  }

  process.exit(code);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  console.log(`[dev-electron] ${message}`);
}
