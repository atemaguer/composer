import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type WebContents
} from "electron";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";

import {
  loadLocalSessionContent,
  loadLocalSessionList,
  loadLocalSessions,
  updateLocalSessionVisibility
} from "./session-loader.js";
import { configureAutoUpdates } from "./auto-updater.js";
import { desktopCliEnvironment } from "./cli-env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_FILE_PREVIEW_BYTES = 1_000_000;
const MAX_WORKSPACE_FILE_ENTRIES = 5_000;
const IGNORED_WORKSPACE_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out"
]);
const TELEMETRY_IDENTITY_FILE = "telemetry-identity.json";
let agentServerProcess: ChildProcess | null = null;
let agentServerPort: number | null = null;
let agentServerReady: Promise<number> | null = null;
const terminalSessions = new Map<string, TerminalSession>();

type TerminalSession = {
  id: string;
  cwd: string;
  ptyProcess: pty.IPty;
  webContents: WebContents;
  dataDisposable: pty.IDisposable;
  exitDisposable: pty.IDisposable;
  destroyedListener: () => void;
};

ipcMain.handle("composer:get-telemetry-identity", () => telemetryIdentity());
ipcMain.handle("composer:list-local-sessions", () => loadLocalSessionList());
ipcMain.handle("composer:load-local-session", async (_event, requestedSessionId: unknown) => {
  if (typeof requestedSessionId !== "string" || !requestedSessionId) {
    throw new Error("Expected a session id");
  }

  return (await loadLocalSessionContent(requestedSessionId)) ?? null;
});
ipcMain.handle("composer:open-external-url", (_event, requestedUrl: unknown) => {
  if (typeof requestedUrl !== "string") {
    throw new Error("Expected a URL");
  }

  const url = new URL(requestedUrl);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https URLs can be opened externally");
  }

  return shell.openExternal(url.toString());
});
ipcMain.handle("composer:update-session-visibility", async (_event, request: unknown) => {
  const value = isRecord(request) ? request : {};
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : "";
  const action = value.action === "archive" ? value.action : null;

  if (!sessionId || !action) {
    throw new Error("Expected sessionId and action");
  }

  const snapshot = await loadLocalSessions();
  const session = snapshot.sessions[sessionId];

  if (!session) {
    throw new Error(`Unknown session ${sessionId}`);
  }

  await updateLocalSessionVisibility(session, action);
  return await loadLocalSessionList();
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
ipcMain.handle("composer:select-project-folder", async () =>
  selectProjectFolder()
);
ipcMain.handle("composer:list-workspace-files", (_event, requestedCwd: unknown) => {
  if (typeof requestedCwd !== "string") {
    throw new Error("Expected a workspace path");
  }

  const cwd = existingDirectory(requestedCwd);

  if (!cwd) {
    throw new Error("Workspace path is not a directory");
  }

  return listWorkspaceFiles(cwd);
});
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
ipcMain.handle("composer:terminal-create", (event, request: unknown) =>
  createTerminalSession(event.sender, request)
);
ipcMain.on("composer:terminal-write", (event, request: unknown) => {
  const session = terminalSessionForSender(event.sender, request);
  const data = isRecord(request) && typeof request.data === "string"
    ? request.data
    : "";

  if (session && data) {
    session.ptyProcess.write(data);
  }
});
ipcMain.on("composer:terminal-resize", (event, request: unknown) => {
  const session = terminalSessionForSender(event.sender, request);

  if (!session || !isRecord(request)) {
    return;
  }

  const cols = integerInRange(request.cols, 2, 500);
  const rows = integerInRange(request.rows, 2, 500);

  if (cols && rows) {
    session.ptyProcess.resize(cols, rows);
  }
});
ipcMain.on("composer:terminal-dispose", (event, request: unknown) => {
  const session = terminalSessionForSender(event.sender, request);

  if (session) {
    disposeTerminalSession(session.id);
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

function telemetryIdentity() {
  const filePath = path.join(app.getPath("userData"), TELEMETRY_IDENTITY_FILE);
  const existing = readTelemetryIdentity(filePath);

  if (existing) {
    return existing;
  }

  const created = {
    installationId: randomUUID(),
    appVersion: app.getVersion(),
    platform: process.platform
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(created, null, 2), "utf8");

  return created;
}

function readTelemetryIdentity(filePath: string) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;

    if (!isRecord(value) || typeof value.installationId !== "string") {
      return null;
    }

    return {
      installationId: value.installationId,
      appVersion:
        typeof value.appVersion === "string" ? value.appVersion : app.getVersion(),
      platform: typeof value.platform === "string" ? value.platform : process.platform
    };
  } catch {
    return null;
  }
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
  disposeTerminalSessions();
  void stopAgentServer();
});

function createTerminalSession(sender: WebContents, request: unknown) {
  const value = isRecord(request) ? request : {};
  const cwd = typeof value.cwd === "string"
    ? existingDirectory(value.cwd) ?? workspaceCwd()
    : workspaceCwd();
  const cols = integerInRange(value.cols, 2, 500) ?? 80;
  const rows = integerInRange(value.rows, 2, 500) ?? 24;
  const shell = defaultShell();
  const id = randomUUID();
  const env = terminalEnvironment(shell);
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env
  });

  const dataDisposable = ptyProcess.onData((data) => {
    if (!sender.isDestroyed()) {
      sender.send("composer:terminal-data", { sessionId: id, data });
    }
  });
  const exitDisposable = ptyProcess.onExit(({ exitCode, signal }) => {
    terminalSessions.delete(id);
    dataDisposable.dispose();
    exitDisposable.dispose();

    if (!sender.isDestroyed()) {
      sender.send("composer:terminal-exit", { sessionId: id, exitCode, signal });
    }
  });
  const destroyedListener = () => disposeTerminalSession(id);
  const session: TerminalSession = {
    id,
    cwd,
    ptyProcess,
    webContents: sender,
    dataDisposable,
    exitDisposable,
    destroyedListener
  };

  terminalSessions.set(id, session);
  sender.once("destroyed", destroyedListener);

  return {
    id,
    cwd,
    pid: ptyProcess.pid,
    shell: path.basename(shell)
  };
}

function terminalSessionForSender(sender: WebContents, request: unknown) {
  const sessionId = isRecord(request) && typeof request.sessionId === "string"
    ? request.sessionId
    : "";
  const session = terminalSessions.get(sessionId);

  if (!session || session.webContents.id !== sender.id) {
    return null;
  }

  return session;
}

function disposeTerminalSession(sessionId: string) {
  const session = terminalSessions.get(sessionId);

  if (!session) {
    return;
  }

  terminalSessions.delete(sessionId);
  session.webContents.removeListener("destroyed", session.destroyedListener);
  session.dataDisposable.dispose();
  session.exitDisposable.dispose();

  try {
    session.ptyProcess.kill();
  } catch {
    // The process may already be gone.
  }
}

function disposeTerminalSessions() {
  for (const sessionId of terminalSessions.keys()) {
    disposeTerminalSession(sessionId);
  }
}

function defaultShell() {
  const configured = process.env.SHELL;

  if (configured && path.isAbsolute(configured)) {
    return configured;
  }

  if (process.platform === "win32") {
    return process.env.ComSpec ?? "powershell.exe";
  }

  return fs.existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/sh";
}

function terminalEnvironment(shell: string) {
  const env = desktopCliEnvironment({
    ...process.env,
    COLORTERM: "truecolor",
    SHELL: shell,
    TERM: "xterm-256color"
  });
  const entries = Object.entries(env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );

  return Object.fromEntries(entries);
}

function integerInRange(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(number) || number < min || number > max) {
    return null;
  }

  return number;
}

function ensureAgentServer() {
  if (agentServerReady) {
    return agentServerReady;
  }

  agentServerReady = new Promise((resolve, reject) => {
    const serverEntry = path.join(__dirname, "../dist-server/server/index.js");
    const child = spawn(process.execPath, [serverEntry], {
      env: desktopCliEnvironment({
        ...process.env,
        COMPOSER_AGENT_SERVER_PORT: "0",
        ELECTRON_RUN_AS_NODE: "1"
      }),
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

function listWorkspaceFiles(cwd: string) {
  const relativePaths = gitWorkspaceFilePaths(cwd) ?? walkedWorkspaceFilePaths(cwd);

  return relativePaths
    .slice(0, MAX_WORKSPACE_FILE_ENTRIES)
    .map((relativePath) => {
      const absolutePath = path.join(cwd, relativePath);
      const stats = fs.statSync(absolutePath);

      return {
        path: relativePath,
        absolutePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs
      };
    });
}

function gitWorkspaceFilePaths(cwd: string) {
  try {
    const output = execFileSync(
      "git",
      ["-C", cwd, "ls-files", "--cached", "--others", "--exclude-standard"],
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024
      }
    );

    return output
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry && !entry.split("/").some((part) => IGNORED_WORKSPACE_DIRECTORIES.has(part)))
      .filter((entry) => {
        try {
          return fs.statSync(path.join(cwd, entry)).isFile();
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

function walkedWorkspaceFilePaths(cwd: string) {
  const files: string[] = [];

  function walk(directory: string) {
    if (files.length >= MAX_WORKSPACE_FILE_ENTRIES) {
      return;
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (files.length >= MAX_WORKSPACE_FILE_ENTRIES) {
        return;
      }

      if (IGNORED_WORKSPACE_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        files.push(path.relative(cwd, absolutePath).replaceAll(path.sep, "/"));
      }
    }
  }

  walk(cwd);
  return files.sort((a, b) => a.localeCompare(b));
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
  initializeGitRepository(cwd);

  return {
    cwd,
    workspaceName: path.basename(cwd)
  };
}

function initializeGitRepository(cwd: string) {
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"]
    });
  } catch {
    execFileSync("git", ["init"], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"]
    });
  }

  execFileSync(
    "git",
    [
      "-c",
      "user.name=Composer",
      "-c",
      "user.email=composer@local",
      "commit",
      "--allow-empty",
      "-m",
      "Initial commit"
    ],
    {
      cwd,
      stdio: ["ignore", "ignore", "pipe"]
    }
  );
}

async function selectProjectFolder() {
  const result = await dialog.showOpenDialog({
    title: "Use an existing folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const cwd = existingDirectory(result.filePaths[0]);

  if (!cwd) {
    throw new Error("Selected path is not a folder");
  }

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
