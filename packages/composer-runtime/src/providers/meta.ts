import { randomUUID } from "node:crypto";

import { defaultCwd, type AgentProvider } from "../runtime.js";
import {
  noopRuntimePersistence,
  type RuntimePersistence,
  type RuntimeProviderSessionRecord
} from "../runtime-persistence.js";
import { createCodexParallelWorktree } from "../parallel-worktrees.js";
import { ClaudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import type {
  ApprovalDecision,
  ApprovalRequest,
  AgentSettings,
  LiveAgentEvent,
  SessionContent,
  SessionProvider
} from "@composer/client";

type DelegateProvider = "codex" | "claude";
type MetaStrategy = "planner-review" | "parallel-initial";
type MetaProviderOptions = {
  persistence?: Pick<RuntimePersistence, "upsertProviderSessions">;
};

type MetaProviderState = {
  codex?: string;
  claude?: string;
  codexCwd?: string;
  claudeCwd?: string;
  claudeWorktreeName?: string;
};

type DelegateRun = {
  provider: DelegateProvider;
  session: SessionContent;
  prompt: string;
  intro: string;
  role: "planning" | "execution";
  phase: "plan" | "execute";
  settings: AgentSettings;
  layoutGroupId?: string;
};

const META_PLANNER = {
  provider: "claude" as const,
  model: "claude-opus-4-7",
  intelligence: "Extra High" as const
};

const META_EXECUTOR = {
  provider: "codex" as const,
  model: "gpt-5.5",
  intelligence: "Medium" as const
};

const PARALLEL_DELEGATES = {
  codex: {
    provider: "codex" as const,
    model: "gpt-5.5",
    intelligence: "Medium" as const
  },
  claude: {
    provider: "claude" as const,
    model: "claude-sonnet-4-6",
    intelligence: "High" as const
  }
};

export class MetaProvider implements AgentProvider {
  private codex = new CodexProvider();
  private claude = new ClaudeProvider();
  // Keep the parent + delegate session objects so interrupt() can finalize
  // providerSessions from whatever the delegates reached (their providerSessionId
  // is set early during the run), letting the user adopt a thread after stopping.
  private activeDelegates = new Map<
    string,
    { session: SessionContent; codex: SessionContent; claude: SessionContent }
  >();
  // Sessions the user explicitly interrupted — suppresses the delegate-failure
  // error so a stop reads as "choose a thread", not a failure.
  private interrupted = new Set<string>();
  private persistence: Pick<RuntimePersistence, "upsertProviderSessions">;

  constructor(options: MetaProviderOptions = {}) {
    this.persistence = options.persistence ?? noopRuntimePersistence;
  }

  async run(request: Parameters<AgentProvider["run"]>[0]) {
    const turnId = randomUUID();
    const composerSessionId = request.session.parentSessionId ?? request.session.id;
    const state = readMetaState(request.session.providerSessionId);
    const strategy = metaStrategy(request.settings.model);
    const codexWorktree = strategy === "parallel-initial"
      ? await createCodexParallelWorktree({
          baseCwd: defaultCwd(request.session),
          parentSessionId: request.session.id,
          existing: {
            codex: state.codexCwd
          }
        })
      : undefined;

    state.codexCwd = codexWorktree?.cwd ?? state.codexCwd;
    state.claudeWorktreeName = strategy === "parallel-initial"
      ? state.claudeWorktreeName ?? claudeWorktreeName(request.session.id)
      : state.claudeWorktreeName;

    const delegateSessions = {
      codex: delegateSession(request.session, "codex", state.codex, state.codexCwd),
      claude: delegateSession(
        request.session,
        "claude",
        state.claude,
        state.claudeCwd,
        state.claudeWorktreeName
      )
    };

    this.activeDelegates.set(request.sessionId, {
      session: request.session,
      codex: delegateSessions.codex,
      claude: delegateSessions.claude
    });

    request.emit({
      id: randomUUID(),
      type: "turn.started",
      sessionId: request.sessionId,
      turnId,
      label: "Compose supervisor is coordinating"
    });
    request.session.renderMode = "hybrid";
    if (strategy !== "parallel-initial") {
      emitSupervisorMessage(request, turnId, strategyDescription(strategy));
    }

    try {
      if (strategy === "parallel-initial") {
        const layoutGroupId = `${request.sessionId}-${turnId}-parallel`;
        const codexSettings = composeDelegateSettings(
          request.settings,
          "codex",
          PARALLEL_DELEGATES.codex
        );
        const claudeSettings = composeDelegateSettings(
          request.settings,
          "claude",
          PARALLEL_DELEGATES.claude
        );
        const results = await Promise.allSettled([
          this.runDelegate(request, {
            provider: PARALLEL_DELEGATES.codex.provider,
            session: delegateSessions.codex,
            prompt: request.prompt,
            intro: "Codex parallel delegate",
            role: "execution",
            phase: "execute",
            layoutGroupId,
            settings: {
              ...request.settings,
              intelligence: codexSettings.intelligence,
              model: codexSettings.model
            }
          }),
          this.runDelegate(request, {
            provider: PARALLEL_DELEGATES.claude.provider,
            session: delegateSessions.claude,
            prompt: request.prompt,
            intro: "Claude parallel delegate",
            role: "execution",
            phase: "execute",
            layoutGroupId,
            settings: {
              ...request.settings,
              intelligence: claudeSettings.intelligence,
              model: claudeSettings.model
            }
          })
        ]);

        state.codex = delegateSessions.codex.providerSessionId;
        state.claude = delegateSessions.claude.providerSessionId;
        state.codexCwd = delegateSessions.codex.cwd ?? state.codexCwd;
        state.claudeCwd = delegateSessions.claude.cwd ?? state.claudeCwd;
        writeMetaState(request.session, state);
        writeParallelProviderSessions(request.session, state);
        writeComposerDelegateMetadata(this.persistence, composerSessionId, strategy, state);

        const failures = results
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason instanceof Error
            ? result.reason.message
            : String(result.reason));

        // A user-initiated stop settles the delegates as failures; don't surface
        // that as an error — the session is now ready for thread adoption.
        if (failures.length > 0 && !this.interrupted.has(request.sessionId)) {
          throw new Error(failures.join("\n"));
        }

        request.emit({
          id: randomUUID(),
          type: "turn.completed",
          sessionId: request.sessionId,
          turnId,
          status: "idle"
        });
        return;
      }

      const plan = await this.runDelegate(request, {
        provider: META_PLANNER.provider,
        session: delegateSessions[META_PLANNER.provider],
        prompt: planningPrompt(request.prompt),
        intro: "Claude planning delegate",
        role: "planning",
        phase: "plan",
        settings: {
          ...request.settings,
          permissionMode: "Default permissions",
          intelligence: META_PLANNER.intelligence,
          model: META_PLANNER.model
        }
      });

      state[META_PLANNER.provider] =
        delegateSessions[META_PLANNER.provider].providerSessionId;
      writeMetaState(request.session, state);
      writeComposerDelegateMetadata(this.persistence, composerSessionId, strategy, state);
      emitSupervisorMessage(
        request,
        turnId,
        "Planning pass complete. Handing the captured plan to the execution delegate."
      );

      await this.runDelegate(request, {
        provider: META_EXECUTOR.provider,
        session: delegateSessions[META_EXECUTOR.provider],
        prompt: executionPrompt(request.prompt, plan),
        intro: "Codex execution delegate",
        role: "execution",
        phase: "execute",
        settings: {
          ...request.settings,
          intelligence: META_EXECUTOR.intelligence,
          model: META_EXECUTOR.model
        }
      });

      state[META_EXECUTOR.provider] =
        delegateSessions[META_EXECUTOR.provider].providerSessionId;
      writeMetaState(request.session, state);
      writeComposerDelegateMetadata(this.persistence, composerSessionId, strategy, state);

      emitSupervisorMessage(
        request,
        turnId,
        "Supervisor run complete. Claude handled planning and Codex handled execution."
      );
      request.emit({
        id: randomUUID(),
        type: "turn.completed",
        sessionId: request.sessionId,
        turnId,
        status: "idle"
      });
    } catch (error) {
      request.emit({
        id: randomUUID(),
        type: "error",
        sessionId: request.sessionId,
        message: error instanceof Error ? error.message : String(error)
      });
      request.emit({
        id: randomUUID(),
        type: "turn.completed",
        sessionId: request.sessionId,
        turnId,
        status: "error"
      });
    } finally {
      this.activeDelegates.delete(request.sessionId);
      this.interrupted.delete(request.sessionId);
    }
  }

  async interrupt(sessionId: string) {
    const active = this.activeDelegates.get(sessionId);

    if (!active) {
      return;
    }

    this.interrupted.add(sessionId);

    await Promise.all([
      this.codex.interrupt(active.codex.id),
      this.claude.interrupt(active.claude.id)
    ]);

    // Finalize providerSessions from whatever the delegates reached so the user
    // can adopt a thread immediately — even if a delegate abruptly stopped and
    // the parallel run never settles on its own. The delegate providerSessionIds
    // are populated early during each run (codex thread / claude session id).
    const state = readMetaState(active.session.providerSessionId);
    state.codex = active.codex.providerSessionId ?? state.codex;
    state.claude = active.claude.providerSessionId ?? state.claude;
    state.codexCwd = active.codex.cwd ?? state.codexCwd;
    state.claudeCwd = active.claude.cwd ?? state.claudeCwd;
    writeMetaState(active.session, state);
    writeParallelProviderSessions(active.session, state);
  }

  async dispose() {
    await Promise.all([
      this.codex.dispose(),
      this.claude.dispose()
    ]);
    this.activeDelegates.clear();
  }

  private async runDelegate(
    request: Parameters<AgentProvider["run"]>[0],
    delegate: DelegateRun
  ): Promise<string> {
    const provider = delegate.provider === "codex" ? this.codex : this.claude;
    const delegateTurnId = randomUUID();
    const output: string[] = [];

    request.emit({
      id: randomUUID(),
      type: "tool.started",
      sessionId: request.sessionId,
      toolId: delegateToolId(delegate.provider, delegateTurnId),
      label: `${delegate.intro} started`,
      provider: delegate.provider,
      layoutGroupId: delegate.layoutGroupId,
      layoutTitle: delegate.layoutGroupId
        ? `${providerLabel(delegate.provider)} thread`
        : undefined,
      detail: {
        id: `${delegate.provider}-${delegateTurnId}-call`,
        label: delegate.intro,
        kind: "call",
        toolName: "meta_supervisor",
        action: "other",
        args: {
          provider: delegate.provider,
          role: delegate.role,
          phase: delegate.phase,
          model: delegate.settings.model ?? "",
          intelligence: delegate.settings.intelligence ?? ""
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const settle = (error?: unknown) => {
        if (settled) {
          return;
        }

        settled = true;

        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } else {
          resolve();
        }
      };

      provider
        .run({
          ...request,
          sessionId: delegate.session.id,
          session: delegate.session,
          prompt: delegate.prompt,
          contextPrompt: request.contextPrompt,
          settings: delegate.settings,
          phase: delegate.phase,
          askApproval: async (approval) => request.askApproval(
            remapApproval(approval, request.sessionId, delegate.provider)
          ),
          emit: (event) => {
            if (event.type === "message.delta") {
              output.push(event.delta);
            }

            const remapped = remapDelegateEvent(
              event,
              request.sessionId,
              delegate.provider,
              delegate.layoutGroupId
            );

            if (remapped) {
              request.emit(remapped);
            }

            if (event.type === "turn.completed") {
              if (event.status === "error") {
                settle(`${providerLabel(delegate.provider)} delegate failed`);
              } else {
                settle();
              }
            }

            if (event.type === "error") {
              settle(event.message);
            }
          }
        })
        .catch(settle);
    });

    request.emit({
      id: randomUUID(),
      type: "tool.completed",
      sessionId: request.sessionId,
      toolId: delegateToolId(delegate.provider, delegateTurnId),
      provider: delegate.provider,
      layoutGroupId: delegate.layoutGroupId,
      layoutTitle: delegate.layoutGroupId
        ? `${providerLabel(delegate.provider)} thread`
        : undefined,
      detail: {
        id: `${delegate.provider}-${delegateTurnId}-done`,
        label: `${delegate.intro} completed`,
        kind: "summary",
        tone: "summary",
        action: "other",
        args: {
          provider: delegate.provider,
          role: delegate.role,
          model: delegate.settings.model ?? "",
          intelligence: delegate.settings.intelligence ?? ""
        }
      }
    });

    return output.join("").trim();
  }
}

function delegateSession(
  parent: SessionContent,
  provider: DelegateProvider,
  providerSessionId?: string,
  cwd?: string,
  nativeWorktreeName?: string
): SessionContent {
  return {
    ...parent,
    id: `${provider}-live-meta-${safeSessionId(parent.id)}`,
    provider,
    providerSessionId,
    renderMode: "single",
    parentSessionId: parent.id,
    runtimeStatus: "running",
    cwd: cwd ?? parent.cwd,
    nativeWorktreeName,
    model: provider === "codex" ? "Codex" : "Claude Code",
    pendingItems: []
  };
}

function planningPrompt(prompt: string) {
  return [
    "You are the planning delegate in a Composer hybrid-agent run.",
    "Use read-only exploration to produce an execution-ready plan for a different provider.",
    "Do not edit files, do not run mutating commands, and do not implement the change.",
    "If the request is ambiguous or unsafe to execute, state the blocker clearly instead of inventing details.",
    "",
    "Return a concise plan with these sections:",
    "1. Objective",
    "2. Relevant files or subsystems inspected",
    "3. Execution steps",
    "4. Verification steps",
    "5. Risks or assumptions",
    "",
    "User request:",
    prompt
  ].join("\n");
}

function executionPrompt(prompt: string, plan: string) {
  return [
    "You are the execution delegate in a Composer hybrid-agent run.",
    "Implement the captured plan below. Treat it as the execution contract, but re-read relevant files before editing because the workspace is the source of truth.",
    "Keep changes tightly scoped to the user request and the plan. If the plan is stale, unsafe, or blocked, stop and explain the blocker instead of improvising broad changes.",
    "After implementing, run focused verification and report changed files, commands run, results, and remaining risks.",
    "",
    "Original user request:",
    prompt,
    "",
    "Captured planning artifact:",
    plan || "The planning delegate returned no plan text. Inspect the workspace and proceed only if the required change is clear."
  ].join("\n");
}

function remapDelegateEvent(
  event: LiveAgentEvent,
  sessionId: string,
  provider: DelegateProvider,
  layoutGroupId?: string
): LiveAgentEvent | null {
  if (event.type === "turn.started" || event.type === "turn.completed") {
    return null;
  }

  if (event.type === "approval.requested" || event.type === "approval.resolved") {
    return null;
  }

  if (event.type === "sessions.snapshot" || event.type === "session.started" || event.type === "session.updated") {
    return null;
  }

  if (event.type === "message.delta") {
    return {
      ...event,
      id: randomUUID(),
      sessionId,
      messageId: `${provider}-${event.messageId}`,
      provider,
      layoutGroupId,
      layoutTitle: layoutGroupId ? `${providerLabel(provider)} thread` : undefined
    };
  }

  if (event.type === "message.completed") {
    return {
      ...event,
      id: randomUUID(),
      sessionId,
      messageId: `${provider}-${event.messageId}`,
      provider,
      layoutGroupId,
      layoutTitle: layoutGroupId ? `${providerLabel(provider)} thread` : undefined
    };
  }

  if (event.type === "tool.started") {
    return {
      ...event,
      id: randomUUID(),
      sessionId,
      toolId: `${provider}-${event.toolId}`,
      provider,
      layoutGroupId,
      layoutTitle: layoutGroupId ? `${providerLabel(provider)} thread` : undefined,
      label: event.label,
      detail: event.detail
        ? {
            ...event.detail,
            id: `${provider}-${event.detail.id}`,
            label: event.detail.label
          }
        : undefined
    };
  }

  if (event.type === "tool.delta") {
    return {
      ...event,
      id: randomUUID(),
      sessionId,
      toolId: `${provider}-${event.toolId}`,
      provider,
      layoutGroupId,
      layoutTitle: layoutGroupId ? `${providerLabel(provider)} thread` : undefined
    };
  }

  if (event.type === "tool.completed") {
    return {
      ...event,
      id: randomUUID(),
      sessionId,
      toolId: `${provider}-${event.toolId}`,
      provider,
      layoutGroupId,
      layoutTitle: layoutGroupId ? `${providerLabel(provider)} thread` : undefined,
      detail: event.detail
        ? {
            ...event.detail,
            id: `${provider}-${event.detail.id}`,
            label: event.detail.label
          }
        : undefined
    };
  }

  if (event.type === "error") {
    return {
      ...event,
      id: randomUUID(),
      sessionId,
      message: `${providerLabel(provider)} delegate failed: ${event.message}`
    };
  }

  return null;
}

function remapApproval(
  approval: Omit<ApprovalRequest, "id">,
  sessionId: string,
  provider: DelegateProvider
): Omit<ApprovalRequest, "id"> {
  return {
    ...approval,
    provider: "meta" as SessionProvider,
    sessionId,
    title: `${providerLabel(provider)} delegate: ${approval.title}`,
    details: {
      delegate: provider,
      ...approval.details
    }
  };
}

function emitSupervisorMessage(
  request: Parameters<AgentProvider["run"]>[0],
  turnId: string,
  body: string
) {
  const messageId = `${request.sessionId}-supervisor-${turnId}-${randomUUID()}`;

  request.emit({
    id: randomUUID(),
    type: "message.delta",
    sessionId: request.sessionId,
    messageId,
    delta: `**Compose supervisor**\n\n${body}\n`
  });
  request.emit({
    id: randomUUID(),
    type: "message.completed",
    sessionId: request.sessionId,
    messageId
  });
}

function readMetaState(value?: string): MetaProviderState {
  if (!value) {
    return {};
  }

  try {
    const record = JSON.parse(value) as Record<string, unknown>;
    return {
      codex: typeof record.codex === "string" ? record.codex : undefined,
      claude: typeof record.claude === "string" ? record.claude : undefined,
      codexCwd: typeof record.codexCwd === "string" ? record.codexCwd : undefined,
      claudeCwd: typeof record.claudeCwd === "string" ? record.claudeCwd : undefined,
      claudeWorktreeName: typeof record.claudeWorktreeName === "string"
        ? record.claudeWorktreeName
        : undefined
    };
  } catch {
    return {};
  }
}

function writeMetaState(session: SessionContent, state: MetaProviderState) {
  session.providerSessionId = JSON.stringify(state);
}

function writeParallelProviderSessions(
  session: SessionContent,
  state: MetaProviderState
) {
  session.providerSessions = {
    ...(session.providerSessions ?? {}),
    ...(state.codex
      ? {
          codex: {
            ...(session.providerSessions?.codex ?? {}),
            sessionId: state.codex,
            cwd: state.codexCwd
          }
        }
      : {}),
    ...(state.claude
      ? {
          claude: {
            ...(session.providerSessions?.claude ?? {}),
            sessionId: state.claude,
            cwd: state.claudeCwd
          }
        }
      : {})
  };
}

function delegateToolId(provider: DelegateProvider, turnId: string) {
  return `meta-${provider}-${turnId}`;
}

function providerLabel(provider: DelegateProvider) {
  return provider === "codex" ? "Codex" : "Claude";
}

function safeSessionId(sessionId: string) {
  return sessionId.replace(/[^A-Za-z0-9_-]/g, "-");
}

function claudeWorktreeName(sessionId: string) {
  return `composer-${safeSessionId(sessionId)}`.slice(0, 64);
}

function metaStrategy(model?: string): MetaStrategy {
  if (
    model === "meta-planner-review" &&
    runtimeFeatureEnabled("COMPOSER_ENABLE_META_PLANNER_REVIEW")
  ) {
    return "planner-review";
  }

  return "parallel-initial";
}

function strategyDescription(strategy: MetaStrategy) {
  if (strategy === "parallel-initial") {
    return "Starting Codex GPT-5.4 and Claude Sonnet 4.6 side by side so you can compare agents and choose one to continue.";
  }

  return "Planning with Claude Opus 4.7 at Extra High thinking, then executing the approved plan with Codex GPT-5.4 Mini at Low reasoning.";
}

function composeDelegateSettings(
  settings: AgentSettings,
  provider: DelegateProvider,
  defaults: { model: string; intelligence: AgentSettings["intelligence"] }
) {
  const configured = settings.composeAgents?.[provider];

  return {
    model: configured?.model ?? defaults.model,
    intelligence: configured?.intelligence ?? defaults.intelligence
  };
}

function writeComposerDelegateMetadata(
  persistence: Pick<RuntimePersistence, "upsertProviderSessions">,
  parentSessionId: string,
  mode: MetaStrategy,
  state: MetaProviderState
) {
  const records: RuntimeProviderSessionRecord[] = [];

  if (state.codex) {
    records.push({
      composerSessionId: parentSessionId,
      provider: "codex",
      providerSessionId: state.codex,
      mode,
      role: mode === "parallel-initial" ? "parallel-initial" : "executor",
      lifecycle: "active",
      cwd: state.codexCwd
    });
  }

  if (state.claude) {
    records.push({
      composerSessionId: parentSessionId,
      provider: "claude",
      providerSessionId: state.claude,
      mode,
      role: mode === "parallel-initial" ? "parallel-initial" : "planner",
      lifecycle: "active",
      cwd: state.claudeCwd
    });
  }

  persistence.upsertProviderSessions(records);
}

function runtimeFeatureEnabled(name: string) {
  const value = process.env[name];

  return value === "1" || value === "true";
}
