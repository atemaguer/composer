import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type AutoUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; version?: string; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "installing"; version: string }
  | { status: "install-error"; version: string; message: string }
  | { status: "error"; message: string };

contextBridge.exposeInMainWorld("composer", {
  platform: process.platform,
  getAgentServer: () => ipcRenderer.invoke("composer:get-agent-server"),
  listLocalSessions: () => ipcRenderer.invoke("composer:list-local-sessions"),
  updateSessionVisibility: (request: {
    sessionId: string;
    action: "archive";
  }) => ipcRenderer.invoke("composer:update-session-visibility", request),
  createProject: (request: { name?: string; baseCwd?: string }) =>
    ipcRenderer.invoke("composer:create-project", request),
  readTextFile: (filePath: string) =>
    ipcRenderer.invoke("composer:read-text-file", filePath),
  getAutoUpdateState: () =>
    ipcRenderer.invoke("composer:get-auto-update-state") as Promise<AutoUpdateState>,
  installAutoUpdate: () =>
    ipcRenderer.invoke("composer:install-auto-update") as Promise<AutoUpdateState>,
  onAutoUpdateState: (listener: (state: AutoUpdateState) => void) => {
    const handler = (_event: IpcRendererEvent, state: AutoUpdateState) => {
      listener(state);
    };

    ipcRenderer.on("composer:auto-update-state", handler);

    return () => {
      ipcRenderer.removeListener("composer:auto-update-state", handler);
    };
  },
  setNativeAppearance: (request: {
    themeSource: "light" | "dark" | "system";
    backgroundColor: string;
  }) => ipcRenderer.invoke("composer:set-native-appearance", request)
});
