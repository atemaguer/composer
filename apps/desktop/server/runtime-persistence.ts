import type {
  DelegateSessionProvider,
  SessionContent
} from "../src/types.js";

export type RuntimeSessionVisibilityAction = "archive";

export type RuntimeSessionVisibilityResult = {
  ok: boolean;
  changed: boolean;
  reason?: string;
  filePath?: string;
};

export type RuntimeHybridMode =
  | "planner-review"
  | "parallel-initial"
  | "handoff";

export type RuntimeProviderLifecycle =
  | "active"
  | "adopted"
  | "discarded"
  | "handoff";

export type RuntimeProviderSessionRecord = {
  composerSessionId: string;
  provider: DelegateSessionProvider;
  providerSessionId: string;
  mode?: RuntimeHybridMode;
  role?: "parallel-initial" | "planner" | "executor" | "handoff" | "primary";
  lifecycle?: RuntimeProviderLifecycle;
  cwd?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  originalCwd?: string;
  originalBranch?: string;
  originalHead?: string;
  lastContextVersion?: number;
};

export type RuntimeParallelProviderAdoption = {
  composerSessionId: string;
  provider: DelegateSessionProvider;
  providerSessionId?: string;
  activeCwd?: string;
};

export interface RuntimePersistence {
  upsertSession(session: SessionContent): void;
  updateSessionVisibility(
    session: Pick<SessionContent, "id" | "provider" | "providerSessionId">,
    action: RuntimeSessionVisibilityAction
  ): RuntimeSessionVisibilityResult | void;
  adoptParallelProvider(adoption: RuntimeParallelProviderAdoption): void;
  upsertProviderSessions(records: RuntimeProviderSessionRecord[]): void;
}

export const noopRuntimePersistence: RuntimePersistence = {
  upsertSession() {},
  updateSessionVisibility() {
    return {
      ok: true,
      changed: false,
      reason: "No runtime persistence configured"
    };
  },
  adoptParallelProvider() {},
  upsertProviderSessions() {}
};
