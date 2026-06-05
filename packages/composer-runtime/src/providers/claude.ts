import { randomUUID } from "node:crypto";
import {
  query,
  type CanUseTool,
  type HookInput,
  type Options,
  type Query,
  type SDKMessage,
  type SDKUserMessage
} from "@anthropic-ai/claude-agent-sdk";

import {
  desktopCliEnvironment,
  resolveDesktopExecutable
} from "../cli-env.js";
import {
  patchReviewLabel,
  reviewFilesFromToolCall
} from "../patch-review.js";
import type { AgentProvider } from "../runtime.js";
import { defaultCwd, providerSessionId } from "../runtime.js";
import { buildDeterministicHandoffSummary } from "./handoff-summary.js";
import type {
  ApprovalDecision,
  ApprovalRequest,
  IntelligenceMode,
  PermissionMode,
  QuestionAnswer,
  QuestionItem,
  SessionContent,
  SessionCompactionSummary,
  ToolDetail
} from "@composer/client";

type JsonRecord = Record<string, unknown>;

export class ClaudeProvider implements AgentProvider {
  private active = new Map<string, { abortController: AbortController; query?: Query }>();
  // Indirection over the Claude Agent SDK `query` so tests can drive the
  // handoff/compaction stream (PostCompact hook + result messages) without a
  // live Claude process. Mirrors CodexProvider.request.
  protected queryImpl: typeof query = query;

  async compact(request: Parameters<NonNullable<AgentProvider["compact"]>>[0]) {
    const abortController = new AbortController();
    const compactToolId = `${request.sessionId}-claude-handoff-compact-${Date.now()}`;
    let recordedSummary = false;
    let latestCompaction: SessionCompactionSummary | undefined;
    // The `compact_boundary` system message carries only token metadata (no
    // summary text); the real summary arrives via the PostCompact hook. Track
    // the metadata so we can attach it to the captured summary regardless of
    // which arrives first.
    let boundaryMeta:
      | { trigger: "manual" | "auto"; preTokens?: number; postTokens?: number }
      | undefined;

    request.emit({
      id: randomUUID(),
      type: "tool.started",
      sessionId: request.sessionId,
      toolId: compactToolId,
      label: "Claude compacting context for handoff",
      detail: {
        id: `${compactToolId}-detail`,
        label: "Claude compacting provider-local context",
        kind: "summary",
        tone: "summary",
        action: "other",
        args: { reason: request.reason }
      }
    });

    const resumeSessionId = request.session.providerSessionId
      ?? providerSessionId(request.session);
    const env = claudeEnvironment();
    const options: Options = {
      cwd: defaultCwd(request.session),
      abortController,
      permissionMode: mapPermissionMode(request.settings.permissionMode),
      allowDangerouslySkipPermissions: request.settings.permissionMode === "Full access",
      effort: mapEffort(request.settings.intelligence),
      model: claudeModel(request.settings.model),
      hooks: {
        PostCompact: [
          {
            hooks: [
              async (input: HookInput) => {
                // PostCompact delivers the real, model-produced summary (see
                // PostCompactHookInput.compact_summary). This is the content the
                // next provider needs for the handoff.
                if (
                  input.hook_event_name === "PostCompact" &&
                  input.compact_summary.trim()
                ) {
                  recordedSummary = true;
                  latestCompaction = recordClaudeCompaction(request.session, {
                    id: `${request.session.id}-claude-compact-${Date.now()}`,
                    contextVersion: request.session.contextVersion ?? 0,
                    trigger: input.trigger,
                    summary: input.compact_summary,
                    preTokens: boundaryMeta?.preTokens,
                    postTokens: boundaryMeta?.postTokens
                  });
                }

                return { continue: true };
              }
            ]
          }
        ]
      },
      pathToClaudeCodeExecutable: resolveDesktopExecutable("claude", env) ?? undefined,
      env
    };

    if (resumeSessionId) {
      options.resume = resumeSessionId;
    }

    const claudeQuery = this.queryImpl({
      prompt: claudeCompactPrompt(request.reason),
      options
    });
    this.active.set(request.sessionId, { abortController, query: claudeQuery });

    try {
      for await (const message of claudeQuery) {
        const sessionId = sessionIdFromMessage(message);
        const cwd = cwdFromMessage(message);

        if (sessionId) {
          request.session.providerSessionId = sessionId;
        }

        if (cwd) {
          request.session.cwd = cwd;
        }

        if (message.type === "system" && message.subtype === "compact_boundary") {
          // Record only the token metadata. Do NOT overwrite the real summary
          // with a placeholder — that previously clobbered the PostCompact
          // summary, so the next provider received an empty handoff context.
          boundaryMeta = {
            trigger: message.compact_metadata.trigger,
            preTokens: message.compact_metadata.pre_tokens,
            postTokens: message.compact_metadata.post_tokens
          };
          if (latestCompaction) {
            latestCompaction.preTokens = boundaryMeta.preTokens;
            latestCompaction.postTokens = boundaryMeta.postTokens;
          }
        }

        if (message.type === "result" && message.subtype !== "success") {
          throw new Error(message.errors.join("\n") || "Claude compaction failed");
        }
      }

      if (!recordedSummary) {
        // Only reached when the model produced no usable summary (e.g. the
        // session was too short to compact). Assemble the same deterministic
        // transcript digest Codex uses so the next provider still inherits the
        // recent requests / output / tool activity instead of a bare note.
        latestCompaction = recordClaudeCompaction(request.session, {
          id: `${request.session.id}-claude-compact-fallback-${Date.now()}`,
          contextVersion: request.session.contextVersion ?? 0,
          trigger: boundaryMeta?.trigger ?? "manual",
          preTokens: boundaryMeta?.preTokens,
          postTokens: boundaryMeta?.postTokens,
          summary: buildDeterministicHandoffSummary({
            provider: "claude",
            providerLabel: "Claude",
            session: request.session,
            reason: request.reason
          })
        });
      }

      request.emit({
        id: randomUUID(),
        type: "tool.completed",
        sessionId: request.sessionId,
        toolId: compactToolId
      });
      return latestCompaction;
    } finally {
      this.active.delete(request.sessionId);
    }
  }

  async run(request: Parameters<AgentProvider["run"]>[0]) {
    const abortController = new AbortController();
    this.active.set(request.sessionId, { abortController });
    const turnId = randomUUID();
    const messageId = `${request.sessionId}-assistant-${turnId}`;
    let emittedText = "";

    request.emit({
      id: randomUUID(),
      type: "turn.started",
      sessionId: request.sessionId,
      turnId,
      label: "Claude is working"
    });

    const canUseTool: CanUseTool = async (toolName, input, context) => {
      // AskUserQuestion isn't a permission gate — its "answer" IS the user's
      // choice. Surface the real options (in the composer accordion) and inject
      // the user's selection back as the tool's answers, instead of silently
      // auto-picking the first option.
      if (toolName === "AskUserQuestion") {
        const questions = parseClaudeQuestions(input, request.sessionId, turnId);

        if (questions.length === 0) {
          return { behavior: "allow", updatedInput: answerClaudeQuestion(input) };
        }

        const answers = await request.askQuestion({
          provider: "claude",
          sessionId: request.sessionId,
          turnId,
          questions
        });

        return {
          behavior: "allow",
          updatedInput: applyClaudeAnswers(input, questions, answers)
        };
      }

      // Full access auto-allows every tool without prompting — but we keep
      // canUseTool active (rather than bypassPermissions) so AskUserQuestion is
      // still routed through the branch above instead of hanging headlessly.
      if (request.settings.permissionMode === "Full access") {
        return { behavior: "allow", updatedInput: input };
      }

      const approval = claudeApproval({
        toolName,
        input,
        context,
        sessionId: request.sessionId,
        turnId
      });
      const decision = await request.askApproval(approval);

      if (decision === "accept" || decision === "acceptForSession") {
        return { behavior: "allow", updatedInput: input };
      }

      return {
        behavior: "deny",
        message: "User denied this action",
        interrupt: decision === "cancel"
      };
    };

    const resumeSessionId = request.session.providerSessionId
      ?? (request.session.id.startsWith("claude-live-")
        ? undefined
        : providerSessionId(request.session));
    const env = claudeEnvironment();
    const options: Options = {
      cwd: defaultCwd(request.session),
      includePartialMessages: true,
      canUseTool,
      hooks: {
        PostCompact: [
          {
            hooks: [
              async (input: HookInput) => {
                if (input.hook_event_name === "PostCompact") {
                  request.session.compactionSummaries = [
                    ...(request.session.compactionSummaries ?? []),
                    {
                      id: `${request.session.id}-claude-compact-${Date.now()}`,
                      provider: "claude" as const,
                      contextVersion: request.session.contextVersion ?? 0,
                      createdAt: new Date().toISOString(),
                      trigger: input.trigger,
                      summary: input.compact_summary
                    }
                  ].slice(-12);
                }

                return { continue: true };
              }
            ]
          }
        ]
      },
      permissionMode:
        request.phase === "plan"
          ? "plan"
          : mapPermissionMode(request.settings.permissionMode),
      // NOTE: do NOT set allowDangerouslySkipPermissions / bypassPermissions —
      // those skip canUseTool entirely, so AskUserQuestion can't be intercepted.
      // Full access is enforced inside canUseTool (auto-allow) instead.
      effort: mapEffort(request.settings.intelligence),
      model: claudeModel(request.settings.model),
      abortController,
      pathToClaudeCodeExecutable: resolveDesktopExecutable("claude", env) ?? undefined,
      env
    };

    if (request.contextPrompt) {
      options.systemPrompt = {
        type: "preset",
        preset: "claude_code",
        append: request.contextPrompt
      };
    }

    applyClaudeNativeWorktreeOption(options, request.session, resumeSessionId);

    const claudeQuery = this.queryImpl({
      prompt: claudePrompt(request.prompt, request.imageAttachments),
      options
    });

    this.active.set(request.sessionId, { abortController, query: claudeQuery });

    try {
      for await (const message of claudeQuery) {
        const sessionId = sessionIdFromMessage(message);
        const cwd = cwdFromMessage(message);

        if (sessionId) {
          request.session.providerSessionId = sessionId;
        }

        if (cwd) {
          request.session.cwd = cwd;
        }

        if (message.type === "stream_event") {
          const event = message.event as unknown as JsonRecord;

          if (event.type === "content_block_delta") {
            const blockDelta = asRecord(event.delta);
            const blockIndex =
              typeof event.index === "number" ? event.index : 0;

            if (
              blockDelta.type === "text_delta" &&
              typeof blockDelta.text === "string"
            ) {
              emittedText += blockDelta.text;
              request.emit({
                id: randomUUID(),
                type: "message.delta",
                sessionId: request.sessionId,
                messageId,
                delta: blockDelta.text
              });
            } else if (
              blockDelta.type === "thinking_delta" &&
              typeof blockDelta.thinking === "string" &&
              blockDelta.thinking
            ) {
              // Surface Claude's extended thinking live as ordinary assistant
              // text, in its own message (keyed by content-block index) so it
              // stays separate from the response and from other reasoning
              // steps — matching the reloaded transcript. Thinking streams
              // before the response, so timeline ordering is preserved.
              request.emit({
                id: randomUUID(),
                type: "message.delta",
                sessionId: request.sessionId,
                messageId: `${messageId}-thinking-${blockIndex}`,
                delta: blockDelta.thinking
              });
            }
          }

          continue;
        }

        if (message.type === "system" && message.subtype === "compact_boundary") {
          const compactToolId = `${request.sessionId}-claude-compact-${Date.now()}`;
          request.session.compactionSummaries = [
            ...(request.session.compactionSummaries ?? []),
            {
              id: `${request.session.id}-claude-boundary-${Date.now()}`,
              provider: "claude" as const,
              contextVersion: request.session.contextVersion ?? 0,
              createdAt: new Date().toISOString(),
              trigger: message.compact_metadata.trigger,
              preTokens: message.compact_metadata.pre_tokens,
              postTokens: message.compact_metadata.post_tokens,
              summary: "Claude compacted its provider-local context."
            }
          ].slice(-12);
          request.emit({
            id: randomUUID(),
            type: "tool.started",
            sessionId: request.sessionId,
            toolId: compactToolId,
            label: "Claude compacted context",
            detail: {
              id: `${compactToolId}-detail`,
              label: "Claude compacted provider-local context",
              kind: "summary",
              tone: "summary",
              action: "other",
              args: {
                trigger: message.compact_metadata.trigger,
                preTokens: String(message.compact_metadata.pre_tokens),
                ...(message.compact_metadata.post_tokens
                  ? { postTokens: String(message.compact_metadata.post_tokens) }
                  : {})
              }
            }
          });
          request.emit({
            id: randomUUID(),
            type: "tool.completed",
            sessionId: request.sessionId,
            toolId: compactToolId
          });
          continue;
        }

        if (message.type === "assistant") {
          for (const block of message.message.content) {
            const record = block as unknown as JsonRecord;

            if (
              record.type === "text" &&
              typeof record.text === "string" &&
              !hasEmittedText(emittedText, record.text)
            ) {
              emittedText += record.text;
              request.emit({
                id: randomUUID(),
                type: "message.delta",
                sessionId: request.sessionId,
                messageId,
                delta: record.text
              });
            }

            if (record.type === "tool_use") {
              const toolId = typeof record.id === "string" ? record.id : randomUUID();
              const name = typeof record.name === "string" ? record.name : "tool";
              request.emit({
                id: randomUUID(),
                type: "tool.started",
                sessionId: request.sessionId,
                toolId,
                label: `Use ${name}`,
                detail: toolDetail(toolId, name, asRecord(record.input))
              });
            }
          }
          continue;
        }

        if (message.type === "result") {
          if (message.subtype !== "success") {
            request.emit({
              id: randomUUID(),
              type: "error",
              sessionId: request.sessionId,
              message: claudeResultErrorMessage(message)
            });
          } else if (message.result && !hasEmittedText(emittedText, message.result)) {
            const delta = remainingClaudeResultText(emittedText, message.result);
            emittedText += delta;
            request.emit({
              id: randomUUID(),
              type: "message.delta",
              sessionId: request.sessionId,
              messageId,
              delta
            });
          }

          request.emit({
            id: randomUUID(),
            type: "message.completed",
            sessionId: request.sessionId,
            messageId
          });
          request.emit({
            id: randomUUID(),
            type: "turn.completed",
            sessionId: request.sessionId,
            turnId,
            status: message.subtype === "success" ? "idle" : "error"
          });
        }
      }
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
      this.active.delete(request.sessionId);
    }
  }

  async interrupt(sessionId: string) {
    const active = this.active.get(sessionId);
    active?.abortController.abort();
    await active?.query?.interrupt().catch(() => undefined);
  }

  dispose() {
    for (const active of this.active.values()) {
      active.abortController.abort();
      active.query?.close();
    }

    this.active.clear();
  }
}

function claudeResultErrorMessage(message: Extract<SDKMessage, { type: "result" }>) {
  const errors =
    "errors" in message && Array.isArray(message.errors)
      ? message.errors.filter((item): item is string => typeof item === "string")
      : [];

  if (errors.length) {
    return errors.join("\n");
  }

  return "Claude stopped before returning a response.";
}

function claudeEnvironment() {
  return desktopCliEnvironment({
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: "composer/0.1.0"
  });
}

function claudeModel(model: string | undefined) {
  return model?.startsWith("claude-") ? model : "claude-sonnet-4-6";
}

function claudeApproval({
  toolName,
  input,
  context,
  sessionId,
  turnId
}: {
  toolName: string;
  input: JsonRecord;
  context: Parameters<CanUseTool>[2];
  sessionId: string;
  turnId: string;
}): Omit<ApprovalRequest, "id"> {
  const title =
    context.title ??
    context.displayName ??
    (toolName === "AskUserQuestion"
      ? "Claude has a question"
      : `Claude wants to use ${toolName}`);

  return {
    provider: "claude",
    sessionId,
    turnId,
    kind: toolName === "AskUserQuestion" ? "question" : toolKind(toolName),
    title,
    details: {
      tool: toolName,
      ...(context.description ? { description: context.description } : {}),
      ...stringifyDetails(input)
    },
    availableDecisions: ["accept", "decline", "cancel"]
  };
}

function claudeCompactPrompt(reason: string) {
  return [
    "/compact Prepare this Claude Code session for a Composer multi-provider handoff.",
    "Preserve the session goal, current user intent, important decisions, files changed, commands and tests run, unresolved risks, and what the next provider must know.",
    `Reason: ${reason}.`
  ].join(" ");
}

function recordClaudeCompaction(
  session: SessionContent,
  compaction: {
    id: string;
    contextVersion: number;
    trigger?: "manual" | "auto";
    summary: string;
    preTokens?: number;
    postTokens?: number;
  }
) {
  const summary: SessionCompactionSummary = {
    ...compaction,
    provider: "claude" as const,
    source: "claude-post-compact",
    createdAt: new Date().toISOString()
  };
  session.compactionSummaries = [
    ...(session.compactionSummaries ?? []),
    summary
  ].slice(-12);
  return summary;
}

function answerClaudeQuestion(input: JsonRecord) {
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const answers: Record<string, string> = {};

  for (const question of questions) {
    const record = asRecord(question);
    const questionText = typeof record.question === "string" ? record.question : "";
    const options = Array.isArray(record.options) ? record.options : [];
    const first = asRecord(options[0]);
    const label = typeof first.label === "string" ? first.label : "Continue";

    if (questionText) {
      answers[questionText] = label;
    }
  }

  return { ...input, answers };
}

// Parse a Claude AskUserQuestion tool input into Composer's QuestionItem[] for
// the UI. Each question is keyed by index within the turn so answers map back.
function parseClaudeQuestions(
  input: JsonRecord,
  sessionId: string,
  turnId: string
): QuestionItem[] {
  const questions = Array.isArray(input.questions) ? input.questions : [];

  return questions
    .map((raw, index): QuestionItem | null => {
      const record = asRecord(raw);
      const question = typeof record.question === "string" ? record.question : "";
      if (!question) {
        return null;
      }

      const options: QuestionItem["options"] = [];
      for (const option of Array.isArray(record.options) ? record.options : []) {
        const optionRecord = asRecord(option);
        const label = typeof optionRecord.label === "string" ? optionRecord.label : "";
        if (!label) {
          continue;
        }
        options.push({
          label,
          description:
            typeof optionRecord.description === "string"
              ? optionRecord.description
              : undefined
        });
      }

      return {
        id: `${sessionId}-${turnId}-q${index}`,
        question,
        header: typeof record.header === "string" ? record.header : undefined,
        multiSelect: record.multiSelect === true,
        // The engines always allow a custom "Other" answer.
        allowCustom: true,
        options
      };
    })
    .filter((question): question is QuestionItem => question !== null);
}

// Inject the user's selections into the tool input as the answers map the SDK
// reads (keyed by question text), so Claude proceeds with the chosen options.
function applyClaudeAnswers(
  input: JsonRecord,
  questions: QuestionItem[],
  answers: QuestionAnswer[]
) {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer.selected]));
  const result: Record<string, string> = {};

  for (const question of questions) {
    const selected = byId.get(question.id) ?? [];
    const value = selected.length > 0
      ? selected.join(", ")
      : question.options[0]?.label ?? "Continue";
    result[question.question] = value;
  }

  return { ...input, answers: result };
}

function toolKind(toolName: string): ApprovalRequest["kind"] {
  if (toolName === "Bash") {
    return "command";
  }

  if (toolName === "Edit" || toolName === "Write" || toolName === "MultiEdit") {
    return "file_change";
  }

  return "tool";
}

function mapPermissionMode(mode: PermissionMode) {
  if (mode === "Full access") {
    // acceptEdits (not bypassPermissions) so canUseTool is still invoked — Full
    // access is granted there. bypassPermissions would skip canUseTool and break
    // AskUserQuestion interception.
    return "acceptEdits" as const;
  }

  if (mode === "Auto-review") {
    return "auto" as const;
  }

  return "default" as const;
}

function mapEffort(mode: IntelligenceMode) {
  if (mode === "Low") {
    return "low" as const;
  }

  if (mode === "Medium") {
    return "medium" as const;
  }

  if (mode === "Extra High") {
    return "xhigh" as const;
  }

  return "high" as const;
}

function claudePrompt(
  prompt: string,
  imageAttachments: Parameters<AgentProvider["run"]>[0]["imageAttachments"] = []
): string | AsyncIterable<SDKUserMessage> {
  const imageBlocks: JsonRecord[] = [];

  for (const attachment of imageAttachments) {
    const block = dataUrlImageBlock(attachment.dataUrl, attachment.mediaType);

    if (block) {
      imageBlocks.push(block);
    }
  }

  if (imageBlocks.length === 0) {
    const imagePaths = imageAttachments
      .map((attachment) => attachment.path)
      .filter((path): path is string => Boolean(path));

    return imagePaths.length > 0
      ? `${prompt}\n\nAttached image paths:\n${imagePaths.join("\n")}`
      : prompt;
  }

  async function* messages(): AsyncIterable<SDKUserMessage> {
    yield {
      type: "user",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...imageBlocks
        ]
      }
    } as unknown as SDKUserMessage;
  }

  return messages();
}

function dataUrlImageBlock(dataUrl?: string, fallbackMediaType = "image/png") {
  if (!dataUrl) {
    return null;
  }

  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);

  if (!match) {
    return null;
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: match[1] || fallbackMediaType,
      data: match[2]
    }
  };
}

function hasEmittedText(emittedText: string, candidate: string) {
  const emitted = emittedText.trim();
  const value = candidate.trim();

  if (!value || !emitted) {
    return false;
  }

  return emitted === value || emitted.includes(value) || value.includes(emitted);
}

function remainingClaudeResultText(emittedText: string, result: string) {
  if (!emittedText) {
    return result;
  }

  return result.startsWith(emittedText)
    ? result.slice(emittedText.length)
    : result;
}

function sessionIdFromMessage(message: SDKMessage) {
  return "session_id" in message && typeof message.session_id === "string"
    ? message.session_id
    : undefined;
}

function cwdFromMessage(message: SDKMessage) {
  return message.type === "system" &&
    "cwd" in message &&
    typeof message.cwd === "string"
    ? message.cwd
    : undefined;
}

export function applyClaudeNativeWorktreeOption(
  options: Pick<Options, "extraArgs" | "resume">,
  session: Pick<SessionContent, "nativeWorktreeName">,
  resumeSessionId?: string
) {
  if (resumeSessionId) {
    options.resume = resumeSessionId;
    return;
  }

  if (!session.nativeWorktreeName) {
    return;
  }

  options.extraArgs = {
    ...(options.extraArgs ?? {}),
    worktree: session.nativeWorktreeName
  };
}

function toolDetail(id: string, toolName: string, input: JsonRecord): ToolDetail {
  const command = typeof input.command === "string" ? input.command : undefined;
  const reviewFiles = reviewFilesFromToolCall(toolName, input);
  const hasReviewFiles = reviewFiles.length > 0;
  const isEditTool =
    toolName === "Edit" || toolName === "Write" || toolName === "MultiEdit";

  return {
    id,
    label: hasReviewFiles
      ? patchReviewLabel(reviewFiles)
      : command
        ? `Run ${command}`
        : `Use ${toolName}`,
    toolName,
    kind: "call",
    tone: command && !hasReviewFiles ? "command" : "default",
    action: hasReviewFiles || isEditTool ? "edit" : command ? "command" : "other",
    command: hasReviewFiles ? undefined : command,
    args: stringifyDetails(input),
    path: reviewFiles[0]?.path ?? toolPath(input),
    reviewFiles: hasReviewFiles ? reviewFiles : undefined
  };
}

function toolPath(input: JsonRecord) {
  return (
    asString(input.file_path) ??
    asString(input.path) ??
    asString(input.abs_path) ??
    asString(input.filename)
  );
}

function stringifyDetails(record: JsonRecord) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined && value !== null)
      .slice(0, 12)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value).slice(0, 600)
      ])
  );
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
