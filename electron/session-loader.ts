import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type SessionProvider = "codex" | "claude" | "meta";
type ToolStatus = "running" | "completed" | "failed" | "cancelled";

type ToolDetail = {
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
};

type ConversationAttachment = {
  id: string;
  type: "file" | "source-document";
  filename?: string;
  title?: string;
  mediaType?: string;
  url?: string;
};

type ConversationItem =
  | {
      id: string;
      type: "user_message";
      body: string;
      timestamp?: string;
      steered?: boolean;
    }
  | {
      id: string;
      type: "assistant_message";
      body: string;
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
      defaultOpen?: boolean;
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
    };

type ProjectThread = {
  id: string;
  name: string;
  age: string;
  active?: boolean;
  provider?: SessionProvider;
  model?: string;
  cwd?: string;
};

type Project = {
  name: string;
  provider?: SessionProvider;
  threads: ProjectThread[];
};

type SessionContent = {
  id: string;
  provider: SessionProvider;
  providerSessionId?: string;
  runtimeStatus?: "idle" | "running" | "awaiting_approval" | "error";
  title: string;
  updatedAt?: string;
  cwd?: string;
  model?: string;
  items: ConversationItem[];
  pendingItems: Extract<ConversationItem, { type: "running_tool" }>[];
};

export type SessionSnapshot = {
  projects: Project[];
  sessions: Record<string, SessionContent>;
};

type JsonRecord = Record<string, unknown>;

const MAX_SESSIONS_PER_PROVIDER = 5;
const MAX_ITEMS_PER_SESSION = 140;
const MAX_TEXT_LENGTH = 4_000;
const MAX_DETAIL_LENGTH = 520;

export function loadLocalSessions(): SessionSnapshot {
  const claudeSessions = loadClaudeSessions();
  const codexSessions = loadCodexSessions();
  const sessions = Object.fromEntries(
    [...claudeSessions, ...codexSessions].map((session) => [
      session.id,
      session
    ])
  );

  return {
    projects: [
      {
        name: "Claude sessions",
        provider: "claude" as const,
        threads: claudeSessions.map(sessionToThread)
      },
      {
        name: "Codex sessions",
        provider: "codex" as const,
        threads: codexSessions.map(sessionToThread)
      }
    ].filter((project) => project.threads.length > 0),
    sessions
  };
}

function loadCodexSessions(): SessionContent[] {
  const codexRoot = path.join(os.homedir(), ".codex");
  const index = readCodexIndex(codexRoot);
  const files = [
    ...findJsonl(path.join(codexRoot, "sessions")),
    ...findJsonl(path.join(codexRoot, "archived_sessions"))
  ]
    .filter((file) => !file.fullPath.endsWith("session_index.jsonl"))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const sessions: SessionContent[] = [];

  for (const file of files) {
    const parsed = parseCodexSession(file.fullPath, index);

    if (parsed && parsed.items.length > 0) {
      sessions.push(parsed);
    }

    if (sessions.length >= MAX_SESSIONS_PER_PROVIDER) {
      break;
    }
  }

  return sessions;
}

function parseCodexSession(
  filePath: string,
  index: Map<string, { title: string; updatedAt?: string }>
): SessionContent | null {
  const rows = readJsonl(filePath);
  let id = codexIdFromPath(filePath);
  let cwd: string | undefined;
  let model: string | undefined;
  let updatedAt = latestTimestamp(rows) ?? isoFromMtime(filePath);
  let title = "";
  const items: ConversationItem[] = [];
  let toolIndex = 0;
  let firstUserText = "";

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
          const parsedMessage = parseCodexUserMessage(
            rawBody,
            `${id}-user-${items.length}`,
            imageUrlsFromPayload(payload)
          );

          if (parsedMessage.attachments.length > 0) {
            items.push({
              id: `${id}-user-attachments-${items.length}`,
              type: "attachment_group",
              attachments: parsedMessage.attachments
            });
          }

          firstUserText ||= parsedMessage.body;
          items.push({
            id: `${id}-user-${items.length}`,
            type: "user_message",
            body: trimText(parsedMessage.body),
            timestamp: formatTime(timestamp)
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

      if (role === "assistant") {
        items.push({
          id: `${id}-assistant-${items.length}`,
          type: "assistant_message",
          body: trimText(body)
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
      payloadType === "function_call" ||
      payloadType === "custom_tool_call" ||
      payloadType === "image_generation_call"
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
        defaultOpen: false
      });
      continue;
    }

    if (
      payloadType === "function_call_output" ||
      payloadType === "custom_tool_call_output"
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
        defaultOpen: false
      });
    }
  }

  const indexed = index.get(id);
  title = indexed?.title ?? titleFromText(firstUserText) ?? titleFromPath(filePath);
  updatedAt = indexed?.updatedAt ?? updatedAt;

  return finishSession({
    id: `codex-${id}`,
    provider: "codex",
    providerSessionId: id,
    title,
    updatedAt,
    cwd,
    model,
    items
  });
}

function loadClaudeSessions(): SessionContent[] {
  const projectsRoot = path.join(os.homedir(), ".claude", "projects");
  const files = findClaudeProjectJsonl(projectsRoot).sort(
    (a, b) => b.mtimeMs - a.mtimeMs
  );
  const sessions: SessionContent[] = [];

  for (const file of files) {
    const parsed = parseClaudeSession(file.fullPath);

    if (parsed && parsed.items.length > 0) {
      sessions.push(parsed);
    }

    if (sessions.length >= MAX_SESSIONS_PER_PROVIDER) {
      break;
    }
  }

  return sessions;
}

function parseClaudeSession(filePath: string): SessionContent | null {
  const rows = readJsonl(filePath);
  const fileSessionId = path.basename(filePath, ".jsonl");
  let sessionId = fileSessionId;
  let cwd: string | undefined;
  let model: string | undefined;
  let updatedAt = latestTimestamp(rows) ?? isoFromMtime(filePath);
  let firstUserText = "";
  const items: ConversationItem[] = [];
  let toolIndex = 0;

  for (const row of rows) {
    sessionId = asString(row.sessionId) ?? sessionId;
    cwd = asString(row.cwd) ?? cwd;
    updatedAt = asString(row.timestamp) ?? updatedAt;

    if (row.type === "permission-mode") {
      // Claude permission mode rows are runtime metadata. They are useful for
      // execution, but noisy when replaying a conversation transcript.
      continue;
    }

    if (row.type === "user") {
      const message = asRecord(row.message);
      const content = message.content;

      if (typeof content === "string") {
        firstUserText ||= content;
        items.push({
          id: `${sessionId}-user-${items.length}`,
          type: "user_message",
          body: trimText(content),
          timestamp: formatTime(asString(row.timestamp))
        });
      } else if (Array.isArray(content)) {
        const resultText = extractText(content);

        if (resultText) {
          toolIndex += 1;
          const detail = createToolOutputDetail(
            `${sessionId}-tool-result-${toolIndex}-detail`,
            resultText
          );

          if (!isInformativeOutputDetail(detail)) {
            continue;
          }

          items.push({
            id: `${sessionId}-tool-result-${toolIndex}`,
            type: "tool_group",
            summary: detail.label,
            details: [detail],
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

          if (body) {
            items.push({
              id: `${sessionId}-assistant-${items.length}`,
              type: "assistant_message",
              body: trimText(body)
            });
          }
        } else if (blockType === "thinking") {
          // Claude thinking blocks are internal reasoning state, not
          // user-visible assistant transcript content.
          continue;
        } else if (blockType === "tool_use") {
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
            defaultOpen: false
          });
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
    title: titleFromText(firstUserText) ?? titleFromCwd(cwd) ?? titleFromPath(filePath),
    updatedAt,
    cwd,
    model,
    items
  });
}

function finishSession(session: Omit<SessionContent, "pendingItems">) {
  const cappedItems = session.items.slice(0, MAX_ITEMS_PER_SESSION);

  if (session.items.length > cappedItems.length) {
    cappedItems.push({
      id: `${session.id}-truncated`,
      type: "notice",
      label: `${session.items.length - cappedItems.length} more transcript events hidden for this UI preview`
    });
  }

  return {
    ...session,
    items: cappedItems,
    pendingItems: []
  } satisfies SessionContent;
}

function readCodexIndex(codexRoot: string) {
  const index = new Map<string, { title: string; updatedAt?: string }>();
  const indexPath = path.join(codexRoot, "session_index.jsonl");

  for (const row of readJsonl(indexPath)) {
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

function readJsonl(filePath: string) {
  const rows: JsonRecord[] = [];

  try {
    const content = fs.readFileSync(filePath, "utf8");

    for (const line of content.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
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
  } catch {
    return [];
  }

  return rows;
}

function findJsonl(root: string) {
  const files: Array<{ fullPath: string; mtimeMs: number }> = [];

  function walk(dir: string, depth: number) {
    if (depth > 8) {
      return;
    }

    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push({
          fullPath,
          mtimeMs: safeMtimeMs(fullPath)
        });
      }
    }
  }

  walk(root, 0);
  return files;
}

function findClaudeProjectJsonl(projectsRoot: string) {
  const files: Array<{ fullPath: string; mtimeMs: number }> = [];

  let projectDirs: fs.Dirent[];

  try {
    projectDirs = fs.readdirSync(projectsRoot, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) {
      continue;
    }

    const dir = path.join(projectsRoot, projectDir.name);
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push({
          fullPath,
          mtimeMs: safeMtimeMs(fullPath)
        });
      }
    }
  }

  return files;
}

function sessionToThread(session: SessionContent): ProjectThread {
  return {
    id: session.id,
    name: session.title,
    age: relativeAge(session.updatedAt),
    provider: session.provider,
    model: session.model,
    cwd: session.cwd
  };
}

function extractText(value: unknown): string {
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

function parseToolInput(payload: JsonRecord): JsonRecord {
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

function createToolCallDetail(
  id: string,
  toolName: string,
  input: JsonRecord,
  forcedAction?: ToolDetail["action"]
): ToolDetail {
  const action = forcedAction ?? inferToolAction(toolName, input);
  const command = extractToolCommand(input);
  const pathValue = extractToolPath(input);
  const args = summarizeToolArguments(input, action);
  const label = buildToolCallLabel(toolName, action, input, command, pathValue);

  return {
    id,
    kind: "call",
    label,
    tone: command ? "command" : "default",
    toolName: formatToolName(toolName),
    action,
    args,
    command,
    path: pathValue
  };
}

function createToolOutputDetail(id: string, output: string): ToolDetail {
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
  action: NonNullable<ToolDetail["action"]>
) {
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

function isInformativeOutputDetail(detail: ToolDetail) {
  const output = detail.output?.trim() ?? "";

  return Boolean(output) && detail.label !== "Output returned";
}

function parseCodexUserMessage(
  value: string,
  idPrefix: string,
  imageUrls: string[] = []
) {
  const requestMarker = value.match(/^##\s+My request for Codex:\s*$/m);

  if (!/^#\s+Files mentioned by the user:/m.test(value) || !requestMarker) {
    return {
      body: value,
      attachments: [] as ConversationAttachment[]
    };
  }

  const requestStart = (requestMarker.index ?? 0) + requestMarker[0].length;
  const filesSection = value.slice(0, requestMarker.index).trim();
  const requestBody = value.slice(requestStart).trim();
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

function imageUrlsFromPayload(payload: JsonRecord) {
  const urls: string[] = [];

  for (const image of asArray(payload.images)) {
    const url = asString(image);

    if (url) {
      urls.push(url);
    }
  }

  for (const image of asArray(payload.local_images)) {
    const url = localImageToDataUrl(image);

    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

function localImageToDataUrl(value: unknown) {
  const filePath =
    typeof value === "string"
      ? value
      : asString(asRecord(value).path) ?? asString(asRecord(value).filePath);

  if (!filePath) {
    return undefined;
  }

  try {
    const bytes = fs.readFileSync(filePath);
    return `data:${inferMediaType(filePath)};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function inferMediaType(fileName: string) {
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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function trimText(value: string) {
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

function titleFromText(value: string) {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return undefined;
  }

  return trimToLength(firstLine.replace(/^#+\s*/, ""), 58);
}

function titleFromCwd(cwd?: string) {
  return cwd ? path.basename(cwd) : undefined;
}

function titleFromPath(filePath: string) {
  return path.basename(filePath, ".jsonl");
}

function codexIdFromPath(filePath: string) {
  const basename = path.basename(filePath);
  const match = basename.match(
    /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/
  );

  return match?.[1] ?? path.basename(filePath, ".jsonl");
}

function latestTimestamp(rows: JsonRecord[]) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const timestamp = asString(rows[index].timestamp);

    if (timestamp) {
      return timestamp;
    }
  }

  return undefined;
}

function isoFromMtime(filePath: string) {
  const mtimeMs = safeMtimeMs(filePath);

  return mtimeMs ? new Date(mtimeMs).toISOString() : undefined;
}

function safeMtimeMs(filePath: string) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function relativeAge(timestamp?: string) {
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

function formatTime(timestamp?: string) {
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

function formatToolName(name: string) {
  return name.replace(/^_/, "").replace(/_/g, " ");
}
