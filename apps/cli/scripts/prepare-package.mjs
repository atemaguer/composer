#!/usr/bin/env node
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(cliRoot, "../..");
const scopeRoot = path.join(cliRoot, "node_modules/@composer");

// Only @composer/client is bundled — the TUI imports it at runtime and it is a
// workspace package (not on npm). @composer/runtime is inlined into the bundled
// server (dist-server/server/index.js) by `build:server`, so it does not need
// to ship as a node_modules dependency. Bundling a workspace package whose
// transitive deps (ai/ws/…) collide with the CLI's own deps left those deps as
// empty install placeholders — inlining the server avoids that entirely.
const bundledPackages = [
  {
    source: path.join(repoRoot, "packages/composer-client"),
    target: path.join(scopeRoot, "client")
  }
];

if (process.argv.includes("--clean")) {
  await rm(scopeRoot, { recursive: true, force: true });
  process.exit(0);
}

await rm(scopeRoot, { recursive: true, force: true });
await mkdir(scopeRoot, { recursive: true });

for (const { source, target } of bundledPackages) {
  await mkdir(target, { recursive: true });
  await cp(path.join(source, "package.json"), path.join(target, "package.json"));
  await cp(path.join(source, "dist"), path.join(target, "dist"), { recursive: true });
}
