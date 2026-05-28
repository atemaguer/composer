import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { startSidecar, type Sidecar } from "../connection.js";
import { TuiProvider } from "./store.js";
import { App } from "./App.js";

function parseCwd(args: string[]): string {
  const index = args.indexOf("--cwd");
  if (index !== -1 && typeof args[index + 1] === "string") {
    return args[index + 1];
  }
  return process.cwd();
}

async function main(): Promise<void> {
  const cwd = parseCwd(process.argv.slice(2));

  let sidecar: Sidecar | null = null;

  try {
    sidecar = await startSidecar(cwd);

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
      <TuiProvider init={{ cwd }}>
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
