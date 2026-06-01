import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import {
  asRecord,
  asString,
  createToolCallDetail,
  createToolOutputDetail,
  extractText,
  finishSession,
  findJsonlPaths,
  formatTime,
  isHiddenHandoffTranscriptText,
  isInformativeOutputDetail,
  isoFromMtime,
  latestTimestamp,
  readJsonl,
  readJsonlPreview,
  statJsonlPaths,
  subagentTitle,
  titleFromCwd,
  titleFromPath,
  titleFromText,
  trimText,
  userVisiblePrompt,
  type ConversationItem,
  type SessionContent,
  type SubagentMetadata
} from "./shared.js";

export async function parseClaudeSession(
  filePath: string,
  options: { includeItems: boolean } = { includeItems: true }
): Promise<SessionContent | null> {
  const includeItems = options.includeItems;
  const rows = includeItems ? await readJsonl(filePath) : await readJsonlPreview(filePath);
  const fileSessionId = path.basename(filePath, ".jsonl");
  const pathSubagent = claudeSubagentFromPath(filePath);
  let sessionId = pathSubagent?.metadata.id ?? fileSessionId;
  let parentSessionId = pathSubagent?.parentProviderSessionId
    ? `claude-${pathSubagent.parentProviderSessionId}`
    : undefined;
  let subagent = pathSubagent?.metadata;
  let cwd: string | undefined = cwdFromClaudeProjectPath(filePath);
  let model: string | undefined;
  let updatedAt = includeItems ? latestTimestamp(rows) ?? await isoFromMtime(filePath) : await isoFromMtime(filePath);
  let firstUserText = "";
  const items: ConversationItem[] = [];
  const toolGroupsByCallId = new Map<string, { itemIndex: number }>();
  let toolIndex = 0;

  for (const row of rows) {
    const rowTimestamp = asString(row.timestamp);
    const rowSessionId = asString(row.sessionId);
    const rowAgentId = asString(row.agentId);
    const isSidechain = row.isSidechain === true || Boolean(subagent);

    if (isSidechain) {
      if (rowSessionId) {
        parentSessionId = `claude-${rowSessionId}`;
      }

      if (rowAgentId && !subagent?.id) {
        sessionId = rowAgentId;
      }

      const attributionAgent = asString(row.attributionAgent);
      subagent = {
        ...subagent,
        id: subagent?.id ?? rowAgentId ?? sessionId,
        type: subagent?.type ?? attributionAgent
      };
    } else {
      sessionId = rowSessionId ?? sessionId;
    }

    cwd = asString(row.cwd) ?? cwd;
    if (includeItems) {
      updatedAt = rowTimestamp ?? updatedAt;
    }

    if (row.type === "permission-mode") {
      // Claude permission mode rows are runtime metadata. They are useful for
      // execution, but noisy when replaying a conversation transcript.
      continue;
    }

    if (row.type === "user") {
      const message = asRecord(row.message);
      const content = message.content;

      if (typeof content === "string") {
        if (isHiddenHandoffTranscriptText(content)) {
          continue;
        }

        firstUserText ||= content;
        if (includeItems) {
          items.push({
            id: `${sessionId}-user-${items.length}`,
            type: "user_message",
            body: trimText(userVisiblePrompt(content)),
            timestamp: formatTime(rowTimestamp),
            sortTimestamp: rowTimestamp
          });
        }
      } else if (Array.isArray(content)) {
        const hasToolResult = content.some((part) => {
          const block = asRecord(part);
          return asString(block.type) === "tool_result";
        });

        if (!hasToolResult) {
          const userText = extractText(content);

          if (userText) {
            if (isHiddenHandoffTranscriptText(userText)) {
              continue;
            }

            firstUserText ||= userText;
            if (includeItems) {
              items.push({
                id: `${sessionId}-user-${items.length}`,
                type: "user_message",
                body: trimText(userVisiblePrompt(userText)),
                timestamp: formatTime(rowTimestamp),
                sortTimestamp: rowTimestamp
              });
            }
          }

          continue;
        }

        if (!includeItems) {
          continue;
        }

        for (const part of content) {
          const block = asRecord(part);

          if (asString(block.type) !== "tool_result") {
            continue;
          }

          const resultText = extractText(block.content);

          if (!resultText || isHiddenHandoffTranscriptText(resultText)) {
            continue;
          }

          toolIndex += 1;
          const detail = createToolOutputDetail(
            `${sessionId}-tool-result-${toolIndex}-detail`,
            resultText
          );

          if (!isInformativeOutputDetail(detail)) {
            continue;
          }

          const toolUseId = asString(block.tool_use_id);
          const existing = toolUseId ? toolGroupsByCallId.get(toolUseId) : undefined;

          if (existing) {
            const item = items[existing.itemIndex];

            if (item?.type === "tool_group") {
              item.details.push(detail);
              item.status = detail.status === "failed" ? "failed" : item.status;
              continue;
            }
          }

          items.push({
            id: `${sessionId}-tool-result-${toolIndex}`,
            type: "tool_group",
            summary: detail.label,
            details: [detail],
            sortTimestamp: rowTimestamp,
            defaultOpen: false
          });
        }
      }
      continue;
    }

    if (row.type === "assistant") {
      const message = asRecord(row.message);
      model = asString(message.model) ?? model;
      const content = message.content;

      if (!Array.isArray(content)) {
        continue;
      }

      for (const block of content) {
        const contentBlock = asRecord(block);
        const blockType = asString(contentBlock.type);

        if (blockType === "text") {
          const body = asString(contentBlock.text);

          if (body && isHiddenHandoffTranscriptText(body)) {
            continue;
          }

          if (includeItems && body) {
            items.push({
              id: `${sessionId}-assistant-${items.length}`,
              type: "assistant_message",
              body: trimText(body),
              sortTimestamp: rowTimestamp
            });
          }
        } else if (blockType === "thinking") {
          // Claude thinking blocks are internal reasoning state, not
          // user-visible assistant transcript content.
          continue;
        } else if (includeItems && blockType === "tool_use") {
          toolIndex += 1;
          const name = asString(contentBlock.name) ?? "tool";
          const input = asRecord(contentBlock.input);
          const detail = createToolCallDetail(
            `${sessionId}-tool-${toolIndex}-call`,
            name,
            input
          );

          items.push({
            id: `${sessionId}-tool-${toolIndex}`,
            type: "tool_group",
            summary: detail.label,
            details: [detail],
            sortTimestamp: rowTimestamp,
            defaultOpen: false
          });

          const toolUseId = asString(contentBlock.id);

          if (toolUseId) {
            toolGroupsByCallId.set(toolUseId, { itemIndex: items.length - 1 });
          }
        }
      }
      continue;
    }

    if (row.type === "attachment") {
      // Claude attachment rows are runtime metadata rather than user-visible
      // message attachments, so they are intentionally not rendered.
      continue;
    }
  }

  return finishSession({
    id: `claude-${sessionId}`,
    provider: "claude",
    providerSessionId: sessionId,
    renderMode: "single",
    parentSessionId,
    subagent,
    contentLoaded: includeItems,
    title:
      subagentTitle(subagent) ??
      titleFromText(firstUserText) ??
      titleFromCwd(cwd) ??
      titleFromPath(filePath),
    updatedAt,
    cwd,
    model,
    items
  });
}

function claudeSubagentFromPath(filePath: string):
  | { parentProviderSessionId: string; metadata: SubagentMetadata }
  | undefined {
  const subagentsDir = `${path.sep}subagents${path.sep}`;
  const markerIndex = filePath.indexOf(subagentsDir);

  if (markerIndex === -1) {
    return undefined;
  }

  const beforeSubagents = filePath.slice(0, markerIndex);
  const parentProviderSessionId = path.basename(beforeSubagents);
  const id = path.basename(filePath, ".jsonl");

  if (!parentProviderSessionId || !id) {
    return undefined;
  }

  return {
    parentProviderSessionId,
    metadata: {
      id
    }
  };
}

export async function findClaudeProjectJsonl(projectsRoot: string) {
  // Batch the unavoidable per-file stats with a bounded pool rather than
  // statting each serially while enumerating.
  return statJsonlPaths(await findClaudeProjectJsonlPaths(projectsRoot));
}

// Path-only enumeration (no mtime stats). Used on the single-file open path
// where only the matching file path is needed.
export async function findClaudeProjectJsonlPaths(projectsRoot: string) {
  const paths: string[] = [];

  let projectDirs: Dirent[];

  try {
    projectDirs = await fs.readdir(projectsRoot, { withFileTypes: true });
  } catch {
    return paths;
  }

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) {
      continue;
    }

    const dir = path.join(projectsRoot, projectDir.name);
    let entries: Dirent[];

    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        paths.push(fullPath);
      } else if (entry.isDirectory()) {
        for (const nestedPath of await findJsonlPaths(fullPath)) {
          paths.push(nestedPath);
        }
      }
    }
  }

  return paths;
}

function cwdFromClaudeProjectPath(filePath: string) {
  const projectDir = path.basename(path.dirname(filePath));

  if (!projectDir.startsWith("-")) {
    return undefined;
  }

  return projectDir.replace(/^-/, "/").replaceAll("-", "/");
}
