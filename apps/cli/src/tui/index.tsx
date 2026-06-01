import { homedir } from "node:os";
import path from "node:path";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { startSidecar, type Sidecar } from "../connection.js";
import { TuiProvider } from "./store.js";
import { App } from "./App.js";
import { hasSeenOnboarding } from "./onboarding.js";

function parseCwd(args: string[]): string {
  const index = args.indexOf("--cwd");
  if (index !== -1 && typeof args[index + 1] === "string") {
    return args[index + 1];
  }
  return process.cwd();
}

async function main(): Promise<void> {
  const cwd = parseCwd(process.argv.slice(2));
  // Parallel-first onboarding: a first-time user's first session starts in
  // Compare (Codex + Claude) so the "two agents, one task" aha is immediate.
  // Returning users fall back to the reducer default (Codex).
  const provider = hasSeenOnboarding() ? undefined : ("meta" as const);

  let sidecar: Sidecar | null = null;

  try {
    // The sidecar's stdout/stderr would corrupt the rendered screen, so run it
    // silently and tee its logs to a file for debugging.
    sidecar = await startSidecar(cwd, {
      silent: true,
      logFile: path.join(homedir(), ".composer", "logs", "server.log")
    });

    const renderer = await createCliRenderer({ exitOnCtrlC: false });

    // Tear the sidecar down on every shutdown path so we never leak the
    // background server process.
    const activeSidecar = sidecar;
    let stopped = false;
    const stop = () => {
      if (stopped) {
        return;
      }
      stopped = true;
      void activeSidecar.stop();
    };

    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    process.on("exit", stop);

    const originalDestroy = renderer.destroy.bind(renderer);
    renderer.destroy = () => {
      stop();
      return originalDestroy();
    };

    createRoot(renderer).render(
      <TuiProvider init={{ cwd, provider }}>
        <App connection={{ httpUrl: activeSidecar.url, wsUrl: activeSidecar.wsUrl }} />
      </TuiProvider>
    );
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    if (sidecar) {
      await sidecar.stop();
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
