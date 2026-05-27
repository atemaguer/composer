import { loadLocalSessions } from "../electron/session-loader.js";
import { createComposerServer } from "./composer-server.js";
import { desktopRuntimePersistence } from "./desktop-persistence.js";
import { AgentRuntime } from "./runtime.js";

const runtime = new AgentRuntime(loadLocalSessions(), {
  persistence: desktopRuntimePersistence
});
const composerServer = createComposerServer({ runtime });
const requestedPort = Number(process.env.COMPOSER_AGENT_SERVER_PORT ?? 0);

void composerServer
  .listen({
    port: Number.isFinite(requestedPort) ? requestedPort : 0,
    host: "127.0.0.1"
  })
  .then(({ port }) => {
    console.log(`COMPOSER_AGENT_SERVER_READY ${port}`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

let shuttingDown = false;

process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGHUP", () => {
  void shutdown();
});
process.once("disconnect", () => {
  void shutdown();
});

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  await composerServer.close();
  process.exit(0);
}
