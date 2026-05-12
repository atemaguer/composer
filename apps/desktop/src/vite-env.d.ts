/// <reference types="vite/client" />

import type { FilePreview, SessionSnapshot } from "./types";

declare global {
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
    };
  }
}

export {};
