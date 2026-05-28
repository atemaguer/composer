import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_ENTRYPOINT_OVERRIDE_ENV = "COMPOSER_SERVER_ENTRYPOINT";
export const BUNDLED_SERVER_ENTRYPOINT = "dist-server/server/index.js";

type AccessFile = (entrypoint: string) => Promise<void>;

export type ResolveServerEntrypointOptions = {
  env?: NodeJS.ProcessEnv;
  packageRoot?: string;
  accessFile?: AccessFile;
};

const defaultPackageRoot = fileURLToPath(new URL("..", import.meta.url));

export async function resolveServerEntrypoint({
  env = process.env,
  packageRoot = defaultPackageRoot,
  accessFile = access
}: ResolveServerEntrypointOptions = {}) {
  const override = env[SERVER_ENTRYPOINT_OVERRIDE_ENV];
  const entrypoint = override
    ? path.resolve(override)
    : path.join(packageRoot, BUNDLED_SERVER_ENTRYPOINT);

  try {
    await accessFile(entrypoint);
  } catch {
    throw new Error(
      `Composer server entrypoint not found at ${entrypoint}. Expected @composer/cli to include ${BUNDLED_SERVER_ENTRYPOINT}. Set ${SERVER_ENTRYPOINT_OVERRIDE_ENV} for tests or local overrides.`
    );
  }

  return entrypoint;
}
