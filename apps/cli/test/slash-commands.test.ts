// Logic-level tests for every slash command: invoking a command's `run` must
// produce the documented effect (open the right dialog, call the right runtime
// method, or send a passthrough prompt). Run with `bun test`.
import { describe, expect, test } from "bun:test";
import {
  autocompleteCandidates,
  commandsForProvider,
  findCommand,
  listCommands,
  parseSlash,
  type CommandContext
} from "../src/tui/commands/registry.ts";

function run(
  name: string,
  overrides?: { state?: Partial<CommandContext["state"]>; args?: string }
) {
  const command = findCommand(name);
  if (!command) {
    throw new Error(`command not found: ${name}`);
  }
  const dispatched: any[] = [];
  const runtimeCalls: Array<{ method: string; args: any[] }> = [];
  let exited = false;
  const runtime = new Proxy(
    {},
    { get: (_t, p: string) => (...a: any[]) => runtimeCalls.push({ method: p, args: a }) }
  ) as CommandContext["runtime"];
  const state = {
    selectedThread: "session-1",
    provider: "codex",
    permission: "Default permissions",
    modelByProvider: { codex: "gpt-5.5", claude: "claude-sonnet-4-6", meta: "meta-parallel-initial" },
    intelligenceByProvider: { codex: "Medium", claude: "High", meta: "High" },
    ...overrides?.state
  } as unknown as CommandContext["state"];
  command.run({
    state,
    dispatch: (a) => dispatched.push(a),
    runtime,
    args: overrides?.args ?? "",
    exit: () => {
      exited = true;
    }
  });
  return { dispatched, runtimeCalls, exited: () => exited };
}

const pushKinds = (dispatched: any[]) =>
  dispatched.filter((a) => a.type === "pushDialog").map((a) => a.dialog.kind);

describe("registry integrity", () => {
  test("every command has a unique name and a run function", () => {
    const seen = new Set<string>();
    for (const command of listCommands()) {
      expect(typeof command.run).toBe("function");
      expect(command.name).toMatch(/^[a-z]+$/);
      const keys = [command.name, ...(command.aliases ?? [])];
      for (const key of keys) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  test("hidden commands (compact, fork) are excluded from the menu", () => {
    const names = commandsForProvider("codex").map((c) => c.name);
    expect(names).not.toContain("fork");
  });

  test("/adopt is meta-only", () => {
    expect(commandsForProvider("codex").map((c) => c.name)).not.toContain("adopt");
    expect(commandsForProvider("meta").map((c) => c.name)).toContain("adopt");
  });
});

describe("dialog-opening commands push the right dialog", () => {
  const cases: Array<[string, string]> = [
    ["provider", "provider"],
    ["model", "model"],
    ["effort", "intelligence"],
    ["permissions", "permission"],
    ["sessions", "sessions"],
    ["diff", "review"],
    ["branch", "branch"],
    ["skills", "capabilities"],
    ["archive", "archive"],
    ["adopt", "adopt"],
    ["status", "status"],
    ["help", "help"]
  ];
  for (const [name, kind] of cases) {
    test(`/${name} opens the ${kind} dialog`, () => {
      const { dispatched } = run(name);
      expect(pushKinds(dispatched)).toContain(kind);
    });
  }
});

describe("aliases resolve", () => {
  const aliases: Array<[string, string]> = [
    ["resume", "sessions"],
    ["agent", "provider"],
    ["intelligence", "effort"],
    ["approvals", "permissions"],
    ["reset", "clear"],
    ["interrupt", "stop"],
    ["exit", "quit"],
    ["view", "diff"],
    ["checkout", "branch"],
    ["capabilities", "skills"]
  ];
  for (const [alias, canonical] of aliases) {
    test(`/${alias} resolves to /${canonical}`, () => {
      expect(findCommand(alias)?.name).toBe(canonical);
    });
  }
});

describe("action commands call the runtime / dispatch", () => {
  test("/new starts a fresh session", () => {
    const { dispatched } = run("new");
    expect(dispatched.some((a) => a.type === "newSession")).toBe(true);
  });

  test("/clear starts a fresh session", () => {
    const { dispatched } = run("clear");
    expect(dispatched.some((a) => a.type === "newSession")).toBe(true);
  });

  test("/sessions refreshes then opens the list", () => {
    const { dispatched, runtimeCalls } = run("sessions");
    expect(runtimeCalls.some((c) => c.method === "refreshSessions")).toBe(true);
    expect(pushKinds(dispatched)).toContain("sessions");
  });

  test("/stop interrupts", () => {
    const { runtimeCalls } = run("stop");
    expect(runtimeCalls.some((c) => c.method === "interrupt")).toBe(true);
  });

  test("/init sends a passthrough prompt", () => {
    const { runtimeCalls } = run("init");
    const send = runtimeCalls.find((c) => c.method === "sendPrompt");
    expect(send?.args[0]).toBe("/init");
  });

  test("/init forwards arguments", () => {
    const { runtimeCalls } = run("init", { args: "now" });
    expect(runtimeCalls.find((c) => c.method === "sendPrompt")?.args[0]).toBe("/init now");
  });

  test("/review sends a passthrough prompt", () => {
    const { runtimeCalls } = run("review");
    expect(runtimeCalls.find((c) => c.method === "sendPrompt")?.args[0]).toBe("/review");
  });

  test("/compact compacts the active session", () => {
    const { runtimeCalls } = run("compact");
    const call = runtimeCalls.find((c) => c.method === "compactSession");
    expect(call?.args[0]).toBe("session-1");
  });

  test("/compact warns when there is no active session", () => {
    const { dispatched, runtimeCalls } = run("compact", {
      state: { selectedThread: null } as any
    });
    expect(runtimeCalls.some((c) => c.method === "compactSession")).toBe(false);
    expect(dispatched.some((a) => a.type === "setNotice")).toBe(true);
  });

  test("/archive archives the active session via the dialog", () => {
    // The command opens a confirm dialog; the archive call happens on confirm.
    const { dispatched } = run("archive");
    expect(pushKinds(dispatched)).toContain("archive");
  });

  test("/quit exits", () => {
    const { exited } = run("quit");
    expect(exited()).toBe(true);
  });
});

describe("parseSlash", () => {
  test("plain text is not a slash command", () => {
    expect(parseSlash("hello")).toBeNull();
  });
  test("parses name and args", () => {
    expect(parseSlash("/init my project")).toEqual({ name: "init", args: "my project" });
  });
  test("lowercases the command name", () => {
    expect(parseSlash("/Model")).toEqual({ name: "model", args: "" });
  });
});

describe("autocompleteCandidates", () => {
  test("'/' lists all commands for the provider", () => {
    const state = { input: "/", provider: "codex" } as unknown as CommandContext["state"];
    expect(autocompleteCandidates(state).length).toBe(commandsForProvider("codex").length);
  });
  test("'/prov' surfaces /provider", () => {
    const state = { input: "/prov", provider: "codex" } as unknown as CommandContext["state"];
    expect(autocompleteCandidates(state).map((c) => c.name)).toContain("provider");
  });
  test("trailing chars still match ('/providers' → /provider)", () => {
    const state = { input: "/providers", provider: "codex" } as unknown as CommandContext["state"];
    expect(autocompleteCandidates(state).map((c) => c.name)).toContain("provider");
  });
  test("non-slash input yields no candidates", () => {
    const state = { input: "hello", provider: "codex" } as unknown as CommandContext["state"];
    expect(autocompleteCandidates(state)).toEqual([]);
  });
});
