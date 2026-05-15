import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadLocalSessions,
  updateLocalSessionVisibility
} from "./session-loader.js";
import { configureAutoUpdates } from "./auto-updater.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_FILE_PREVIEW_BYTES = 1_000_000;
let agentServerProcess: ChildProcess | null = null;
let agentServerPort: number | null = null;
let agentServerReady: Promise<number> | null = null;

ipcMain.handle("composer:list-local-sessions", () => loadLocalSessions());
ipcMain.handle("composer:update-session-visibility", (_event, request: unknown) => {
  const value = isRecord(request) ? request : {};
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : "";
  const action = value.action === "archive" ? value.action : null;

  if (!sessionId || !action) {
    throw new Error("Expected sessionId and action");
  }

  const snapshot = loadLocalSessions();
  const session = snapshot.sessions[sessionId];

  if (!session) {
    throw new Error(`Unknown session ${sessionId}`);
  }

  updateLocalSessionVisibility(session, action);
  return loadLocalSessions();
});
ipcMain.handle("composer:get-agent-server", async () => {
  const port = await ensureAgentServer();
  const cwd = workspaceCwd();

  return {
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    cwd,
    workspaceName: path.basename(cwd)
  };
});
ipcMain.handle("composer:get-window-frame-state", (event) =>
  windowFrameState(BrowserWindow.fromWebContents(event.sender))
);
ipcMain.handle("composer:set-native-appearance", (_event, request: unknown) => {
  const value = isRecord(request) ? request : {};
  const themeSource =
    value.themeSource === "light" ||
    value.themeSource === "dark" ||
    value.themeSource === "system"
      ? value.themeSource
      : "system";
  const backgroundColor =
    typeof value.backgroundColor === "string" && /^#[0-9a-fA-F]{6}$/.test(value.backgroundColor)
      ? value.backgroundColor
      : "#091522";

  nativeTheme.themeSource = themeSource;

  for (const browserWindow of BrowserWindow.getAllWindows()) {
    browserWindow.setBackgroundColor(backgroundColor);
  }
});
ipcMain.handle("composer:create-project", (_event, request: unknown) =>
  createProject(request)
);
ipcMain.handle("composer:read-text-file", (_event, requestedPath: unknown) => {
  if (typeof requestedPath !== "string" || !path.isAbsolute(requestedPath)) {
    throw new Error("Expected an absolute file path");
  }

  const stats = fs.statSync(requestedPath);

  if (!stats.isFile()) {
    throw new Error("Path is not a file");
  }

  const file = fs.openSync(requestedPath, "r");
  const byteLength = Math.min(stats.size, MAX_FILE_PREVIEW_BYTES);

  try {
    const buffer = Buffer.alloc(byteLength);
    fs.readSync(file, buffer, 0, byteLength, 0);

    return {
      path: requestedPath,
      content: buffer.toString("utf8"),
      size: stats.size,
      truncated: stats.size > MAX_FILE_PREVIEW_BYTES,
      mtimeMs: stats.mtimeMs
    };
  } finally {
    fs.closeSync(file);
  }
});

async function createWindow() {
  nativeTheme.themeSource = "system";

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: "Composer",
    backgroundColor: "#091522",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 17 },
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const showWindow = () => {
    if (!window.isVisible()) {
      window.show();
    }
  };

  window.once("ready-to-show", showWindow);
  window.webContents.once("did-finish-load", showWindow);
  bindWindowFrameStateEvents(window);

  if (!app.isPackaged && await canReachDevServer()) {
    await window.loadURL("http://127.0.0.1:5173");
    return;
  }

  await window.loadFile(path.join(__dirname, "../dist/index.html"));
}

function bindWindowFrameStateEvents(window: BrowserWindow) {
  const sendState = () => {
    if (window.isDestroyed()) {
      return;
    }

    window.webContents.send(
      "composer:window-frame-state",
      windowFrameState(window)
    );
  };

  window.on("maximize", sendState);
  window.on("unmaximize", sendState);
  window.on("enter-full-screen", sendState);
  window.on("leave-full-screen", sendState);
  window.on("restore", sendState);
  window.on("show", sendState);
  window.webContents.on("did-finish-load", sendState);
}

function windowFrameState(window: BrowserWindow | null) {
  const fullScreen = window?.isFullScreen() ?? false;
  const maximized = window?.isMaximized() ?? false;

  return {
    fullScreen,
    maximized,
    titlebarControlsVisible: process.platform === "darwin" && !fullScreen && !maximized
  };
}

app.whenReady().then(() => {
  void ensureAgentServer();
  void createWindow();
  configureAutoUpdates({
    beforeInstall: () => stopAgentServer({ wait: true, timeoutMs: 3000 })
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  void stopAgentServer();
});

function ensureAgentServer() {
  if (agentServerReady) {
    return agentServerReady;
  }

  agentServerReady = new Promise((resolve, reject) => {
    const serverEntry = path.join(__dirname, "../dist-server/server/index.js");
    const child = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        COMPOSER_AGENT_SERVER_PORT: "0",
        ELECTRON_RUN_AS_NODE: "1"
      },
      cwd: workspaceCwd(),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    agentServerProcess = child;

    child.stdout?.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf8");
      const match = output.match(/COMPOSER_AGENT_SERVER_READY\s+(\d+)/);

      if (match) {
        agentServerPort = Number(match[1]);
        resolve(agentServerPort);
      }

      process.stdout.write(output);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      const hadPort = agentServerPort !== null;

      if (agentServerProcess === child) {
        agentServerProcess = null;
        agentServerPort = null;
        agentServerReady = null;
      }

      if (!hadPort) {
        reject(new Error(`Composer agent server exited before startup (${code})`));
      }
    });
  });

  return agentServerReady;
}

function workspaceCwd() {
  const candidate = process.env.COMPOSER_WORKSPACE_CWD;

  if (candidate && path.isAbsolute(candidate)) {
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Fall back to the app cwd if the environment override is stale.
    }
  }

  return process.cwd();
}

function createProject(request: unknown) {
  const value = isRecord(request) ? request : {};
  const baseCwd =
    typeof value.baseCwd === "string" ? existingDirectory(value.baseCwd) : null;
  const parent = path.dirname(baseCwd ?? workspaceCwd());
  const projectName = sanitizedProjectName(
    typeof value.name === "string" ? value.name : ""
  );
  const cwd = uniqueProjectPath(parent, projectName);

  fs.mkdirSync(cwd);

  return {
    cwd,
    workspaceName: path.basename(cwd)
  };
}

function existingDirectory(value: string) {
  if (!path.isAbsolute(value)) {
    return null;
  }

  try {
    return fs.statSync(value).isDirectory() ? value : null;
  } catch {
    return null;
  }
}

function sanitizedProjectName(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return "New project";
  }

  return sanitized;
}

function uniqueProjectPath(parent: string, baseName: string) {
  for (let index = 0; index < 1_000; index += 1) {
    const name = index === 0 ? baseName : `${baseName} ${index + 1}`;
    const candidate = path.join(parent, name);

    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not allocate a project folder for ${baseName}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stopAgentServer(options: { wait?: boolean; timeoutMs?: number } = {}) {
  const child = agentServerProcess;

  agentServerProcess = null;
  agentServerPort = null;
  agentServerReady = null;

  if (!child?.pid) {
    return Promise.resolve();
  }

  const waitForExit = options.wait
    ? new Promise<void>((resolve) => {
        let resolved = false;
        const finish = () => {
          if (resolved) {
            return;
          }

          resolved = true;
          resolve();
        };
        let timeout: NodeJS.Timeout | null = setTimeout(() => {
          timeout = null;
          try {
            process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }

          setTimeout(finish, 250).unref();
        }, options.timeoutMs ?? 3000);

        timeout.unref();

        child.once("exit", () => {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }

          finish();
        });
      })
    : Promise.resolve();

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return waitForExit;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  return waitForExit;
}

function canReachDevServer() {
  return new Promise<boolean>((resolve) => {
    const request = http.get("http://127.0.0.1:5173", (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });

    request.setTimeout(350, () => {
      request.destroy();
      resolve(false);
    });
    request.once("error", () => resolve(false));
  });
}
