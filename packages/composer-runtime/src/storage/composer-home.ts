import os from "node:os";
import path from "node:path";

export type ComposerHomeOptions = {
  homeDir?: string;
  composerHome?: string;
};

export type ComposerStateDatabaseOptions = ComposerHomeOptions & {
  registryPath?: string;
};

export function composerHomePath(options: ComposerHomeOptions = {}) {
  return options.composerHome ?? path.join(options.homeDir ?? os.homedir(), ".composer");
}

export function composerStateDatabasePath(
  options: ComposerStateDatabaseOptions = {}
) {
  return options.registryPath ?? path.join(composerHomePath(options), "state.sqlite");
}
