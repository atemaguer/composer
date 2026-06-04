import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  patchReviewLabel,
  reviewFilesFromToolCall
} from "../patch-review.js";
import {
  desktopCliEnvironment,
  resolveDesktopExecutable
} from "../cli-env.js";
import type { AgentProvider, EventSink } from "../runtime.js";
import { defaultCwd, providerSessionId } from "../runtime.js";
import { buildDeterministicHandoffSummary } from "./handoff-summary.js";
import type {
  ApprovalDecision,
  ApprovalRequest,
  ConversationItem,
  IntelligenceMode,
  PermissionMode,
  QuestionAnswer,
  QuestionItem,
  QuestionRequest,
  SessionContent,
  SessionCompactionSummary,
  ToolDetail
} from "@composer/client";

type JsonRecord = Record<string, unknown>;

type PendingRequest = {
  resolve: (value: JsonRecord) => void;
  reject: (error: Error) => void;
};

type ActiveTurn = {
  threadId: string;
  turnId?: string;
};

type CompactionCollector = {
  turnId?: string;
  text: string;
  finalText?: string;
  resolve: (summary: string) => void;
  reject: (error: Error) => void;
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
  private questionHandlers = new Map<
    string,
    (question: Omit<QuestionRequest, "id">) => Promise<QuestionAnswer[]>
  >();
  private compactionCollectors = new Map<string, CompactionCollector>();
  private cancelledSessions = new Set<string>();
  private lineBuffer = "";

  async run(request: Parameters<AgentProvider["run"]>[0]) {
    try {
      await this.ensureStarted();
      this.sinks.set(request.sessionId, request.emit);
      this.approvalHandlers.set(request.sessionId, request.askApproval);
      this.questionHandlers.set(request.sessionId, request.askQuestion);

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
            developer_instructions: request.contextPrompt ?? null
          }
        };
      } else if (request.contextPrompt) {
        turnParams.collaborationMode = {
          mode: "default",
          settings: {
            model: request.settings.model ?? "gpt-5.5",
            reasoning_effort: mapCodexEffort(request.settings.intelligence),
            developer_instructions: request.contextPrompt
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

  // Native steer: inject the message into the in-flight turn (no new turn).
  // Returns false when there's no active turn or the app-server rejects it, so
  // the runtime can fall back to interrupt-and-run.
  async steer(
    sessionId: string,
    input: Parameters<NonNullable<AgentProvider["steer"]>>[1]
  ): Promise<boolean> {
    const active = this.activeTurns.get(sessionId);

    if (!active?.turnId) {
      return false;
    }

    try {
      await this.request("turn/steer", {
        threadId: active.threadId,
        turnId: active.turnId,
        input: codexInput(input.prompt, input.imageAttachments)
      });
      return true;
    } catch {
      return false;
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
    request.emit({
      id: randomUUID(),
      type: "tool.started",
      sessionId: request.sessionId,
      toolId: compactToolId,
      label: "Codex preparing handoff context",
      detail: {
        id: `${compactToolId}-detail`,
        label: "Codex generating readable handoff summary",
        kind: "summary",
        tone: "summary",
        action: "other",
        args: { reason: request.reason }
      }
    });

    let summarySource: NonNullable<SessionCompactionSummary["source"]> =
      "codex-handoff-turn";
    let summary: string;

    try {
      summary = await this.generateReadableHandoffSummary(request, threadId);
    } catch {
      summarySource = "deterministic-fallback";
      summary = buildDeterministicHandoffSummary({
        provider: "codex",
        providerLabel: "Codex",
        session: request.session,
        reason: request.reason
      });
    }

    if (!summary.trim()) {
      summarySource = "deterministic-fallback";
      summary = buildDeterministicHandoffSummary({
        provider: "codex",
        providerLabel: "Codex",
        session: request.session,
        reason: request.reason
      });
    }

    const compaction: SessionCompactionSummary = {
      id: `${request.session.id}-codex-handoff-${Date.now()}`,
      provider: "codex" as const,
      contextVersion: request.session.contextVersion ?? 0,
      createdAt: new Date().toISOString(),
      trigger: "manual" as const,
      source: summarySource,
      summary: summary.trim()
    };
    request.session.compactionSummaries = [
      ...(request.session.compactionSummaries ?? []),
      compaction
    ].slice(-12);

    request.emit({
      id: randomUUID(),
      type: "tool.completed",
      sessionId: request.sessionId,
      toolId: compactToolId
    });
    return compaction;
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
    this.questionHandlers.clear();
    for (const collector of this.compactionCollectors.values()) {
      collector.reject(new Error("Codex provider disposed"));
    }
    this.compactionCollectors.clear();
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

  private async generateReadableHandoffSummary(
    request: Parameters<NonNullable<AgentProvider["compact"]>>[0],
    threadId: string
  ) {
    const cwd = defaultCwd(request.session);
    const fork = await this.request("thread/fork", {
      threadId,
      cwd,
      model: request.settings.model,
      approvalPolicy: "on-request",
      sandbox: "read-only",
      ephemeral: true,
      excludeTurns: true,
      persistExtendedHistory: true
    });
    const forkThreadId = stringAt(fork, "thread", "id");

    if (!forkThreadId) {
      throw new Error("Codex did not return a fork thread id for handoff compaction.");
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const summaryPromise = new Promise<string>((resolve, reject) => {
        timeout = setTimeout(() => {
          this.compactionCollectors.delete(forkThreadId);
          reject(new Error("Codex handoff compaction timed out."));
        }, 90_000);

        this.compactionCollectors.set(forkThreadId, {
          text: "",
          resolve,
          reject
        });
      });

      const turnStart = this.request("turn/start", {
        threadId: forkThreadId,
        input: codexInput(codexHandoffPrompt(request.reason)),
        cwd,
        model: request.settings.model,
        effort: mapCodexEffort(request.settings.intelligence),
        ...codexTurnPermissionParams("Default permissions", cwd, "plan")
      });

      turnStart.catch(() => undefined);
      await Promise.race([
        turnStart,
        summaryPromise.then(() => undefined)
      ]);

      return await summaryPromise;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      this.compactionCollectors.delete(forkThreadId);
      await this.request("thread/archive", { threadId: forkThreadId })
        .catch(() => this.request("thread/unsubscribe", { threadId: forkThreadId }))
        .catch(() => undefined);
    }
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

    // Structured clarifying question (experimental app-server method). Surface
    // the options to the user and return their selection. The exact request /
    // response schema is still experimental in Codex, so parse defensively and
    // fall back to passing the question through if it can't be understood.
    if (isCodexQuestionMethod(method)) {
      const questions = parseCodexQuestions(params, session.id);
      const askQuestion = this.questionHandlers.get(session.id);

      if (questions.length > 0 && askQuestion) {
        const answers = await askQuestion({
          provider: "codex",
          sessionId: session.id,
          questions
        });
        this.write({ id, result: codexQuestionResult(questions, answers) });
        return;
      }

      this.write({ id, result: { answers: [] } });
      return;
    }

    const approval = codexApproval(method, params, session.id);
    const askApproval = this.approvalHandlers.get(session.id);
    const decision = askApproval ? await askApproval(approval) : "decline";

    this.write({ id, result: codexDecision(method, decision, params) });
  }

  private handleNotification(method: string, params: JsonRecord) {
    const threadId = asString(params.threadId);

    if (threadId && this.handleCompactionNotification(threadId, method, params)) {
      return;
    }

    const session = this.sessionForThread(asString(params.threadId));

    if (method === "thread/closed") {
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

      if (isCodexTranscriptItemType(itemType)) {
        return;
      }

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

  private handleCompactionNotification(
    threadId: string,
    method: string,
    params: JsonRecord
  ) {
    const collector = this.compactionCollectors.get(threadId);

    if (!collector) {
      return false;
    }

    if (method === "turn/started") {
      collector.turnId = stringAt(params, "turn", "id");
      return true;
    }

    if (method === "item/agentMessage/delta") {
      collector.text += asString(params.delta) ?? "";
      return true;
    }

    if (method === "item/completed") {
      const item = asRecord(params.item);

      if (asString(item.type) === "agentMessage") {
        collector.finalText = asString(item.text) ?? collector.finalText;
      }

      return true;
    }

    if (method === "turn/completed") {
      const status = codexTurnCompletionStatus(params);

      if (status === "error") {
        collector.reject(
          new Error(codexTurnErrorMessage(params) ?? "Codex handoff compaction failed.")
        );
      } else {
        collector.resolve((collector.finalText ?? collector.text).trim());
      }

      return true;
    }

    if (method.includes("error") || method.includes("failed")) {
      collector.reject(
        new Error(codexTurnErrorMessage(params) ?? `Codex reported ${method}`)
      );
      return true;
    }

    return true;
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

function codexHandoffPrompt(reason: string) {
  return [
    "Create a handoff summary for another model/provider that will resume this task.",
    "",
    "This is a Composer provider handoff. The next provider will not see your hidden reasoning or provider-local context, so preserve the actionable state needed to continue.",
    "",
    "Include:",
    "- Current user goal and latest explicit request.",
    "- Progress made and important decisions.",
    "- Files changed or inspected, with paths when known.",
    "- Commands and tests run, including outcomes when known.",
    "- Constraints, preferences, and assumptions that should carry forward.",
    "- Unresolved risks, blockers, or verification gaps.",
    "- Concrete next steps for the next provider.",
    "",
    "Rules:",
    "- Distinguish verified facts from assumptions.",
    "- Do not reveal hidden chain-of-thought or private reasoning.",
    "- Output Markdown only, without code fences.",
    "- Target 400-1200 words.",
    `- Handoff reason: ${reason}.`
  ].join("\n");
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

function isCodexQuestionMethod(method: string) {
  return (
    method === "tool/requestUserInput" ||
    method.endsWith("requestUserInput") ||
    method.endsWith("askUserQuestion")
  );
}

// Parse a Codex request_user_input payload into Composer's QuestionItem[].
// Field names vary across experimental builds, so accept the common aliases.
function parseCodexQuestions(params: JsonRecord, sessionId: string): QuestionItem[] {
  const raw = Array.isArray(params.questions)
    ? params.questions
    : Array.isArray(params.inputs)
      ? params.inputs
      : [];

  return raw
    .map((entry, index): QuestionItem | null => {
      const record = asRecord(entry);
      const question =
        asString(record.question) ?? asString(record.prompt) ?? asString(record.text) ?? "";
      if (!question) {
        return null;
      }

      const rawOptions = Array.isArray(record.options)
        ? record.options
        : Array.isArray(record.choices)
          ? record.choices
          : [];
      const options: QuestionItem["options"] = [];
      for (const option of rawOptions) {
        if (typeof option === "string") {
          options.push({ label: option });
          continue;
        }
        const optionRecord = asRecord(option);
        const label = asString(optionRecord.label) ?? asString(optionRecord.name) ?? asString(optionRecord.value);
        if (label) {
          options.push({ label, description: asString(optionRecord.description) });
        }
      }

      return {
        id: asString(record.id) ?? `${sessionId}-codex-q${index}`,
        question,
        header: asString(record.header) ?? asString(record.title),
        multiSelect: record.multiSelect === true || record.allowMultiple === true,
        allowCustom: true,
        options
      };
    })
    .filter((item): item is QuestionItem => item !== null);
}

// Best-effort response shape — provides the selection in several common forms
// (array + joined string, keyed by question text and id) since the exact schema
// is experimental.
function codexQuestionResult(questions: QuestionItem[], answers: QuestionAnswer[]) {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer.selected]));

  return {
    answers: questions.map((question) => {
      const selected = byId.get(question.id) ?? [];
      return {
        id: question.id,
        question: question.question,
        selected,
        answer: selected.join(", ")
      };
    })
  };
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

  if (tool && isWriteStdinTool(tool)) {
    return writeStdinLabel(item);
  }

  if (tool) {
    return `Use ${tool}`;
  }

  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function isCodexTranscriptItemType(itemType?: string) {
  return (
    itemType === "userMessage" ||
    itemType === "agentMessage" ||
    itemType === "reasoning"
  );
}

function toolDetail(id: string, label: string, item: JsonRecord): ToolDetail {
  const command = asString(item.command);
  const tool = asString(item.tool) ?? asString(item.name);
  const isTerminalInput = tool ? isWriteStdinTool(tool) : false;
  const reviewFiles = reviewFilesFromItem(item);
  const hasReviewFiles = reviewFiles.length > 0;

  return {
    id,
    label: hasReviewFiles
      ? patchReviewLabel(reviewFiles)
      : isTerminalInput
        ? writeStdinLabel(item)
        : label,
    kind: "call",
    tone: command && !hasReviewFiles && !isTerminalInput ? "command" : "default",
    action: hasReviewFiles ? "edit" : command && !isTerminalInput ? "command" : "other",
    command: hasReviewFiles || isTerminalInput ? undefined : command,
    args: isTerminalInput ? writeStdinArguments(item) : stringifyDetails(item),
    path: reviewFiles[0]?.path,
    reviewFiles: hasReviewFiles ? reviewFiles : undefined
  };
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

function writeStdinLabel(item: JsonRecord) {
  const input = toolArgumentsRecord(item);
  const sessionId = writeStdinSessionId(input);
  const chars = asString(input.chars);
  const base = chars && chars.length > 0
    ? "Sent input to terminal"
    : "Checked terminal output";

  return sessionId ? `${base} ${sessionId}` : base;
}

function writeStdinArguments(item: JsonRecord) {
  const input = toolArgumentsRecord(item);
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
    entries.push(["input", JSON.stringify(chars).slice(0, 600)]);
  }

  if (waitMs !== undefined) {
    entries.push(["wait", `${waitMs}ms`]);
  }

  return Object.fromEntries(entries);
}

function toolArgumentsRecord(item: JsonRecord) {
  const args = asString(item.arguments);

  if (args) {
    try {
      return asRecord(JSON.parse(args));
    } catch {
      return {};
    }
  }

  return item;
}

function writeStdinSessionId(input: JsonRecord) {
  const raw = input.session_id ?? input.sessionId;

  return typeof raw === "number" ? String(raw) : asString(raw);
}

function reviewFilesFromItem(item: JsonRecord) {
  return reviewFilesFromToolCall(
    asString(item.tool) ?? asString(item.name) ?? asString(item.type),
    item
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

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function stringAt(record: JsonRecord, ...path: string[]) {
  let value: unknown = record;

  for (const key of path) {
    value = asRecord(value)[key];
  }

  return asString(value);
}
