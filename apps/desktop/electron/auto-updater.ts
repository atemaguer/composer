import { app } from "electron";
import { autoUpdater } from "electron-updater";

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let configured = false;
let updateCheckInterval: NodeJS.Timeout | null = null;

export function configureAutoUpdates() {
  if (configured) {
    return;
  }

  configured = true;

  if (process.platform === "win32") {
    app.setAppUserModelId("com.composer.desktop");
  }

  if (!app.isPackaged || process.env.COMPOSER_DISABLE_AUTO_UPDATES === "1") {
    return;
  }

  const feedUrl = normalizedUpdateBaseUrl(process.env.COMPOSER_UPDATE_BASE_URL);

  if (feedUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: feedUrl
    });
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.info("[auto-update] checking for update");
  });
  autoUpdater.on("update-available", (info) => {
    console.info("[auto-update] update available", info.version);
  });
  autoUpdater.on("update-not-available", (info) => {
    console.info("[auto-update] no update available", info.version);
  });
  autoUpdater.on("download-progress", (progress) => {
    console.info(
      "[auto-update] download progress",
      `${Math.round(progress.percent)}%`
    );
  });
  autoUpdater.on("update-downloaded", (info) => {
    console.info("[auto-update] update downloaded", info.version);
  });
  autoUpdater.on("error", (error) => {
    console.error("[auto-update] update check failed", error);
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

async function checkForUpdates() {
  try {
    await autoUpdater.checkForUpdatesAndNotify();
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

    if (url.protocol !== "https:") {
      return null;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
