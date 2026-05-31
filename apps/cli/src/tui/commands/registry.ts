import type { Dispatch } from "react";
import type { SessionProvider } from "@composer/client";
import type { RuntimeApi } from "../runtime.js";
import type { TuiAction, TuiState } from "../types.js";

/**
 * Everything a slash command needs to act. Commands are fire-and-forget — they
 * dispatch reducer actions, call the imperative runtime, send a passthrough
 * prompt, or exit. They never return a value.
 */
export type CommandContext = {
  state: TuiState;
  dispatch: Dispatch<TuiAction>;
  runtime: RuntimeApi;
  /** Text after the command word (for commands that accept arguments). */
  args: string;
  /** Tear down the renderer and exit the process. */
  exit: () => void;
};

/**
 * A single slash command. Composer is an orchestration frontend over the real
 * Codex and Claude Code engines, so the menu is provider-aware: when a command
 * is provider-native its `providers` list scopes it, and its `run` maps to that
 * provider's equivalent behaviour. Commands without `providers` are Composer's
 * cross-provider orchestration layer (provider/session switching, etc.).
 */
export type SlashCommand = {
  name: string;
  aliases?: string[];
  title: string;
  description: string;
  category: "Composer" | "Session" | "Settings" | "Provider";
  /** Providers that expose this command. Omit = available for all providers. */
  providers?: SessionProvider[];
  /** Hidden from the menu (e.g. it needs a server endpoint not yet built). */
  hidden?: boolean;
  run: (ctx: CommandContext) => void;
};

/**
 * Forward a literal slash command to the active provider as prompt text. Claude
 * Code interprets passthrough slash commands (`/init`, `/review`, …) natively;
 * Codex receives them as turn input. This keeps parity with launching the
 * provider CLI directly.
 */
function passthrough(name: string) {
  return (ctx: CommandContext) => {
    const text = ctx.args ? `/${name} ${ctx.args}` : `/${name}`;
    ctx.runtime.sendPrompt(text);
  };
}

function comingSoon(label: string) {
  return (ctx: CommandContext) => {
    ctx.dispatch({
      type: "setNotice",
      notice: `${label} is not available yet`
    });
  };
}

const COMMANDS: SlashCommand[] = [
  // --- Composer orchestration (cross-provider) ----------------------------
  {
    name: "new",
    title: "New conversation",
    description: "Start a fresh session",
    category: "Composer",
    run: (ctx) => ctx.dispatch({ type: "newSession" })
  },
  {
    name: "clear",
    aliases: ["reset"],
    title: "Clear conversation",
    description: "Clear the screen and start fresh",
    category: "Composer",
    run: (ctx) => ctx.dispatch({ type: "newSession" })
  },
  {
    name: "sessions",
    aliases: ["resume", "continue"],
    title: "Resume a session",
    description: "Open the session list",
    category: "Session",
    run: (ctx) => {
      ctx.runtime.refreshSessions();
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "sessions" } });
    }
  },
  {
    name: "provider",
    aliases: ["agent"],
    title: "Switch provider",
    description: "Choose Codex, Claude, or Compose",
    category: "Provider",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "provider" } })
  },
  // --- Settings (mapped to the active provider) ---------------------------
  {
    name: "model",
    title: "Switch model",
    description: "Choose the active model",
    category: "Settings",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "model" } })
  },
  {
    name: "effort",
    aliases: ["intelligence", "reasoning"],
    title: "Reasoning effort",
    description: "Set the reasoning effort level",
    category: "Settings",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "intelligence" } })
  },
  {
    name: "permissions",
    aliases: ["approvals"],
    title: "Permissions",
    description: "Set what runs without asking",
    category: "Settings",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "permission" } })
  },
  // --- Session control ----------------------------------------------------
  {
    name: "stop",
    aliases: ["interrupt"],
    title: "Stop",
    description: "Interrupt the running turn",
    category: "Session",
    run: (ctx) => ctx.runtime.interrupt()
  },
  {
    name: "compact",
    title: "Compact",
    description: "Summarize the conversation to free context",
    category: "Session",
    run: (ctx) => {
      const sessionId = ctx.state.selectedThread;
      if (!sessionId) {
        ctx.dispatch({
          type: "setNotice",
          notice: "No active session to compact"
        });
        return;
      }
      ctx.runtime.compactSession(sessionId);
      ctx.dispatch({ type: "setNotice", notice: "Compacting context…" });
    }
  },
  {
    name: "fork",
    title: "Fork conversation",
    description: "Branch the conversation into a new thread",
    category: "Session",
    hidden: true,
    run: comingSoon("/fork")
  },
  // --- Provider passthrough (handled natively by the engine) --------------
  {
    name: "init",
    title: "Initialize project",
    description: "Generate an agent guide for this repo",
    category: "Provider",
    run: passthrough("init")
  },
  {
    name: "review",
    title: "Review changes",
    description: "Ask the agent to review your working tree",
    category: "Provider",
    run: passthrough("review")
  },
  // --- Git / workspace (Composer-native frontend) -------------------------
  {
    name: "diff",
    aliases: ["view"],
    title: "View diff",
    description: "Show the working-tree diff",
    category: "Session",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "review" } })
  },
  {
    name: "branch",
    aliases: ["checkout"],
    title: "Switch branch",
    description: "List and check out a git branch",
    category: "Session",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "branch" } })
  },
  {
    name: "skills",
    aliases: ["capabilities", "plugins"],
    title: "Skills & plugins",
    description: "Browse installed skills and plugins",
    category: "Composer",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "capabilities" } })
  },
  {
    name: "archive",
    title: "Archive session",
    description: "Hide the current session",
    category: "Session",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "archive" } })
  },
  {
    name: "adopt",
    title: "Adopt thread",
    description: "Continue with one parallel provider",
    category: "Provider",
    providers: ["meta"],
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "adopt" } })
  },
  // --- Read-only panels ---------------------------------------------------
  {
    name: "status",
    title: "Status",
    description: "Show provider, model, permissions, and cwd",
    category: "Composer",
    run: (ctx) =>
      ctx.dispatch({ type: "pushDialog", dialog: { kind: "status" } })
  },
  {
    name: "help",
    aliases: ["commands"],
    title: "Help",
    description: "List available commands and shortcuts",
    category: "Composer",
    run: (ctx) => ctx.dispatch({ type: "pushDialog", dialog: { kind: "help" } })
  },
  {
    name: "quit",
    aliases: ["exit", "q"],
    title: "Quit",
    description: "Exit Composer",
    category: "Composer",
    run: (ctx) => ctx.exit()
  }
];

/** Every registered command, including hidden ones (for tests/introspection). */
export function listCommands(): SlashCommand[] {
  return COMMANDS;
}

/** All non-hidden commands exposed for a given provider. */
export function commandsForProvider(provider: SessionProvider): SlashCommand[] {
  return COMMANDS.filter(
    (command) =>
      !command.hidden &&
      (!command.providers || command.providers.includes(provider))
  );
}

/** Resolve a command by name or alias (includes hidden commands). */
export function findCommand(name: string): SlashCommand | undefined {
  const lower = name.toLowerCase();
  return COMMANDS.find(
    (command) => command.name === lower || command.aliases?.includes(lower)
  );
}

/**
 * Parse a raw input line into a `{ name, args }` slash invocation, or null when
 * the input is not a slash command. Only the first line is treated as the
 * command; the rest is preserved as arguments.
 */
export function parseSlash(
  input: string
): { name: string; args: string } | null {
  if (!input.startsWith("/")) {
    return null;
  }

  const firstLineEnd = input.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? input : input.slice(0, firstLineEnd);
  const spaceIndex = firstLine.indexOf(" ");
  const name = (
    spaceIndex === -1 ? firstLine : firstLine.slice(0, spaceIndex)
  )
    .slice(1)
    .toLowerCase();

  if (!name) {
    return null;
  }

  const firstLineArgs =
    spaceIndex === -1 ? "" : firstLine.slice(spaceIndex + 1);
  const rest = firstLineEnd === -1 ? "" : input.slice(firstLineEnd + 1);
  const args = `${firstLineArgs}${rest ? `\n${rest}` : ""}`.trim();

  return { name, args };
}

/**
 * The candidate list for the slash autocomplete popup, derived purely from the
 * current input + provider. Ranks exact, prefix, then substring matches.
 */
export function autocompleteCandidates(state: TuiState): SlashCommand[] {
  if (!state.input.startsWith("/")) {
    return [];
  }

  const query = state.input.slice(1).split(/\s/u)[0]?.toLowerCase() ?? "";
  const all = commandsForProvider(state.provider);

  if (!query) {
    return all;
  }

  const score = (command: SlashCommand): number => {
    const names = [command.name, ...(command.aliases ?? [])];
    if (names.some((name) => name === query)) return 0;
    if (names.some((name) => name.startsWith(query))) return 1;
    // Tolerate trailing characters (e.g. "providers" → "provider").
    if (names.some((name) => query.startsWith(name))) return 1;
    if (names.some((name) => name.includes(query))) return 2;
    if (command.title.toLowerCase().includes(query)) return 3;
    return 99;
  };

  return all
    .map((command) => ({ command, rank: score(command) }))
    .filter((entry) => entry.rank < 99)
    .sort(
      (a, b) => a.rank - b.rank || a.command.name.localeCompare(b.command.name)
    )
    .map((entry) => entry.command);
}
