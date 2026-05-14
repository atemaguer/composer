import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { AppUpdater } from "electron-updater";

const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater") as {
  autoUpdater: AppUpdater;
};

const UPDATE_CHECK_INTERVAL_MS = 30 * 1000;
const INSTALL_QUIT_FALLBACK_MS = 4000;

let configured = false;
let installQuitFallback: NodeJS.Timeout | null = null;
let updateCheckInterval: NodeJS.Timeout | null = null;
let updateState: AutoUpdateState = { status: "idle" };

export type AutoUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; version?: string; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "installing"; version: string }
  | { status: "install-error"; version: string; message: string }
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
    if (updateState.status === "installing") {
      return updateState;
    }

    if (
      updateState.status !== "downloaded" &&
      updateState.status !== "install-error"
    ) {
      return updateState;
    }

    const version = updateState.version;
    setUpdateState({ status: "installing", version });

    setImmediate(() => {
      try {
        console.info("[auto-update] installing downloaded update", version);
        autoUpdater.quitAndInstall(false, true);

        if (updateState.status === "installing") {
          installQuitFallback = setTimeout(() => {
            console.info("[auto-update] forcing app quit for installer handoff");
            app.quit();
          }, INSTALL_QUIT_FALLBACK_MS);
          installQuitFallback.unref();
        }
      } catch (error) {
        clearInstallQuitFallback();
        console.error("[auto-update] update install failed", error);
        setUpdateState({
          status: "install-error",
          version,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

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
    clearInstallQuitFallback();
    console.error("[auto-update] update check failed", error);
    const message = error instanceof Error ? error.message : String(error);

    if (updateState.status === "installing") {
      setUpdateState({
        status: "install-error",
        version: updateState.version,
        message
      });
      return;
    }

    setUpdateState({
      status: "error",
      message
    });
  });

  void checkForUpdates();
  updateCheckInterval = setInterval(() => {
    void checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
  updateCheckInterval.unref();

  app.once("before-quit", () => {
    clearInstallQuitFallback();

    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
      updateCheckInterval = null;
    }
  });
}

function clearInstallQuitFallback() {
  if (!installQuitFallback) {
    return;
  }

  clearTimeout(installQuitFallback);
  installQuitFallback = null;
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
