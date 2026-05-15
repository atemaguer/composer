import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const desktopCliPathSegments = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  path.join(os.homedir(), ".local", "bin"),
  path.join(os.homedir(), ".npm-global", "bin"),
  path.join(os.homedir(), ".bun", "bin"),
  path.join(os.homedir(), ".cargo", "bin"),
  path.join(os.homedir(), ".volta", "bin"),
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin"
];

export function desktopCliEnvironment(
  baseEnv: NodeJS.ProcessEnv = process.env
) {
  return {
    ...baseEnv,
    PATH: desktopCliPath(baseEnv.PATH)
  };
}

export function desktopCliPath(currentPath?: string) {
  const segments = [
    ...desktopCliPathSegments,
    ...(currentPath?.split(path.delimiter) ?? [])
  ].filter(Boolean);
  const seen = new Set<string>();

  return segments
    .filter((segment) => {
      if (seen.has(segment)) {
        return false;
      }

      seen.add(segment);
      return true;
    })
    .join(path.delimiter);
}

export function resolveDesktopExecutable(
  command: string,
  env: NodeJS.ProcessEnv = desktopCliEnvironment()
) {
  const override = env[`COMPOSER_${command.toUpperCase()}_PATH`];

  if (override && isExecutableFile(override)) {
    return override;
  }

  return findExecutableOnPath(command, env.PATH) ?? null;
}

function findExecutableOnPath(command: string, searchPath?: string) {
  for (const segment of searchPath?.split(path.delimiter) ?? []) {
    const candidate = path.join(segment, command);

    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isExecutableFile(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
