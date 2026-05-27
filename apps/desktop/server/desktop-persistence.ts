import {
  adoptComposerParallelProvider,
  upsertComposerProviderSessions,
  upsertComposerSessionFromRuntime
} from "../electron/composer-session-registry.js";
import { updateLocalSessionVisibility } from "../electron/session-loader.js";
import type { RuntimePersistence } from "./runtime-persistence.js";

export const desktopRuntimePersistence: RuntimePersistence = {
  upsertSession: upsertComposerSessionFromRuntime,
  updateSessionVisibility: updateLocalSessionVisibility,
  adoptParallelProvider: adoptComposerParallelProvider,
  upsertProviderSessions: upsertComposerProviderSessions
};
