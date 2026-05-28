#!/usr/bin/env node
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(cliRoot, "../..");
const scopeRoot = path.join(cliRoot, "node_modules/@composer");

const bundledPackages = [
  {
    source: path.join(repoRoot, "packages/composer-client"),
    target: path.join(scopeRoot, "client")
  },
  {
    source: path.join(repoRoot, "packages/composer-runtime"),
    target: path.join(scopeRoot, "runtime")
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
