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

import type { AgentProvider } from "../runtime.js";
import { defaultCwd, providerSessionId } from "../runtime.js";
import type {
  ApprovalDecision,
  ApprovalRequest,
  IntelligenceMode,
  PermissionMode,
  SessionContent,
  ToolDetail
} from "../../src/types.js";

type JsonRecord = Record<string, unknown>;

export class ClaudeProvider implements AgentProvider {
  private active = new Map<string, { abortController: AbortController; query?: Query }>();

  async compact(request: Parameters<NonNullable<AgentProvider["compact"]>>[0]) {
    const abortController = new AbortController();
    const compactToolId = `${request.sessionId}-claude-handoff-compact-${Date.now()}`;
    let recordedSummary = false;

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
    const options: Options = {
      cwd: defaultCwd(request.session),
      abortController,
      permissionMode: mapPermissionMode(request.settings.permissionMode),
      allowDangerouslySkipPermissions: request.settings.permissionMode === "Full access",
      effort: mapEffort(request.settings.intelligence),
      model: request.settings.model,
      hooks: {
        PostCompact: [
          {
            hooks: [
              async (input: HookInput) => {
                if (input.hook_event_name === "PostCompact") {
                  recordedSummary = true;
                  recordClaudeCompaction(request.session, {
                    id: `${request.session.id}-claude-compact-${Date.now()}`,
                    contextVersion: request.session.contextVersion ?? 0,
                    trigger: input.trigger,
                    summary: input.compact_summary
                  });
                }

                return { continue: true };
              }
            ]
          }
        ]
      },
      env: {
        ...process.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: "composer/0.1.0"
      }
    };

    if (resumeSessionId) {
      options.resume = resumeSessionId;
    }

    const claudeQuery = query({
      prompt: claudeCompactPrompt(request.reason),
      options
    });
    this.active.set(request.sessionId, { abortController, query: claudeQuery });

    try {
      for await (const message of claudeQuery) {
        const sessionId = sessionIdFromMessage(message);

        if (sessionId) {
          request.session.providerSessionId = sessionId;
        }

        if (message.type === "system" && message.subtype === "compact_boundary") {
          recordClaudeCompaction(request.session, {
            id: `${request.session.id}-claude-boundary-${Date.now()}`,
            contextVersion: request.session.contextVersion ?? 0,
            trigger: message.compact_metadata.trigger,
            preTokens: message.compact_metadata.pre_tokens,
            postTokens: message.compact_metadata.post_tokens,
            summary: "Claude compacted its provider-local context for handoff."
          });
        }

        if (message.type === "result" && message.subtype !== "success") {
          throw new Error(message.errors.join("\n") || "Claude compaction failed");
        }
      }

      if (!recordedSummary) {
        recordClaudeCompaction(request.session, {
          id: `${request.session.id}-claude-compact-fallback-${Date.now()}`,
          contextVersion: request.session.contextVersion ?? 0,
          trigger: "manual",
          summary: `Claude compacted its provider-local context for ${request.reason}.`
        });
      }

      request.emit({
        id: randomUUID(),
        type: "tool.completed",
        sessionId: request.sessionId,
        toolId: compactToolId
      });
    } finally {
      this.active.delete(request.sessionId);
    }
  }

  async run(request: Parameters<AgentProvider["run"]>[0]) {
    const abortController = new AbortController();
    this.active.set(request.sessionId, { abortController });
    const turnId = randomUUID();
    const messageId = `${request.sessionId}-assistant-${turnId}`;
    let receivedDelta = false;

    request.emit({
      id: randomUUID(),
      type: "turn.started",
      sessionId: request.sessionId,
      turnId,
      label: "Claude is working"
    });

    const canUseTool: CanUseTool = async (toolName, input, context) => {
      const approval = claudeApproval({
        toolName,
        input,
        context,
        sessionId: request.sessionId,
        turnId
      });
      const decision = await request.askApproval(approval);

      if (decision === "accept" || decision === "acceptForSession") {
        return {
          behavior: "allow",
          updatedInput: toolName === "AskUserQuestion"
            ? answerClaudeQuestion(input)
            : input
        };
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
      allowDangerouslySkipPermissions: request.settings.permissionMode === "Full access",
      effort: mapEffort(request.settings.intelligence),
      model: request.settings.model,
      abortController,
      env: {
        ...process.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: "composer/0.1.0"
      }
    };

    if (resumeSessionId) {
      options.resume = resumeSessionId;
    }

    const claudeQuery = query({
      prompt: claudePrompt(request.prompt, request.imageAttachments),
      options
    });

    this.active.set(request.sessionId, { abortController, query: claudeQuery });

    try {
      for await (const message of claudeQuery) {
        const sessionId = sessionIdFromMessage(message);

        if (sessionId) {
          request.session.providerSessionId = sessionId;
        }

        if (message.type === "stream_event") {
          const delta = extractClaudeStreamDelta(message);

          if (delta) {
            receivedDelta = true;
            request.emit({
              id: randomUUID(),
              type: "message.delta",
              sessionId: request.sessionId,
              messageId,
              delta
            });
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

            if (record.type === "text" && typeof record.text === "string" && !receivedDelta) {
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
          } else if (!receivedDelta && message.result) {
            request.emit({
              id: randomUUID(),
              type: "message.delta",
              sessionId: request.sessionId,
              messageId,
              delta: message.result
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
  session.compactionSummaries = [
    ...(session.compactionSummaries ?? []),
    {
      ...compaction,
      provider: "claude" as const,
      createdAt: new Date().toISOString()
    }
  ].slice(-12);
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
    return "bypassPermissions" as const;
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

function extractClaudeStreamDelta(message: Extract<SDKMessage, { type: "stream_event" }>) {
  const event = message.event as unknown as JsonRecord;

  if (event.type !== "content_block_delta") {
    return "";
  }

  const delta = asRecord(event.delta);

  if (delta.type === "text_delta" && typeof delta.text === "string") {
    return delta.text;
  }

  return "";
}

function sessionIdFromMessage(message: SDKMessage) {
  return "session_id" in message && typeof message.session_id === "string"
    ? message.session_id
    : undefined;
}

function toolDetail(id: string, toolName: string, input: JsonRecord): ToolDetail {
  const command = typeof input.command === "string" ? input.command : undefined;

  return {
    id,
    label: command ? `Run ${command}` : `Use ${toolName}`,
    toolName,
    kind: "call",
    tone: command ? "command" : "default",
    action: command ? "command" : "other",
    command,
    args: stringifyDetails(input)
  };
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
