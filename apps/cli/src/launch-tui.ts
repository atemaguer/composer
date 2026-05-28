import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TUI_ENTRYPOINT_OVERRIDE_ENV = "COMPOSER_TUI_ENTRYPOINT";
export const BUN_PATH_OVERRIDE_ENV = "COMPOSER_BUN_PATH";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function resolveTuiEntrypoint(env: NodeJS.ProcessEnv): string {
  const override = env[TUI_ENTRYPOINT_OVERRIDE_ENV];
  return override
    ? path.resolve(override)
    : path.join(packageRoot, "src/tui/index.tsx");
}

function resolveBunPath(env: NodeJS.ProcessEnv): string {
  return env[BUN_PATH_OVERRIDE_ENV] ?? "bun";
}

const BUN_NOT_FOUND_MESSAGE =
  "Composer's interactive TUI requires Bun.\n" +
  "Install it from https://bun.sh, then run `composer` again.\n";

export async function launchTui(args: string[]): Promise<number> {
  const env = process.env;
  const bunPath = resolveBunPath(env);
  const entrypoint = resolveTuiEntrypoint(env);

  const child = spawn(bunPath, [entrypoint, ...args], {
    stdio: "inherit",
    // Forward this Node binary so the Bun-hosted TUI can spawn the runtime
    // server under Node (it depends on Node-only builtins like node:sqlite).
    env: { ...env, COMPOSER_NODE_PATH: env.COMPOSER_NODE_PATH ?? process.execPath }
  });

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const forwardSignal = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  for (const signal of signals) {
    process.on(signal, forwardSignal);
  }
  const removeSignalListeners = () => {
    for (const signal of signals) {
      process.removeListener(signal, forwardSignal);
    }
  };

  return await new Promise<number>((resolve) => {
    child.on("error", (error: NodeJS.ErrnoException) => {
      removeSignalListeners();
      if (error.code === "ENOENT") {
        process.stderr.write(BUN_NOT_FOUND_MESSAGE);
        resolve(1);
        return;
      }
      process.stderr.write(`${error.message}\n`);
      resolve(1);
    });

    child.on("exit", (code, signal) => {
      removeSignalListeners();
      if (code !== null) {
        resolve(code);
        return;
      }
      if (signal === "SIGINT") {
        resolve(130);
        return;
      }
      if (signal === "SIGTERM") {
        resolve(143);
        return;
      }
      resolve(1);
    });
  });
}
