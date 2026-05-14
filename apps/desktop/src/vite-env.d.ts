/// <reference types="vite/client" />

import type { FilePreview, SessionSnapshot } from "./types";

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

  interface Window {
    composer?: {
      platform: string;
      getAgentServer?: () => Promise<{
        httpUrl: string;
        wsUrl: string;
        cwd?: string;
        workspaceName?: string;
      }>;
      listLocalSessions?: () => Promise<SessionSnapshot>;
      updateSessionVisibility?: (request: {
        sessionId: string;
        action: "archive" | "delete";
      }) => Promise<SessionSnapshot>;
      createProject?: (request: {
        name?: string;
        baseCwd?: string;
      }) => Promise<{
        cwd: string;
        workspaceName: string;
      }>;
      readTextFile?: (filePath: string) => Promise<FilePreview>;
      getAutoUpdateState?: () => Promise<AutoUpdateState>;
      installAutoUpdate?: () => Promise<AutoUpdateState>;
      onAutoUpdateState?: (
        listener: (state: AutoUpdateState) => void
      ) => () => void;
      setNativeAppearance?: (request: {
        themeSource: "light" | "dark" | "system";
        backgroundColor: string;
      }) => Promise<void>;
    };
  }
}

export {};
