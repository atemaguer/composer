import {
  adoptComposerParallelProvider,
  upsertComposerProviderSessions,
  upsertComposerSessionFromRuntime
} from "./composer-session-registry.js";
import { updateLocalSessionVisibility } from "./session-loader.js";
import type { RuntimePersistence } from "./runtime-persistence.js";

export const localRuntimePersistence: RuntimePersistence = {
  upsertSession: upsertComposerSessionFromRuntime,
  updateSessionVisibility: updateLocalSessionVisibility,
  adoptParallelProvider: adoptComposerParallelProvider,
  upsertProviderSessions: upsertComposerProviderSessions
};
