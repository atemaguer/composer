import {
  AgentRuntime,
  createComposerServer,
  loadLocalSessionContent,
  loadLocalSessionList,
  localRuntimePersistence
} from "./index.js";

export type StartComposerRuntimeServerOptions = {
  port?: number;
  host?: string;
};

export async function startComposerRuntimeServer(
  options: StartComposerRuntimeServerOptions = {}
) {
  const runtime = new AgentRuntime(loadLocalSessionList(), {
    loadSessionContent: loadLocalSessionContent,
    persistence: localRuntimePersistence
  });
  const composerServer = createComposerServer({ runtime });
  const requestedPort = options.port ?? Number(process.env.COMPOSER_AGENT_SERVER_PORT ?? 0);
  const listenResult = await composerServer.listen({
    port: Number.isFinite(requestedPort) ? requestedPort : 0,
    host: options.host ?? "127.0.0.1"
  });

  return {
    ...listenResult,
    runtime,
    composerServer,
    close: () => composerServer.close()
  };
}

export async function runComposerRuntimeServerFromEnv() {
  const server = await startComposerRuntimeServer();

  console.log(`COMPOSER_AGENT_SERVER_READY ${server.port}`);
  installShutdownHooks(server.close);

  return server;
}

function installShutdownHooks(close: () => Promise<void>) {
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    void close().finally(() => process.exit(0));
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  process.once("SIGHUP", shutdown);
  process.once("disconnect", shutdown);
}
