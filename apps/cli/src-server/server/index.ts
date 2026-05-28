import { runComposerRuntimeServerFromEnv } from "@composer/runtime/server-entry";

void runComposerRuntimeServerFromEnv().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
