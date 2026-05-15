import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  extractPatchReviewFiles,
  patchReviewLabel,
  reviewFileFromCodexChange
} from "../../electron/patch-review.js";
import {
  desktopCliEnvironment,
  resolveDesktopExecutable
} from "../../electron/cli-env.js";
import type { AgentProvider, EventSink } from "../runtime.js";
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

type PendingRequest = {
  resolve: (value: JsonRecord) => void;
  reject: (error: Error) => void;
};

type ActiveTurn = {
  threadId: string;
  turnId?: string;
};

export class CodexProvider implements AgentProvider {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private initialized: Promise<void> | null = null;
  private activeTurns = new Map<string, ActiveTurn>();
  private sinks = new Map<string, EventSink>();
  private loadedThreads = new Set<string>();
  private approvalHandlers = new Map<
    string,
    (approval: Omit<ApprovalRequest, "id">) => Promise<ApprovalDecision>
  >();
  private compactWaiters = new Map<string, () => void>();
  private cancelledSessions = new Set<string>();
  private lineBuffer = "";

  async run(request: Parameters<AgentProvider["run"]>[0]) {
    try {
      await this.ensureStarted();
      this.sinks.set(request.sessionId, request.emit);
      this.approvalHandlers.set(request.sessionId, request.askApproval);

      const cwd = defaultCwd(request.session);
      const threadId = await this.ensureThread(
        request.session,
        request.settings.permissionMode
      );
      const turnParams: JsonRecord = {
        threadId,
        input: codexInput(request.prompt, request.imageAttachments),
        cwd,
        model: request.settings.model,
        effort: mapCodexEffort(request.settings.intelligence),
        ...codexTurnPermissionParams(request.settings.permissionMode, cwd, request.phase)
      };

      if (request.phase === "plan") {
        turnParams.collaborationMode = {
          mode: "plan",
          settings: {
            model: request.settings.model ?? "gpt-5.5",
            reasoning_effort: mapCodexEffort(request.settings.intelligence),
            developer_instructions: null
          }
        };
      }

      const turn = await this.request("turn/start", turnParams);
      const turnId = stringAt(turn, "turn", "id") ?? randomUUID();

      this.activeTurns.set(request.sessionId, { threadId, turnId });
      if (this.cancelledSessions.delete(request.sessionId)) {
        await this.request("turn/interrupt", { threadId, turnId }).catch(
          () => undefined
        );
        return;
      }
      request.emit({
        id: randomUUID(),
        type: "turn.started",
        sessionId: request.sessionId,
        turnId,
        label: "Codex is working"
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
        status: "error"
      });
    }
  }

  async interrupt(sessionId: string) {
    const active = this.activeTurns.get(sessionId);

    if (active?.turnId) {
      await this.request("turn/interrupt", {
        threadId: active.threadId,
        turnId: active.turnId
      }).catch(() => undefined);
    } else {
      this.cancelledSessions.add(sessionId);
    }
  }

  async compact(request: Parameters<NonNullable<AgentProvider["compact"]>>[0]) {
    await this.ensureStarted();

    const threadId = await this.ensureThread(
      request.session,
      request.settings.permissionMode
    );
    const compactToolId = `${request.sessionId}-codex-handoff-compact-${Date.now()}`;

    this.sinks.set(request.sessionId, request.emit);
    this.approvalHandlers.set(request.sessionId, async () => "decline");
    this.activeTurns.set(request.sessionId, { threadId, turnId: compactToolId });
    request.session.compactionSummaries = [
      ...(request.session.compactionSummaries ?? []),
      {
        id: `${request.session.id}-codex-compact-${Date.now()}`,
        provider: "codex" as const,
        contextVersion: request.session.contextVersion ?? 0,
        createdAt: new Date().toISOString(),
        trigger: "manual" as const,
        summary: `Codex compacted its provider-local context for ${request.reason}.`
      }
    ].slice(-12);
    request.emit({
      id: randomUUID(),
      type: "tool.started",
      sessionId: request.sessionId,
      toolId: compactToolId,
      label: "Codex compacting context for handoff",
      detail: {
        id: `${compactToolId}-detail`,
        label: "Codex compacting provider-local context",
        kind: "summary",
        tone: "summary",
        action: "other",
        args: { reason: request.reason }
      }
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.compactWaiters.delete(request.sessionId);
        resolve();
      }, 60_000);

      this.compactWaiters.set(request.sessionId, () => {
        clearTimeout(timeout);
        resolve();
      });

      this.request("thread/compact/start", { threadId }).catch((error) => {
        clearTimeout(timeout);
        this.compactWaiters.delete(request.sessionId);
        reject(error);
      });
    });

    request.emit({
      id: randomUUID(),
      type: "tool.completed",
      sessionId: request.sessionId,
      toolId: compactToolId
    });
  }

  dispose() {
    const child = this.process;

    for (const pending of this.pending.values()) {
      pending.reject(new Error("Codex provider disposed"));
    }

    this.pending.clear();
    this.activeTurns.clear();
    this.sinks.clear();
    this.loadedThreads.clear();
    this.approvalHandlers.clear();
    this.compactWaiters.clear();
    this.cancelledSessions.clear();
    this.initialized = null;
    this.process = null;

    if (!child) {
      return;
    }

    child.stdin.destroy();

    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  private async ensureThread(
    session: SessionContent,
    permissionMode: PermissionMode
  ) {
    const existingThreadId = session.providerSessionId
      ? providerSessionId(session)
      : undefined;
    const threadPermissions = codexThreadPermissionParams(permissionMode);

    if (existingThreadId && this.loadedThreads.has(existingThreadId)) {
      return existingThreadId;
    }

    if (existingThreadId || !session.id.startsWith("codex-live-")) {
      const threadId = existingThreadId ?? providerSessionId(session);
      await this.request("thread/resume", {
        threadId,
        cwd: defaultCwd(session),
        ...threadPermissions,
        persistExtendedHistory: true
      });
      session.providerSessionId = threadId;
      this.loadedThreads.add(threadId);
      return threadId;
    }

    const response = await this.request("thread/start", {
      cwd: defaultCwd(session),
      ...threadPermissions,
      serviceName: "composer",
      experimentalRawEvents: false,
      persistExtendedHistory: true
    });
    const threadId = stringAt(response, "thread", "id") ?? providerSessionId(session);

    session.providerSessionId = threadId;
    this.loadedThreads.add(threadId);
    return threadId;
  }

  private ensureStarted() {
    if (this.initialized) {
      return this.initialized;
    }

    this.initialized = new Promise((resolve, reject) => {
      const env = desktopCliEnvironment();
      const codexCommand = resolveDesktopExecutable("codex", env);

      if (!codexCommand) {
        reject(
          new Error(
            "Codex CLI was not found. Install Codex or set COMPOSER_CODEX_PATH to the codex executable."
          )
        );
        return;
      }

      const child = spawn(codexCommand, ["app-server"], {
        env,
        stdio: ["pipe", "pipe", "pipe"]
      });

      this.process = child;
      child.stdout.on("data", (chunk) => this.onStdout(chunk));
      child.stderr.on("data", (chunk) => process.stderr.write(chunk));
      child.once("error", reject);
      child.once("exit", (code) => {
        for (const pending of this.pending.values()) {
          pending.reject(new Error(`Codex app-server exited (${code})`));
        }

        this.pending.clear();
        this.loadedThreads.clear();
        this.process = null;
        this.initialized = null;
      });

      this.request("initialize", {
        clientInfo: {
          name: "composer",
          title: "Composer",
          version: "0.1.0"
        },
        capabilities: { experimentalApi: true }
      })
        .then(() => {
          this.notify("initialized", {});
          resolve();
        })
        .catch(reject);
    });

    return this.initialized;
  }

  private request(method: string, params: unknown): Promise<JsonRecord> {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ id, method, params });
    });
  }

  private notify(method: string, params: unknown) {
    this.write({ method, params });
  }

  private write(payload: unknown) {
    this.process?.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private onStdout(chunk: Buffer) {
    this.lineBuffer += chunk.toString("utf8");
    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        this.onMessage(JSON.parse(line) as JsonRecord);
      } catch {
        // Codex may print non-protocol diagnostics on experimental builds.
      }
    }
  }

  private onMessage(message: JsonRecord) {
    const id = typeof message.id === "number" ? message.id : undefined;

    if (id !== undefined && (message.result || message.error)) {
      const pending = this.pending.get(id);

      if (!pending) {
        return;
      }

      this.pending.delete(id);

      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(asRecord(message.result));
      }
      return;
    }

    if (id !== undefined && typeof message.method === "string") {
      void this.handleServerRequest(id, message.method, asRecord(message.params));
      return;
    }

    if (typeof message.method === "string") {
      this.handleNotification(message.method, asRecord(message.params));
    }
  }

  private async handleServerRequest(id: number, method: string, params: JsonRecord) {
    const session = this.sessionForThread(asString(params.threadId));

    if (!session) {
      this.write({ id, result: { decision: "decline" } });
      return;
    }

    const approval = codexApproval(method, params, session.id);
    const askApproval = this.approvalHandlers.get(session.id);
    const decision = askApproval ? await askApproval(approval) : "decline";

    this.write({ id, result: codexDecision(method, decision, params) });
  }

  private handleNotification(method: string, params: JsonRecord) {
    const session = this.sessionForThread(asString(params.threadId));

    if (method === "thread/closed") {
      const threadId = asString(params.threadId);

      if (threadId) {
        this.loadedThreads.delete(threadId);
      }
    }

    if (!session) {
      return;
    }

    if (method === "thread/compacted") {
      const itemId = `${session.id}-codex-compact-${Date.now()}`;
      session.emit({
        id: randomUUID(),
        type: "tool.started",
        sessionId: session.id,
        toolId: itemId,
        label: "Codex compacted context",
        detail: {
          id: `${itemId}-detail`,
          label: "Codex compacted provider-local context",
          kind: "summary",
          tone: "summary",
          action: "other"
        }
      });
      session.emit({
        id: randomUUID(),
        type: "tool.completed",
        sessionId: session.id,
        toolId: itemId
      });
      return;
    }

    if (method === "turn/started") {
      const turnId = stringAt(params, "turn", "id") ?? randomUUID();
      this.activeTurns.set(session.id, {
        threadId: asString(params.threadId) ?? providerSessionId({ id: session.id } as SessionContent),
        turnId
      });
      session.emit({
        id: randomUUID(),
        type: "turn.started",
        sessionId: session.id,
        turnId,
        label: "Codex is working"
      });
      return;
    }

    if (method === "item/agentMessage/delta") {
      session.emit({
        id: randomUUID(),
        type: "message.delta",
        sessionId: session.id,
        messageId: asString(params.itemId) ?? `${session.id}-assistant-live`,
        delta: asString(params.delta) ?? ""
      });
      return;
    }

    if (method === "item/commandExecution/outputDelta") {
      session.emit({
        id: randomUUID(),
        type: "tool.delta",
        sessionId: session.id,
        toolId: asString(params.itemId) ?? `${session.id}-tool-live`,
        delta: asString(params.delta) ?? ""
      });
      return;
    }

    if (method === "item/fileChange/patchUpdated") {
      const itemId = asString(params.itemId) ?? randomUUID();
      const detail = toolDetail(`${itemId}-patch`, "Edited file", {
        type: "file_change",
        changes: normalizeFileChanges(params.changes)
      });

      session.emit({
        id: randomUUID(),
        type: "tool.completed",
        sessionId: session.id,
        toolId: itemId,
        detail
      });
      return;
    }

    if (method === "item/started") {
      const item = asRecord(params.item);
      const itemId = asString(item.id) ?? randomUUID();
      const itemType = asString(item.type);
      if (itemType === "contextCompaction") {
        session.emit({
          id: randomUUID(),
          type: "tool.started",
          sessionId: session.id,
          toolId: itemId,
          label: "Codex compacted context",
          detail: {
            id: `${itemId}-compact`,
            label: "Codex compacted provider-local context",
            kind: "summary",
            tone: "summary",
            action: "other"
          }
        });
        return;
      }
      const label = itemLabel(item);
      session.emit({
        id: randomUUID(),
        type: "tool.started",
        sessionId: session.id,
        toolId: itemId,
        label,
        detail: toolDetail(`${itemId}-call`, label, item)
      });
      return;
    }

    if (method === "item/completed") {
      const item = asRecord(params.item);
      const itemId = asString(item.id) ?? randomUUID();
      session.emit({
        id: randomUUID(),
        type: "tool.completed",
        sessionId: session.id,
        toolId: itemId
      });
      return;
    }

    if (method === "turn/completed") {
      const status = codexTurnCompletionStatus(params);
      const errorMessage = codexTurnErrorMessage(params);

      if (status === "error" && errorMessage) {
        session.emit({
          id: randomUUID(),
          type: "error",
          sessionId: session.id,
          message: errorMessage
        });
      }

      session.emit({
        id: randomUUID(),
        type: "turn.completed",
        sessionId: session.id,
        turnId: stringAt(params, "turn", "id"),
        status
      });
      const compactWaiter = this.compactWaiters.get(session.id);

      if (compactWaiter) {
        this.compactWaiters.delete(session.id);
        compactWaiter();
      }
      return;
    }

    if (method.includes("error") || method.includes("failed")) {
      session.emit({
        id: randomUUID(),
        type: "error",
        sessionId: session.id,
        message: codexTurnErrorMessage(params) ?? `Codex reported ${method}`
      });
      session.emit({
        id: randomUUID(),
        type: "turn.completed",
        sessionId: session.id,
        turnId: stringAt(params, "turn", "id"),
        status: "error"
      });
      return;
    }
  }

  private sessionForThread(threadId?: string) {
    if (!threadId) {
      return null;
    }

    for (const [sessionId, active] of this.activeTurns.entries()) {
      if (active.threadId === threadId) {
        const emit = this.sinks.get(sessionId);

        if (emit) {
          return { id: sessionId, emit };
        }
      }
    }

    return null;
  }
}

function normalizeFileChanges(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);

  return Object.entries(record).map(([filePath, change]) => ({
    ...asRecord(change),
    path: filePath
  }));
}

function codexTurnCompletionStatus(params: JsonRecord) {
  const status =
    asString(params.status) ??
    stringAt(params, "turn", "status") ??
    stringAt(params, "turn", "outcome") ??
    stringAt(params, "turn", "result");

  if (!status) {
    return "idle";
  }

  const normalized = status.toLowerCase();
  return normalized.includes("error") ||
    normalized.includes("fail") ||
    normalized.includes("cancel")
    ? "error"
    : "idle";
}

function codexTurnErrorMessage(params: JsonRecord) {
  return (
    asString(params.error) ??
    asString(params.message) ??
    stringAt(params, "turn", "error") ??
    stringAt(params, "turn", "message") ??
    stringifyErrorRecord(asRecord(params.error)) ??
    stringifyErrorRecord(asRecord(params.turn))
  );
}

function stringifyErrorRecord(record: JsonRecord) {
  const message =
    asString(record.message) ??
    asString(record.error) ??
    asString(record.reason);

  if (message) {
    return message;
  }

  return Object.keys(record).length ? JSON.stringify(record) : undefined;
}

function codexApproval(
  method: string,
  params: JsonRecord,
  sessionId: string
): Omit<ApprovalRequest, "id"> {
  const command = asString(params.command);
  const title =
    method === "item/fileChange/requestApproval"
      ? "Codex wants to edit files"
      : method === "item/permissions/requestApproval"
        ? "Codex requests more permissions"
        : command
          ? `Run ${command}`
          : "Codex requests approval";

  return {
    provider: "codex",
    sessionId,
    turnId: asString(params.turnId),
    kind:
      method === "item/fileChange/requestApproval"
        ? "file_change"
        : method === "item/permissions/requestApproval"
          ? "permission"
          : "command",
    title,
    details: stringifyDetails(params),
    availableDecisions: ["accept", "acceptForSession", "decline", "cancel"]
  };
}

function codexDecision(
  method: string,
  decision: ApprovalDecision,
  params: JsonRecord
) {
  if (method === "item/permissions/requestApproval") {
    return decision === "accept" || decision === "acceptForSession"
      ? { permissions: asRecord(params.permissions), scope: decision === "acceptForSession" ? "session" : "turn" }
      : { permissions: {}, scope: "turn" };
  }

  return { decision };
}

function itemLabel(item: JsonRecord) {
  const type = asString(item.type) ?? "tool";
  const command = asString(item.command);
  const tool = asString(item.tool) ?? asString(item.name);
  const reviewFiles = reviewFilesFromItem(item);

  if (reviewFiles.length > 0) {
    return patchReviewLabel(reviewFiles);
  }

  if (command) {
    return `Run ${command}`;
  }

  if (tool) {
    return `Use ${tool}`;
  }

  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function toolDetail(id: string, label: string, item: JsonRecord): ToolDetail {
  const command = asString(item.command);
  const reviewFiles = reviewFilesFromItem(item);
  const hasReviewFiles = reviewFiles.length > 0;

  return {
    id,
    label: hasReviewFiles ? patchReviewLabel(reviewFiles) : label,
    kind: "call",
    tone: command && !hasReviewFiles ? "command" : "default",
    action: hasReviewFiles ? "edit" : command ? "command" : "other",
    command: hasReviewFiles ? undefined : command,
    args: stringifyDetails(item),
    path: reviewFiles[0]?.path,
    reviewFiles: hasReviewFiles ? reviewFiles : undefined
  };
}

function reviewFilesFromItem(item: JsonRecord) {
  const type = asString(item.type);
  const rawPatch =
    asString(item.input) ??
    asString(item.patch) ??
    asString(item.command) ??
    asString(item.arguments);
  const patchFiles = extractPatchReviewFiles(rawPatch);

  if (patchFiles.length > 0) {
    return patchFiles;
  }

  if (type !== "file_change" || !Array.isArray(item.changes)) {
    return [];
  }

  return item.changes
    .map((change) => asRecord(change))
    .map((change) => {
      const diff = asString(change.diff);
      const files = extractPatchReviewFiles(diff);

      if (files.length > 0) {
        return files[0];
      }

      const filePath = asString(change.path) ?? asString(change.file_path);

      if (!filePath) {
        return null;
      }

      return reviewFileFromCodexChange(filePath, {
        type: asString(change.type),
        kind: asString(change.kind),
        unified_diff: asString(change.unified_diff),
        diff,
        content: asString(change.content),
        move_path: asString(change.move_path)
      });
    })
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
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

function codexThreadPermissionParams(mode: PermissionMode) {
  if (mode === "Full access") {
    return {
      approvalPolicy: "never",
      sandbox: "danger-full-access"
    };
  }

  if (mode === "Auto-review") {
    return {
      approvalPolicy: "on-failure",
      sandbox: "workspace-write"
    };
  }

  return {
    approvalPolicy: "on-request",
    sandbox: "workspace-write"
  };
}

function codexTurnPermissionParams(
  mode: PermissionMode,
  cwd: string,
  phase: Parameters<AgentProvider["run"]>[0]["phase"] = "execute"
) {
  if (phase === "plan") {
    return {
      approvalPolicy: "on-request",
      sandboxPolicy: {
        type: "readOnly",
        access: { type: "fullAccess" },
        networkAccess: false
      }
    };
  }

  const threadParams = codexThreadPermissionParams(mode);

  if (mode === "Full access") {
    return {
      approvalPolicy: threadParams.approvalPolicy,
      sandboxPolicy: { type: "dangerFullAccess" }
    };
  }

  return {
    approvalPolicy: threadParams.approvalPolicy,
    sandboxPolicy: {
      type: "workspaceWrite",
      writableRoots: [cwd],
      readOnlyAccess: { type: "fullAccess" },
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false
    }
  };
}

function mapCodexEffort(mode: IntelligenceMode) {
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

function codexInput(
  prompt: string,
  imageAttachments: Parameters<AgentProvider["run"]>[0]["imageAttachments"] = []
) {
  return [
    { type: "text", text: prompt, text_elements: [] },
    ...imageAttachments
      .filter((attachment) => attachment.dataUrl || attachment.path)
      .map((attachment) =>
        attachment.path
          ? { type: "localImage", path: attachment.path }
          : { type: "image", url: attachment.dataUrl ?? "" }
      )
  ];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringAt(record: JsonRecord, ...path: string[]) {
  let value: unknown = record;

  for (const key of path) {
    value = asRecord(value)[key];
  }

  return asString(value);
}
