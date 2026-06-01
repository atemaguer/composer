import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import type { Dirent } from "node:fs";
import readline from "node:readline";
import path from "node:path";

import {
  patchReviewLabel,
  reviewFilesFromToolCall,
  type PatchReviewFile
} from "../patch-review.js";

export const FILE_SCAN_CONCURRENCY = 8;

/**
 * Runs `worker` over `items` with a bounded number of in-flight promises so a
 * large session directory does not spawn one filesystem/parse task per file at
 * once. Results are returned in the original input order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  const concurrency = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runner()));

  return results;
}

export function log(message: string) {
  // Session loading is best-effort; surface capacity warnings without throwing.
  console.warn(`[session-loader] ${message}`);
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export type SessionProvider = "codex" | "claude" | "meta";
export type ToolStatus = "running" | "completed" | "failed" | "cancelled";

export type ToolDetail = {
  id: string;
  label: string;
  tone?: "default" | "command" | "error" | "summary" | "output";
  kind?: "call" | "output" | "summary";
  toolName?: string;
  action?: "read" | "edit" | "search" | "command" | "generate" | "other";
  args?: Record<string, string>;
  command?: string;
  output?: string;
  path?: string;
  status?: ToolStatus;
  reviewFiles?: PatchReviewFile[];
};

export type ConversationAttachment = {
  id: string;
  type: "file" | "source-document";
  filename?: string;
  title?: string;
  mediaType?: string;
  url?: string;
};

export type ConversationItem =
  | {
      id: string;
      type: "user_message";
      body: string;
      timestamp?: string;
      sortTimestamp?: string;
      steered?: boolean;
    }
  | {
      id: string;
      type: "assistant_message";
      body: string;
      provider?: SessionProvider;
      sortTimestamp?: string;
    }
  | {
      id: string;
      type: "turn_status";
      label: string;
    }
  | {
      id: string;
      type: "tool_group";
      summary: string;
      details: ToolDetail[];
      provider?: SessionProvider;
      sortTimestamp?: string;
      defaultOpen?: boolean;
      status?: ToolStatus;
    }
  | {
      id: string;
      type: "running_tool";
      label: string;
      status: ToolStatus;
      details?: ToolDetail[];
    }
  | {
      id: string;
      type: "attachment_group";
      attachments: ConversationAttachment[];
      timestamp?: string;
    }
  | {
      id: string;
      type: "hook_event";
      label: string;
    }
  | {
      id: string;
      type: "notice";
      label: string;
    }
  | {
      id: string;
      type: "jump_marker";
      label?: string;
    }
  | {
      id: string;
      type: "parallel_thread_group";
      columns: Array<{
        provider: SessionProvider;
        title: string;
        items: ConversationItem[];
      }>;
      prompt?: string;
    };

export type SubagentMetadata = {
  id?: string;
  nickname?: string;
  role?: string;
  type?: string;
  depth?: number;
};

export type SessionRenderMode = "single" | "hybrid";

export type ProviderSessionState = {
  sessionId?: string;
  cwd?: string;
  lastContextVersion?: number;
};

export type SessionContent = {
  id: string;
  provider: SessionProvider;
  providerSessionId?: string;
  renderMode?: SessionRenderMode;
  parentSessionId?: string;
  subagent?: SubagentMetadata;
  providerSessions?: Partial<Record<SessionProvider, ProviderSessionState>>;
  contextVersion?: number;
  lastProvider?: SessionProvider;
  parallelAdoptedProvider?: "codex" | "claude";
  runtimeStatus?: "idle" | "running" | "awaiting_approval" | "error";
  contentLoaded?: boolean;
  title: string;
  updatedAt?: string;
  cwd?: string;
  displayCwd?: string;
  model?: string;
  items: ConversationItem[];
  pendingItems: Extract<ConversationItem, { type: "running_tool" }>[];
};

export type JsonRecord = Record<string, unknown>;

export const MAX_SESSIONS_PER_PROVIDER = 50;
export const MAX_TEXT_LENGTH = 4_000;
export const MAX_DETAIL_LENGTH = 520;

export function finishSession(session: Omit<SessionContent, "pendingItems">) {
  const hasSelfParent = session.parentSessionId === session.id;

  return {
    ...session,
    parentSessionId: hasSelfParent ? undefined : session.parentSessionId,
    subagent: hasSelfParent ? undefined : session.subagent,
    pendingItems: [],
    contentLoaded: session.contentLoaded ?? true
  } satisfies SessionContent;
}

export function subagentTitle(subagent?: SubagentMetadata) {
  if (!subagent) {
    return undefined;
  }

  const displayName = subagent.nickname ?? subagent.type;

  if (displayName) {
    return `${displayName} subagent`;
  }

  if (subagent.role) {
    return `${formatToolName(subagent.role)} subagent`;
  }

  return "Subagent";
}

export async function readJsonl(filePath: string) {
  const rows: JsonRecord[] = [];
  let stream: ReturnType<typeof createReadStream> | undefined;

  try {
    stream = createReadStream(filePath, { encoding: "utf8" });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

    // Stream line-by-line so peak transient memory is a single line rather than
    // the whole file plus a split() array copy.
    for await (const line of lines) {
      pushJsonlRow(rows, line);
    }

    return rows;
  } catch {
    return rows;
  } finally {
    stream?.destroy();
  }
}

export async function readJsonlPreview(filePath: string, maxBytes = 256 * 1024) {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;

  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    const chunk = buffer.subarray(0, bytesRead).toString("utf8");
    const lines = chunk.split("\n");

    if (bytesRead === maxBytes && !chunk.endsWith("\n")) {
      lines.pop();
    }

    return parseJsonlLines(lines);
  } catch {
    return [];
  } finally {
    await handle?.close();
  }
}

function parseJsonlLines(lines: string[]) {
  const rows: JsonRecord[] = [];

  for (const line of lines) {
    pushJsonlRow(rows, line);
  }

  return rows;
}

function pushJsonlRow(rows: JsonRecord[], line: string) {
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (parsed && typeof parsed === "object") {
      rows.push(parsed as JsonRecord);
    }
  } catch {
    // Individual malformed rows should not block the rest of the session.
  }
}

export async function findJsonl(root: string) {
  return statJsonlPaths(await findJsonlPaths(root));
}

// Path-only enumeration (no mtime stats). Used on the single-file open path
// where only the matching file path is needed and the mtimes would be
// discarded.
export async function findJsonlPaths(root: string) {
  const paths: string[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > 8) {
      return;
    }

    let entries: Dirent[];

    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        await walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        paths.push(fullPath);
      }
    }
  }

  await walk(root, 0);
  return paths;
}

// Batches the per-file mtime stats with a bounded concurrency pool instead of
// awaiting each stat serially during the directory walk.
export async function statJsonlPaths(paths: string[]) {
  return mapWithConcurrency(paths, FILE_SCAN_CONCURRENCY, async (fullPath) => ({
    fullPath,
    mtimeMs: await safeMtimeMs(fullPath)
  }));
}

export function selectSessionTree(sessions: SessionContent[], maxRootSessions: number) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const sortedSessions = [...sessions].sort(compareSessionsByUpdatedAt);
  const selectedRootIds = new Set<string>();
  let capped = false;

  for (const session of sortedSessions) {
    const parentSessionId = session.parentSessionId === session.id
      ? undefined
      : session.parentSessionId;
    const rootId =
      parentSessionId && byId.has(parentSessionId)
        ? parentSessionId
        : parentSessionId
          ? undefined
          : session.id;

    if (!rootId) {
      continue;
    }

    selectedRootIds.add(rootId);

    if (selectedRootIds.size >= maxRootSessions) {
      capped = true;
      break;
    }
  }

  if (capped) {
    // Never drop sessions silently: surface when the newest-first cap defers
    // older root sessions from the list.
    log(
      `Capped session list at ${maxRootSessions} root sessions (of ${sortedSessions.length} parsed); older sessions deferred.`
    );
  }

  return sortedSessions.filter(
    (session) =>
      selectedRootIds.has(session.id) ||
      (session.parentSessionId &&
        session.parentSessionId !== session.id &&
        selectedRootIds.has(session.parentSessionId))
  );
}

export function compareSessionsByUpdatedAt(a: SessionContent, b: SessionContent) {
  return sessionTimestamp(b) - sessionTimestamp(a);
}

export function sessionTimestamp(session?: Pick<SessionContent, "updatedAt">) {
  const timestamp = Date.parse(session?.updatedAt ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      const block = asRecord(part);
      const text = asString(block.text) ?? asString(block.input_text);
      const toolContent = block.content;

      if (text) {
        return text;
      }

      if (Array.isArray(toolContent)) {
        return extractText(toolContent);
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function parseToolInput(payload: JsonRecord): JsonRecord {
  const args = asString(payload.arguments) ?? asString(payload.input);

  if (!args) {
    return {};
  }

  try {
    return asRecord(JSON.parse(args));
  } catch {
    return { command: args };
  }
}

export function createToolCallDetail(
  id: string,
  toolName: string,
  input: JsonRecord,
  forcedAction?: ToolDetail["action"]
): ToolDetail {
  const action = forcedAction ?? inferToolAction(toolName, input);
  const toolInputText = extractToolCommand(input) ?? asString(input.input);
  const reviewFiles = action === "edit"
    ? reviewFilesFromToolCall(toolName, input, toolInputText)
    : [];
  const command = action === "edit" && reviewFiles.length > 0
    ? undefined
    : extractToolCommand(input);
  const pathValue = extractToolPath(input);
  const args = summarizeToolArguments(input, action, toolName);
  const label = reviewFiles.length > 0
    ? patchReviewLabel(reviewFiles)
    : buildToolCallLabel(toolName, action, input, command, pathValue);

  return {
    id,
    kind: "call",
    label,
    tone: command ? "command" : "default",
    toolName: formatToolName(toolName),
    action,
    args,
    command,
    path: pathValue ?? reviewFiles[0]?.path,
    reviewFiles: reviewFiles.length > 0 ? reviewFiles : undefined
  };
}

export function createToolOutputDetail(id: string, output: string): ToolDetail {
  const cleanedOutput = cleanToolOutput(output);

  return {
    id,
    kind: "output",
    label: meaningfulOutputLabel(cleanedOutput),
    tone: "output",
    output: trimDetail(cleanedOutput),
    status: /(^|\n)\s*(error|failed|exception|traceback)\b/i.test(cleanedOutput)
      ? "failed"
      : "completed"
  };
}

function inferToolAction(
  toolName: string,
  input: JsonRecord
): NonNullable<ToolDetail["action"]> {
  const normalized = toolName.toLowerCase();

  if (isWriteStdinTool(toolName)) {
    return "other";
  }

  if (normalized.includes("read") || normalized.includes("view")) {
    return "read";
  }

  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("patch") ||
    normalized.includes("apply")
  ) {
    return "edit";
  }

  if (
    normalized.includes("grep") ||
    normalized.includes("glob") ||
    normalized.includes("search") ||
    normalized.includes("find")
  ) {
    return "search";
  }

  if (
    normalized.includes("bash") ||
    normalized.includes("shell") ||
    normalized.includes("exec") ||
    normalized.includes("terminal") ||
    extractToolCommand(input)
  ) {
    return "command";
  }

  if (normalized.includes("image") || normalized.includes("generate")) {
    return "generate";
  }

  return "other";
}

function buildToolCallLabel(
  toolName: string,
  action: NonNullable<ToolDetail["action"]>,
  input: JsonRecord,
  command?: string,
  pathValue?: string
) {
  const formattedName = formatToolName(toolName);
  const filename = pathValue ? path.basename(pathValue) : undefined;

  if (isWriteStdinTool(toolName)) {
    return writeStdinLabel(input);
  }

  if (action === "read") {
    return filename ? `Read ${filename}` : `Used ${formattedName}`;
  }

  if (action === "edit") {
    return filename ? `Edited ${filename}` : `Used ${formattedName}`;
  }

  if (action === "search") {
    const query =
      asString(input.pattern) ??
      asString(input.query) ??
      asString(input.regex) ??
      asString(input.search);
    return query ? `Searched for ${trimDetail(query)}` : `Used ${formattedName}`;
  }

  if (action === "command") {
    return command ? `Ran ${trimDetail(command)}` : `Ran ${formattedName}`;
  }

  if (action === "generate") {
    return "Generated image";
  }

  return `Used ${formattedName}`;
}

function summarizeToolArguments(
  input: JsonRecord,
  action: NonNullable<ToolDetail["action"]>,
  toolName?: string
) {
  if (toolName && isWriteStdinTool(toolName)) {
    return writeStdinArguments(input);
  }

  const hiddenKeys = new Set([
    "cmd",
    "command",
    "yield_time_ms",
    "max_output_tokens",
    "timeout_ms",
    "description",
    "workdir",
    "sandbox_permissions",
    "justification"
  ]);
  const priorityKeys = [
    "file_path",
    "path",
    "pattern",
    "query",
    "regex",
    "old_string",
    "new_string",
    "replace_all",
    "offset",
    "limit"
  ];
  const entries = Object.entries(input)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== undefined)
    .sort(([a], [b]) => {
      const aIndex = priorityKeys.indexOf(a);
      const bIndex = priorityKeys.indexOf(b);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    })
    .slice(0, action === "edit" ? 4 : 3);

  return Object.fromEntries(
    entries.map(([key, value]) => [key, trimDetail(valueToDisplay(value))])
  );
}

function isWriteStdinTool(toolName: string) {
  const normalized = normalizeToolName(toolName);

  return normalized === "write_stdin" || normalized.endsWith("_write_stdin");
}

function normalizeToolName(toolName: string) {
  return toolName
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/^_+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function writeStdinLabel(input: JsonRecord) {
  const sessionId = writeStdinSessionId(input);
  const chars = asString(input.chars);
  const base = chars && chars.length > 0
    ? "Sent input to terminal"
    : "Checked terminal output";

  return sessionId ? `${base} ${sessionId}` : base;
}

function writeStdinArguments(input: JsonRecord) {
  const sessionId = writeStdinSessionId(input);
  const chars = asString(input.chars);
  const waitMs = asNumber(input.yield_time_ms);
  const entries: [string, string][] = [];

  entries.push([
    "operation",
    chars && chars.length > 0 ? "send terminal input" : "check terminal output"
  ]);

  if (sessionId) {
    entries.push(["terminal_session", sessionId]);
  }

  if (chars && chars.length > 0) {
    entries.push(["input", trimDetail(JSON.stringify(chars))]);
  }

  if (waitMs !== undefined) {
    entries.push(["wait", `${waitMs}ms`]);
  }

  return Object.fromEntries(entries);
}

function writeStdinSessionId(input: JsonRecord) {
  const raw = input.session_id ?? input.sessionId;

  return typeof raw === "number" ? String(raw) : asString(raw);
}

function extractToolCommand(input: JsonRecord) {
  return (
    asString(input.cmd) ??
    asString(input.command) ??
    asString(input.shell_command)
  );
}

function extractToolPath(input: JsonRecord) {
  return (
    asString(input.file_path) ??
    asString(input.path) ??
    asString(input.abs_path) ??
    asString(input.filename)
  );
}

function meaningfulOutputLabel(output: string) {
  const trimmed = output.trim();

  if (!trimmed) {
    return "Output returned";
  }

  const firstLine = trimmed.split("\n").find(Boolean) ?? trimmed;

  if (/^[-=_]{3,}$/.test(firstLine.trim())) {
    return "Output returned";
  }

  return trimDetail(firstLine);
}

function cleanToolOutput(output: string) {
  const lines = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return true;
      }

      return !(
        /^Chunk ID:/i.test(trimmed) ||
        /^Wall time:/i.test(trimmed) ||
        /^Process exited with code/i.test(trimmed) ||
        /^Process running with session ID/i.test(trimmed) ||
        /^Original token count:/i.test(trimmed) ||
        /^Output:\s*$/i.test(trimmed)
      );
    });

  return decodeToolOutputText(lines.join("\n").trim()).trim();
}

function decodeToolOutputText(output: string) {
  if (!output) {
    return "";
  }

  try {
    const parsed = JSON.parse(output) as unknown;
    const text = extractText(parsed);

    if (text) {
      return text;
    }

    return typeof parsed === "string" ? parsed : output;
  } catch {
    return output;
  }
}

export function isInformativeOutputDetail(detail: ToolDetail) {
  const output = detail.output?.trim() ?? "";

  return Boolean(output) && detail.label !== "Output returned";
}

export function inferMediaType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  if ([".png", ".apng"].includes(extension)) {
    return "image/png";
  }

  if ([".jpg", ".jpeg"].includes(extension)) {
    return "image/jpeg";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if ([".mp4", ".m4v"].includes(extension)) {
    return "video/mp4";
  }

  if (extension === ".mov") {
    return "video/quicktime";
  }

  if ([".mp3", ".mpeg"].includes(extension)) {
    return "audio/mpeg";
  }

  if (extension === ".wav") {
    return "audio/wav";
  }

  if (extension === ".pdf") {
    return "application/pdf";
  }

  if ([".json", ".jsonl"].includes(extension)) {
    return "application/json";
  }

  if ([".md", ".txt", ".ts", ".tsx", ".js", ".jsx", ".css", ".html"].includes(extension)) {
    return "text/plain";
  }

  return "application/octet-stream";
}

function valueToDisplay(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function trimText(value: string) {
  return trimToLength(value, MAX_TEXT_LENGTH);
}

function trimDetail(value: string) {
  return trimToLength(value, MAX_DETAIL_LENGTH);
}

function trimToLength(value: string, length: number) {
  const normalized = value.replace(/\s+\n/g, "\n").trim();

  return normalized.length > length
    ? `${normalized.slice(0, length - 1).trimEnd()}...`
    : normalized;
}

export function titleFromText(value: string) {
  const titleText = titleVisiblePrompt(value);

  if (isContinuationSummary(titleText)) {
    return undefined;
  }

  const normalizedTitle = normalizedTitleFromPrompt(titleText);

  if (normalizedTitle) {
    return normalizedTitle;
  }

  const firstLine = titleText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return undefined;
  }

  return trimToLength(firstLine.replace(/^#+\s*/, ""), 58);
}

function normalizedTitleFromPrompt(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const featureTitle = normalized.match(/^Feature:\s*(.+?)(?:\.|$)/i)?.[1];

  if (featureTitle) {
    return titleFromFeature(featureTitle);
  }

  const errorDocsTitle = titleFromErrorDocsPrompt(normalized);

  if (errorDocsTitle) {
    return errorDocsTitle;
  }

  const comparable = normalized
    .toLowerCase()
    .replace(/[?.!]+$/g, "")
    .replace(/\bwhat's\b/g, "what is");

  if (/^what is (?:this|the) project about$/.test(comparable)) {
    return "Explain project";
  }

  if (/^what features (?:could|can|should) we add to (?:this|the) project$/.test(comparable)) {
    return "Add features";
  }

  return undefined;
}

function titleFromFeature(value: string) {
  const comparable = value.toLowerCase();

  if (
    comparable.includes("model") &&
    comparable.includes("provider") &&
    comparable.includes("project")
  ) {
    return "Persist project model choice";
  }

  return titleCaseWords(value)
    .replace(/\bA\b/g, "a")
    .replace(/\bAn\b/g, "an")
    .replace(/\bThe\b/g, "the");
}

function titleFromErrorDocsPrompt(value: string) {
  const urlMatch = value.match(
    /reviewing the docs at (https?:\/\/\S+)/i
  );

  if (!urlMatch) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(urlMatch[1].replace(/[),.;]+$/g, ""));
  } catch {
    return "Resolve documented error";
  }

  if (!url.hostname.endsWith("vercel.com")) {
    return "Resolve documented error";
  }

  const errorName = path.basename(url.pathname).replace(/\.md$/i, "");

  return errorName
    ? `Fix Vercel ${errorName} error`
    : "Fix Vercel error";
}

function titleCaseWords(value: string) {
  return trimToLength(value, 58)
    .split(" ")
    .map((word) =>
      word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word
    )
    .join(" ");
}

function titleVisiblePrompt(value: string) {
  const contextPacketTitle = value.match(
    /^(?:Composer|Forge) context packet\.[\s\S]*?^Session title:\s*(.+)$/im
  );

  if (contextPacketTitle?.[1]) {
    return contextPacketTitle[1].trim();
  }

  return userVisiblePrompt(value);
}

export function userVisiblePrompt(value: string) {
  const withoutLeadingSystemInstruction = value
    .trim()
    .replace(/^<system_instruction>[\s\S]*?<\/system_instruction>\s*/i, "");

  const contextPacketUserRequest = withoutLeadingSystemInstruction.match(
    /^(?:Composer|Forge) context packet\.[\s\S]*?^User request:\s*([\s\S]+)$/im
  );

  if (contextPacketUserRequest?.[1]) {
    return contextPacketUserRequest[1].trim();
  }

  const branchPromptUserMessage = withoutLeadingSystemInstruction.match(
    /(?:^|\n)User message:\s*\n([\s\S]+)$/i
  );

  if (
    branchPromptUserMessage &&
    isBackgroundBranchNamePrompt(withoutLeadingSystemInstruction)
  ) {
    return branchPromptUserMessage[1].trim();
  }

  return withoutLeadingSystemInstruction.trim() || value.trim();
}

function isContinuationSummary(value: string) {
  return /^This session is being continued from a previous conversation/i.test(
    value.trim()
  );
}

export function isHiddenHandoffTranscriptText(value: string) {
  const text = value.trim();

  return (
    /^<local-command-caveat>[\s\S]*<\/local-command-caveat>$/i.test(text) ||
    /^<local-command-stdout>[\s\S]*<\/local-command-stdout>$/i.test(text) ||
    /^<command-name>\s*\/?compact\s*<\/command-name>[\s\S]*Composer multi-provider handoff/i.test(text) ||
    /^Composer provider handoff context\./i.test(text) ||
    isContinuationSummary(text)
  );
}

export function isBackgroundBranchNamePrompt(value: string) {
  return (
    /Respond directly to the user's prompt/i.test(value) &&
    /generating a git branch name for a coding task/i.test(value) &&
    /Return only the branch name/i.test(value)
  );
}

export function titleFromCwd(cwd?: string) {
  return cwd ? path.basename(cwd) : undefined;
}

export function titleFromPath(filePath: string) {
  return path.basename(filePath, ".jsonl");
}

export function latestTimestamp(rows: JsonRecord[]) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const timestamp = asString(rows[index].timestamp);

    if (timestamp) {
      return timestamp;
    }
  }

  return undefined;
}

export async function isoFromMtime(filePath: string) {
  const mtimeMs = await safeMtimeMs(filePath);

  return mtimeMs ? new Date(mtimeMs).toISOString() : undefined;
}

export async function safeMtimeMs(filePath: string) {
  try {
    return (await fs.stat(filePath)).mtimeMs;
  } catch {
    return 0;
  }
}

export function relativeAge(timestamp?: string) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const deltaMs = Date.now() - date.getTime();

  if (!Number.isFinite(deltaMs)) {
    return "";
  }

  const minutes = Math.max(0, Math.floor(deltaMs / 60_000));

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

export function formatTime(timestamp?: string) {
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatToolName(name: string) {
  return name.replace(/^_/, "").replace(/_/g, " ");
}
