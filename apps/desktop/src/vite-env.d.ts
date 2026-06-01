/// <reference types="vite/client" />

import type { FilePreview, SessionSnapshot, WorkspaceFileEntry } from "./types";

declare global {
  const __APP_VERSION__: string;

  type AutoUpdateState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "available"; version: string }
    | { status: "downloading"; version?: string; percent: number }
    | { status: "downloaded"; version: string }
    | { status: "installing"; version: string }
    | { status: "install-error"; version: string; message: string }
    | { status: "error"; message: string };

  type WindowFrameState = {
    fullScreen: boolean;
    maximized: boolean;
    titlebarControlsVisible: boolean;
  };

  type TerminalSessionInfo = {
    id: string;
    cwd: string;
    pid: number;
    shell: string;
  };

  type TerminalDataEvent = {
    sessionId: string;
    data: string;
  };

  type TerminalExitEvent = {
    sessionId: string;
    exitCode: number;
    signal?: number;
  };

  interface Window {
    composer?: {
      platform: string;
      getTelemetryIdentity?: () => Promise<{
        installationId: string;
        appVersion: string;
        platform: string;
      }>;
      getAgentServer?: () => Promise<{
        httpUrl: string;
        wsUrl: string;
        cwd?: string;
        workspaceName?: string;
      }>;
      openExternalUrl?: (url: string) => Promise<void>;
      listLocalSessions?: () => Promise<SessionSnapshot>;
      loadLocalSession?: (sessionId: string) => Promise<SessionContent | null>;
      updateSessionVisibility?: (request: {
        sessionId: string;
        action: "archive";
      }) => Promise<SessionSnapshot>;
      createProject?: (request: {
        name?: string;
        baseCwd?: string;
      }) => Promise<{
        cwd: string;
        workspaceName: string;
      }>;
      selectProjectFolder?: () => Promise<{
        cwd: string;
        workspaceName: string;
      } | null>;
      listWorkspaceFiles?: (cwd: string) => Promise<WorkspaceFileEntry[]>;
      readTextFile?: (filePath: string) => Promise<FilePreview>;
      createTerminalSession?: (request: {
        cwd?: string | null;
        cols: number;
        rows: number;
      }) => Promise<TerminalSessionInfo>;
      writeTerminalSession?: (request: {
        sessionId: string;
        data: string;
      }) => void;
      resizeTerminalSession?: (request: {
        sessionId: string;
        cols: number;
        rows: number;
      }) => void;
      disposeTerminalSession?: (sessionId: string) => void;
      onTerminalData?: (
        listener: (event: TerminalDataEvent) => void
      ) => () => void;
      onTerminalExit?: (
        listener: (event: TerminalExitEvent) => void
      ) => () => void;
      getAutoUpdateState?: () => Promise<AutoUpdateState>;
      installAutoUpdate?: () => Promise<AutoUpdateState>;
      onAutoUpdateState?: (
        listener: (state: AutoUpdateState) => void
      ) => () => void;
      getWindowFrameState?: () => Promise<WindowFrameState>;
      onWindowFrameState?: (
        listener: (state: WindowFrameState) => void
      ) => () => void;
      setNativeAppearance?: (request: {
        themeSource: "light" | "dark" | "system";
        backgroundColor: string;
        vibrant?: boolean;
      }) => Promise<void>;
    };
  }
}

export {};
