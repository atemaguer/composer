import {
  runtimeProviderDefinitions,
  type RuntimeProviderDefinition,
  type SessionProvider
} from "@composer/client";
import { ClaudeProvider } from "./providers/claude.js";
import { CodexProvider } from "./providers/codex.js";
import { MetaProvider } from "./providers/meta.js";
import type { AgentProvider } from "./runtime.js";
import type { RuntimePersistence } from "./runtime-persistence.js";

export type RuntimeProviderFactoryDefinition = RuntimeProviderDefinition & {
  createProvider: (dependencies: RuntimeProviderDependencies) => AgentProvider;
};

export type RuntimeProviderDependencies = {
  persistence: RuntimePersistence;
};

const providerFactories = {
  codex: () => new CodexProvider(),
  claude: () => new ClaudeProvider(),
  meta: ({ persistence }) => new MetaProvider({ persistence })
} satisfies Record<
  SessionProvider,
  (dependencies: RuntimeProviderDependencies) => AgentProvider
>;

export const runtimeProviderFactoryDefinitions =
  runtimeProviderDefinitions.map((definition) => ({
    ...definition,
    createProvider: providerFactories[definition.id]
  })) satisfies RuntimeProviderFactoryDefinition[];

export function createRuntimeProviders(
  dependencies: RuntimeProviderDependencies
) {
  const providers = {} as Record<SessionProvider, AgentProvider>;

  for (const definition of runtimeProviderFactoryDefinitions) {
    providers[definition.id] = definition.createProvider(dependencies);
  }

  return providers;
}
