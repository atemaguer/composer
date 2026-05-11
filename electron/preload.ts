import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("composer", {
  platform: process.platform,
  getAgentServer: () => ipcRenderer.invoke("composer:get-agent-server"),
  listLocalSessions: () => ipcRenderer.invoke("composer:list-local-sessions"),
  createProject: (request: { name?: string; baseCwd?: string }) =>
    ipcRenderer.invoke("composer:create-project", request),
  readTextFile: (filePath: string) =>
    ipcRenderer.invoke("composer:read-text-file", filePath)
});
