import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { AppUpdater } from "electron-updater";

const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater") as {
  autoUpdater: AppUpdater;
};

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let configured = false;
let updateCheckInterval: NodeJS.Timeout | null = null;
let updateState: AutoUpdateState = { status: "idle" };

export type AutoUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; version?: string; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

export function configureAutoUpdates() {
  if (configured) {
    return;
  }

  configured = true;

  if (process.platform === "win32") {
    app.setAppUserModelId("com.composer.desktop");
  }

  ipcMain.handle("composer:get-auto-update-state", () => updateState);
  ipcMain.handle("composer:install-auto-update", () => {
    if (updateState.status !== "downloaded") {
      return updateState;
    }

    autoUpdater.quitAndInstall(false, true);
    return updateState;
  });

  if (!app.isPackaged || process.env.COMPOSER_DISABLE_AUTO_UPDATES === "1") {
    return;
  }

  const feedUrl = normalizedUpdateBaseUrl(process.env.COMPOSER_UPDATE_BASE_URL);

  if (feedUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: feedUrl
    });
  } else if (!existsSync(join(process.resourcesPath, "app-update.yml"))) {
    console.info("[auto-update] skipping update checks; no update feed configured");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    console.info("[auto-update] checking for update");
    setUpdateState({ status: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    console.info("[auto-update] update available", info.version);
    setUpdateState({ status: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", (info) => {
    console.info("[auto-update] no update available", info.version);
    setUpdateState({ status: "idle" });
  });
  autoUpdater.on("download-progress", (progress) => {
    console.info(
      "[auto-update] download progress",
      `${Math.round(progress.percent)}%`
    );
    setUpdateState({
      status: "downloading",
      percent: Math.round(progress.percent)
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    console.info("[auto-update] update downloaded", info.version);
    setUpdateState({ status: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (error) => {
    console.error("[auto-update] update check failed", error);
    setUpdateState({
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  });

  void checkForUpdates();
  updateCheckInterval = setInterval(() => {
    void checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
  updateCheckInterval.unref();

  app.once("before-quit", () => {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
      updateCheckInterval = null;
    }
  });
}

function setUpdateState(nextState: AutoUpdateState) {
  updateState = nextState;

  for (const browserWindow of BrowserWindow.getAllWindows()) {
    browserWindow.webContents.send("composer:auto-update-state", updateState);
  }
}

async function checkForUpdates() {
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("[auto-update] update check failed", error);
  }
}

function normalizedUpdateBaseUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    const isLocalhost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1";

    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
      return null;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
