import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  patchReviewLabel,
  reviewFileFromCodexChange
} from "../patch-review.js";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  createToolCallDetail,
  createToolOutputDetail,
  extractText,
  finishSession,
  FILE_SCAN_CONCURRENCY,
  formatTime,
  inferMediaType,
  isBackgroundBranchNamePrompt,
  isInformativeOutputDetail,
  isoFromMtime,
  latestTimestamp,
  mapWithConcurrency,
  parseToolInput,
  readJsonl,
  readJsonlPreview,
  subagentTitle,
  titleFromPath,
  titleFromText,
  trimText,
  userVisiblePrompt,
  type ConversationAttachment,
  type ConversationItem,
  type JsonRecord,
  type SessionContent,
  type SubagentMetadata,
  type ToolDetail
} from "./shared.js";

export async function parseCodexSession(
  filePath: string,
  index: Map<string, { title: string; updatedAt?: string }>,
  options: { includeItems: boolean } = { includeItems: true }
): Promise<SessionContent | null> {
  const includeItems = options.includeItems;
  const rows = includeItems ? await readJsonl(filePath) : await readJsonlPreview(filePath);
  let id = codexIdFromPath(filePath);
  let cwd: string | undefined;
  let model: string | undefined;
  let updatedAt = latestTimestamp(rows) ?? await isoFromMtime(filePath);
  let title = "";
  const items: ConversationItem[] = [];
  const toolGroupsByCallId = new Map<
    string,
    { itemIndex: number; detailIndex: number }
  >();
  let toolIndex = 0;
  let firstRawUserText = "";
  let firstUserText = "";
  let parentSessionId: string | undefined;
  let subagent: SubagentMetadata | undefined;

  for (const row of rows) {
    const type = asString(row.type);
    const payload = asRecord(row.payload);
    const timestamp = asString(row.timestamp);

    if (timestamp) {
      updatedAt = timestamp;
    }

    if (type === "session_meta") {
      id = asString(payload.id) ?? id;
      cwd = asString(payload.cwd) ?? cwd;
      const subagentThread = codexSubagentThread(payload);

      if (subagentThread) {
        parentSessionId = `codex-${subagentThread.parentProviderSessionId}`;
        subagent = subagentThread.metadata;
      }
      continue;
    }

    if (type === "turn_context") {
      model = asString(payload.model) ?? model;
      cwd = asString(payload.cwd) ?? cwd;
      continue;
    }

    if (type === "event_msg") {
      const eventType = asString(payload.type);

      if (eventType === "user_message") {
        const rawBody =
          asString(payload.message) ??
          asString(payload.text) ??
          extractText(payload.content);

        if (rawBody) {
          firstRawUserText ||= rawBody;
          const parsedMessage = parseCodexUserMessage(
            rawBody,
            `${id}-user-${items.length}`,
            // Reading + base64-encoding local images is only needed when the
            // resulting attachment_group is actually emitted. During list/preview
            // (includeItems === false) the attachments are discarded, so skip the
            // filesystem work entirely.
            includeItems ? await imageUrlsFromPayload(payload) : []
          );

          if (includeItems && parsedMessage.attachments.length > 0) {
            items.push({
              id: `${id}-user-attachments-${items.length}`,
              type: "attachment_group",
              attachments: parsedMessage.attachments
            });
          }

          firstUserText ||= parsedMessage.body;
          if (includeItems) {
            items.push({
              id: `${id}-user-${items.length}`,
              type: "user_message",
              body: trimText(parsedMessage.body),
              timestamp: formatTime(timestamp),
              sortTimestamp: timestamp
            });
          }
        }
      }

      if (includeItems && eventType === "patch_apply_end") {
        const callId = asString(payload.call_id);
        const changes = asRecord(payload.changes);
        const reviewFiles = Object.entries(changes)
          .map(([filePath, change]) => {
            const record = asRecord(change);

            return reviewFileFromCodexChange(filePath, {
              type: asString(record.type),
              kind: asString(record.kind),
              unified_diff: asString(record.unified_diff),
              diff: asString(record.diff),
              content: asString(record.content),
              move_path: asString(record.move_path)
            });
          });

        if (reviewFiles.length > 0) {
          const label = patchReviewLabel(reviewFiles);
          const existing = callId ? toolGroupsByCallId.get(callId) : undefined;

          if (existing) {
            const item = items[existing.itemIndex];

            if (item?.type === "tool_group") {
              const detail = item.details[existing.detailIndex];
              item.summary = label;
              item.sortTimestamp = timestamp ?? item.sortTimestamp;
              detail.label = label;
              detail.tone = "default";
              detail.toolName = "Apply Patch";
              detail.action = "edit";
              detail.command = undefined;
              detail.path = reviewFiles[0]?.path;
              detail.reviewFiles = reviewFiles;
            }

            continue;
          }

          toolIndex += 1;
          const detail: ToolDetail = {
            id: `${id}-tool-${toolIndex}-patch`,
            kind: "call",
            label,
            tone: "default",
            toolName: "Apply Patch",
            action: "edit",
            path: reviewFiles[0]?.path,
            reviewFiles
          };

          items.push({
            id: `${id}-tool-${toolIndex}`,
            type: "tool_group",
            summary: detail.label,
            details: [detail],
            sortTimestamp: timestamp,
            defaultOpen: false
          });
        }
      }

      continue;
    }

    if (type !== "response_item") {
      continue;
    }

    const payloadType = asString(payload.type);
    const role = asString(payload.role);

    if (payloadType === "message") {
      const body = extractText(payload.content);

      if (!body) {
        continue;
      }

      if (includeItems && role === "assistant") {
        items.push({
          id: `${id}-assistant-${items.length}`,
          type: "assistant_message",
          body: trimText(body),
          sortTimestamp: timestamp
        });
      }
      continue;
    }

    if (payloadType === "reasoning") {
      // Codex reasoning records are runtime/internal state. Historical
      // transcript rendering should not show them as standalone messages.
      continue;
    }

    if (
      includeItems &&
      (payloadType === "function_call" ||
        payloadType === "custom_tool_call" ||
        payloadType === "image_generation_call")
    ) {
      toolIndex += 1;
      const name = asString(payload.name) ?? "tool";
      const input = parseToolInput(payload);
      const detail = createToolCallDetail(
        `${id}-tool-${toolIndex}-call`,
        name,
        input,
        payloadType === "image_generation_call" ? "generate" : undefined
      );

      items.push({
        id: `${id}-tool-${toolIndex}`,
        type: "tool_group",
        summary: detail.label,
        details: [detail],
        sortTimestamp: timestamp,
        defaultOpen: false
      });
      const callId = asString(payload.call_id);

      if (callId) {
        toolGroupsByCallId.set(callId, {
          itemIndex: items.length - 1,
          detailIndex: 0
        });
      }
      continue;
    }

    if (
      includeItems &&
      (payloadType === "function_call_output" ||
        payloadType === "custom_tool_call_output")
    ) {
      toolIndex += 1;
      const detail = createToolOutputDetail(
        `${id}-tool-output-${toolIndex}-detail`,
        asString(payload.output) ?? ""
      );

      if (!isInformativeOutputDetail(detail)) {
        continue;
      }

      items.push({
        id: `${id}-tool-output-${toolIndex}`,
        type: "tool_group",
        summary: detail.label,
        details: [detail],
        sortTimestamp: timestamp,
        defaultOpen: false
      });
    }
  }

  const indexed = index.get(id);
  if (isBackgroundBranchNamePrompt(firstRawUserText) || isCodexChatSessionCwd(cwd)) {
    return null;
  }

  title =
    subagentTitle(subagent) ??
    indexed?.title ??
    titleFromText(firstUserText) ??
    titleFromPath(filePath);
  updatedAt = indexed?.updatedAt ?? updatedAt;

  return finishSession({
    id: `codex-${id}`,
    provider: "codex",
    providerSessionId: id,
    renderMode: "single",
    parentSessionId,
    subagent,
    contentLoaded: includeItems,
    title,
    updatedAt,
    cwd,
    model,
    items
  });
}

export async function readCodexIndex(codexRoot: string) {
  const index = new Map<string, { title: string; updatedAt?: string }>();
  const indexPath = path.join(codexRoot, "session_index.jsonl");

  for (const row of await readJsonl(indexPath)) {
    const id = asString(row.id);
    const title = asString(row.thread_name);

    if (id && title) {
      index.set(id, {
        title,
        updatedAt: asString(row.updated_at)
      });
    }
  }

  return index;
}

function codexSubagentThread(payload: JsonRecord):
  | { parentProviderSessionId: string; metadata: SubagentMetadata }
  | undefined {
  const source = asRecord(payload.source);
  const sourceSubagent = asRecord(source.subagent);
  const threadSpawn = asRecord(sourceSubagent.thread_spawn);
  const parentProviderSessionId = asString(threadSpawn.parent_thread_id);
  const threadSource = asString(payload.thread_source);

  if (!parentProviderSessionId && threadSource !== "subagent") {
    return undefined;
  }

  const metadata: SubagentMetadata = {
    id: asString(threadSpawn.agent_path) ?? asString(payload.agent_path),
    nickname:
      asString(threadSpawn.agent_nickname) ?? asString(payload.agent_nickname),
    role: asString(threadSpawn.agent_role) ?? asString(payload.agent_role),
    depth: asNumber(threadSpawn.depth) ?? asNumber(payload.depth)
  };

  return parentProviderSessionId
    ? { parentProviderSessionId, metadata }
    : undefined;
}

function parseCodexUserMessage(
  value: string,
  idPrefix: string,
  imageUrls: string[] = []
) {
  const visibleValue = userVisiblePrompt(value);
  const requestMarker = value.match(/^##\s+My request for Codex:\s*$/m);

  if (!/^#\s+Files mentioned by the user:/m.test(value) || !requestMarker) {
    return {
      body: visibleValue,
      attachments: [] as ConversationAttachment[]
    };
  }

  const requestStart = (requestMarker.index ?? 0) + requestMarker[0].length;
  const filesSection = value.slice(0, requestMarker.index).trim();
  const requestBody = userVisiblePrompt(value.slice(requestStart).trim());
  const attachments: ConversationAttachment[] = [];

  for (const line of filesSection.split("\n")) {
    const match = line.match(/^##\s+(.+?):\s+(.+)$/);

    if (!match) {
      continue;
    }

    const [, label, filePath] = match;
    attachments.push({
      id: `${idPrefix}-attachment-${attachments.length + 1}`,
      type: "file",
      filename: label.trim(),
      mediaType: inferMediaType(label.trim() || filePath.trim()),
      url: imageUrls[attachments.length]
    });
  }

  return {
    body: requestBody || value,
    attachments
  };
}

async function imageUrlsFromPayload(payload: JsonRecord) {
  const urls: string[] = [];

  for (const image of asArray(payload.images)) {
    const url = asString(image);

    if (url) {
      urls.push(url);
    }
  }

  const localImages = asArray(payload.local_images);

  if (localImages.length > 0) {
    // Bound concurrency so a message with many inline images does not open an
    // unbounded number of file handles at once.
    const dataUrls = await mapWithConcurrency(
      localImages,
      FILE_SCAN_CONCURRENCY,
      (image) => localImageToDataUrl(image)
    );

    for (const url of dataUrls) {
      if (url) {
        urls.push(url);
      }
    }
  }

  return urls;
}

async function localImageToDataUrl(value: unknown) {
  const filePath =
    typeof value === "string"
      ? value
      : asString(asRecord(value).path) ?? asString(asRecord(value).filePath);

  if (!filePath) {
    return undefined;
  }

  try {
    const bytes = await fs.readFile(filePath);
    return `data:${inferMediaType(filePath)};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export function isCodexChatSessionCwd(cwd?: string) {
  if (!cwd) {
    return false;
  }

  const relative = path.relative(
    path.join(os.homedir(), "Documents", "Codex"),
    path.resolve(cwd)
  );

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }

  const [dateSegment, slugSegment, ...rest] = relative.split(path.sep);

  return Boolean(
    dateSegment?.match(/^\d{4}-\d{2}-\d{2}$/) &&
      slugSegment &&
      rest.length === 0
  );
}

export function codexIdFromPath(filePath: string) {
  const basename = path.basename(filePath);
  const match = basename.match(
    /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/
  );

  return match?.[1] ?? path.basename(filePath, ".jsonl");
}
