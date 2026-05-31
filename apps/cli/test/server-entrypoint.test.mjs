import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const {
  BUNDLED_SERVER_ENTRYPOINT,
  SERVER_ENTRYPOINT_OVERRIDE_ENV,
  resolveServerEntrypoint
} = await import("../dist/server-entrypoint.js");

test("server entrypoint resolution uses the COMPOSER_SERVER_ENTRYPOINT override", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "composer-cli-entrypoint-"));
  const override = path.join(directory, "fake-server.mjs");

  try {
    await writeFile(override, "export {};\n");

    const entrypoint = await resolveServerEntrypoint({
      env: { [SERVER_ENTRYPOINT_OVERRIDE_ENV]: override },
      packageRoot: path.join(directory, "missing-package")
    });

    assert.equal(entrypoint, path.resolve(override));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("server entrypoint resolution defaults to the bundled CLI package server", async () => {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "composer-cli-package-"));
  const bundledEntrypoint = path.join(packageRoot, BUNDLED_SERVER_ENTRYPOINT);

  try {
    await mkdir(path.dirname(bundledEntrypoint), { recursive: true });
    await writeFile(bundledEntrypoint, "export {};\n");

    assert.equal(
      await resolveServerEntrypoint({ env: {}, packageRoot }),
      bundledEntrypoint
    );
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("server entrypoint resolution reports the expected bundled path when missing", async () => {
  const packageRoot = await mkdtemp(path.join(os.tmpdir(), "composer-cli-package-"));

  try {
    await assert.rejects(
      resolveServerEntrypoint({ env: {}, packageRoot }),
      new RegExp(`${escapeRegExp(BUNDLED_SERVER_ENTRYPOINT)}.*${SERVER_ENTRYPOINT_OVERRIDE_ENV}`)
    );
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test("package metadata includes the bundled server output", async () => {
  const packageJson = JSON.parse(await readFile(path.join(cliRoot, "package.json"), "utf8"));

  assert.equal(packageJson.private, undefined);
  assert.equal(packageJson.bin.composer, "./dist/index.js");
  assert.equal(packageJson.files.includes("dist"), true);
  assert.equal(packageJson.files.includes("dist-server"), true);
  // Only @composer/client is bundled — the TUI imports it at runtime. The
  // runtime is inlined into the bundled server (dist-server/server/index.js),
  // so it is neither a dependency nor a bundled dependency.
  assert.deepEqual(packageJson.bundleDependencies, ["@composer/client"]);
  assert.equal(packageJson.dependencies["@composer/client"], "0.1.0");
  assert.equal(packageJson.dependencies["@composer/runtime"], undefined);
});

test("npm pack includes bundled server output when it is present", async () => {
  const distServerRoot = path.join(cliRoot, "dist-server");
  const bundledEntrypoint = path.join(cliRoot, BUNDLED_SERVER_ENTRYPOINT);
  const hadDistServerRoot = existsSync(distServerRoot);
  const hadBundledEntrypoint = existsSync(bundledEntrypoint);

  try {
    if (!hadBundledEntrypoint) {
      await mkdir(path.dirname(bundledEntrypoint), { recursive: true });
      await writeFile(bundledEntrypoint, "export {};\n");
    }

    const { stdout } = await execFileAsync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      { cwd: cliRoot, maxBuffer: 1024 * 1024 }
    );
    const [packResult] = JSON.parse(stdout);
    const files = packResult.files.map((file) => file.path);

    assert.equal(files.includes("dist/index.js"), true);
    assert.equal(files.includes(BUNDLED_SERVER_ENTRYPOINT), true);
    assert.equal(files.some((file) => file.includes("desktop/dist-server")), false);
  } finally {
    if (!hadBundledEntrypoint) {
      await rm(bundledEntrypoint, { force: true });
    }
    if (!hadDistServerRoot) {
      await rm(distServerRoot, { recursive: true, force: true });
    }
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
