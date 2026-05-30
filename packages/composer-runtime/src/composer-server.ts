import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  type UIMessage
} from "ai";
import { WebSocketServer, type WebSocket } from "ws";

import { loadCapabilityCatalog, readCapabilityContent } from "./capabilities.js";
import {
  checkoutReviewBranch,
  loadReviewBranches,
  loadReviewDiff
} from "./review-diff.js";
import {
  parseProviderModel,
  parseSessionProvider
} from "@composer/client";
import type { AgentRuntime } from "./runtime.js";
import type {
  AgentImageAttachment,
  AgentSettings,
  ComposerChatDataTypes,
  LiveAgentEvent,
  SessionProvider,
  SessionSnapshot
} from "@composer/client";

type ComposerUIMessage = UIMessage<unknown, ComposerChatDataTypes>;

export type ComposerServerServices = {
  loadCapabilityCatalog?: typeof loadCapabilityCatalog;
  readCapabilityContent?: typeof readCapabilityContent;
  loadReviewDiff?: typeof loadReviewDiff;
  loadReviewBranches?: typeof loadReviewBranches;
  checkoutReviewBranch?: typeof checkoutReviewBranch;
};

export type ComposerServerListenOptions = {
  port?: number;
  host?: string;
};

export type ComposerServerInstance = {
  server: Server;
  wss: WebSocketServer;
  sockets: Set<WebSocket>;
  listen: (options?: ComposerServerListenOptions) => Promise<{ host: string; port: number }>;
  close: () => Promise<void>;
};

export function createComposerServer({
  runtime,
  services
}: {
  runtime: AgentRuntime;
  services?: ComposerServerServices;
}): ComposerServerInstance {
  const resolvedServices = {
    loadCapabilityCatalog: services?.loadCapabilityCatalog ?? loadCapabilityCatalog,
    readCapabilityContent: services?.readCapabilityContent ?? readCapabilityContent,
    loadReviewDiff: services?.loadReviewDiff ?? loadReviewDiff,
    loadReviewBranches: services?.loadReviewBranches ?? loadReviewBranches,
    checkoutReviewBranch: services?.checkoutReviewBranch ?? checkoutReviewBranch
  };
  const sockets = new Set<WebSocket>();
  let closing = false;

  // Memoized metadata-only snapshot for WS connect + session.list broadcasts.
  // Clients lazily fetch full transcripts via GET /api/sessions/:id on select,
  // so the broadcast snapshot strips items/pendingItems (mirroring
  // loadLocalSessionList's includeItems:false semantics). The serialized
  // snapshot body is cached and invalidated whenever a session mutates (every
  // mutation flows through broadcast()). Per-session live updates still arrive
  // via session.updated/session.patch events, which carry full content.
  let metadataSnapshotJson: string | undefined;

  function metadataSnapshotBody(): string {
    if (metadataSnapshotJson !== undefined) {
      return metadataSnapshotJson;
    }

    const { sessions, projects } = runtime.snapshot();
    const metadataSessions: SessionSnapshot["sessions"] = {};

    for (const [id, session] of Object.entries(sessions)) {
      metadataSessions[id] = {
        ...session,
        items: [],
        pendingItems: [],
        contentLoaded: false
      };
    }

    const snapshot: SessionSnapshot = { sessions: metadataSessions, projects };
    metadataSnapshotJson = JSON.stringify(snapshot);

    return metadataSnapshotJson;
  }

  function sendMetadataSnapshot(socket: WebSocket) {
    if (socket.readyState !== socket.OPEN) {
      return;
    }

    // Fresh id per send (matching other events), memoized snapshot body.
    socket.send(
      `{"id":${JSON.stringify(randomUUID())},"type":"sessions.snapshot","snapshot":${metadataSnapshotBody()}}`
    );
  }

  function invalidateMetadataSnapshot() {
    metadataSnapshotJson = undefined;
  }

  const server = createServer(async (request, response) => {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/capabilities") {
        writeJson(response, 200, await resolvedServices.loadCapabilityCatalog());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/capabilities/content") {
        const filePath = url.searchParams.get("path");

        if (!filePath) {
          writeJson(response, 400, { error: "Missing path" });
          return;
        }

        writeJson(response, 200, await resolvedServices.readCapabilityContent(filePath));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/chat") {
        await handleChatRequest(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/interrupt") {
        await handleInterruptRequest(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/review/diff") {
        await handleReviewDiffRequest(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/review/branches") {
        await handleReviewBranchesRequest(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/git/checkout-branch") {
        await handleBranchCheckoutRequest(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/sessions/visibility") {
        await handleSessionVisibilityRequest(request, response);
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
        await handleSessionLoadRequest(url, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/sessions/adopt-parallel") {
        await handleParallelAdoptionRequest(request, response);
        return;
      }

      writeJson(response, 404, { error: "Not found" });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    sockets.add(socket);
    sendMetadataSnapshot(socket);

    socket.on("message", async (raw) => {
      try {
        const message = JSON.parse(raw.toString("utf8")) as {
          type?: string;
          approvalId?: string;
          decision?: string;
          sessionId?: string;
          requestId?: string;
        };

        if (message.type === "session.list") {
          sendMetadataSnapshot(socket);
          return;
        }

        if (
          message.type === "approval.resolve" &&
          message.approvalId &&
          isApprovalDecision(message.decision)
        ) {
          runtime.resolveApproval(message.approvalId, message.decision);
          broadcast({
            id: randomUUID(),
            type: "approval.resolved",
            approvalId: message.approvalId
          });
          return;
        }

        if (message.type === "session.interrupt") {
          await interruptRuntime(message.sessionId, message.requestId);
        }
      } catch (error) {
        send(socket, {
          id: randomUUID(),
          type: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    socket.on("close", () => sockets.delete(socket));
  });

  const removeBroadcastListener = runtime.onBroadcast((event) => broadcast(event));

  async function handleChatRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const body = await readJson(request);
    const prompt = extractPrompt(body);
    const provider = parseProvider(body.provider);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const cwd = parseCwd(body.cwd);
    const settings: AgentSettings = {
      permissionMode:
        body.permissionMode === "Default permissions" ||
        body.permissionMode === "Auto-review" ||
        body.permissionMode === "Full access"
          ? body.permissionMode
          : "Default permissions",
      intelligence:
        body.intelligence === "Low" ||
        body.intelligence === "Medium" ||
        body.intelligence === "High" ||
        body.intelligence === "Extra High"
          ? body.intelligence
          : "High",
      model: parseModel(body.model, provider),
      composeAgents: parseComposeAgents(body.composeAgents)
    };
    const imageAttachments = extractImageAttachments(body);
    const requestId = typeof body.requestId === "string" ? body.requestId : undefined;
    const workTarget = parseWorkTarget(body);

    if (!prompt.trim()) {
      writeJson(response, 400, { error: "Missing prompt" });
      return;
    }

    let textPartStarted = false;
    const stream = createUIMessageStream<ComposerUIMessage>({
      execute: async ({ writer }) => {
        const writeEvent = (event: LiveAgentEvent) => {
          writer.write({
            type: "data-composer",
            id: event.id,
            data: event,
            transient: true
          });

          if (event.type === "message.delta") {
            if (!textPartStarted) {
              textPartStarted = true;
              writer.write({ type: "text-start", id: event.messageId });
            }

            writer.write({
              type: "text-delta",
              id: event.messageId,
              delta: event.delta
            });
          }

          if (event.type === "message.completed" && textPartStarted) {
            writer.write({ type: "text-end", id: event.messageId });
          }
        };

        try {
          if (sessionId) {
            await runtime.sendMessage(
              { sessionId, provider, prompt, cwd, settings, imageAttachments, requestId },
              writeEvent
            );
          } else {
            await runtime.createSession(
              { provider, prompt, cwd, settings, imageAttachments, requestId, workTarget },
              writeEvent
            );
          }
        } catch (error) {
          writeEvent({
            id: randomUUID(),
            type: "error",
            sessionId,
            requestId,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      },
      onError: (error) => (error instanceof Error ? error.message : String(error))
    });

    pipeUIMessageStreamToResponse({ response, stream });
  }

  async function handleInterruptRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const body = await readJson(request);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const requestId = typeof body.requestId === "string" ? body.requestId : undefined;

    await interruptRuntime(sessionId, requestId);
    writeJson(response, 200, { ok: true });
  }

  async function handleSessionVisibilityRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const body = await readJson(request);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const action = body.action === "archive" ? body.action : undefined;

    if (!sessionId || !action) {
      writeJson(response, 400, { error: "Expected sessionId and action" });
      return;
    }

    const snapshot: SessionSnapshot = runtime.updateSessionVisibility(sessionId, action);
    writeJson(response, 200, { ok: true, snapshot });
  }

  async function handleParallelAdoptionRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const body = await readJson(request);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const provider = body.provider === "codex" || body.provider === "claude"
      ? body.provider
      : undefined;

    if (!sessionId || !provider) {
      writeJson(response, 400, { error: "Expected sessionId and provider" });
      return;
    }

    const snapshot: SessionSnapshot = await runtime.adoptParallelThread(
      sessionId,
      provider
    );
    writeJson(response, 200, { ok: true, snapshot });
  }

  async function handleSessionLoadRequest(url: URL, response: ServerResponse) {
    const sessionId = decodeURIComponent(
      url.pathname.replace(/^\/api\/sessions\//, "")
    );

    if (!sessionId) {
      writeJson(response, 400, { error: "Expected session id" });
      return;
    }

    const session = await runtime.loadSessionContent(sessionId);

    if (!session) {
      writeJson(response, 404, { error: `Unknown session ${sessionId}` });
      return;
    }

    writeJson(response, 200, { ok: true, session });
  }

  async function handleReviewDiffRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const body = await readJson(request);
    const cwd = parseCwd(body.cwd);
    const filePath = typeof body.filePath === "string" ? body.filePath : undefined;
    const filePaths = Array.isArray(body.filePaths)
      ? body.filePaths.filter((value: unknown): value is string => typeof value === "string")
      : undefined;
    const scope =
      body.scope === "staged" ||
      body.scope === "commit" ||
      body.scope === "branch"
        ? body.scope
        : "unstaged";
    const diff = await resolvedServices.loadReviewDiff(cwd, {
      filePath: filePath ?? filePaths,
      scope,
      branchHeadRef: typeof body.branchHeadRef === "string"
        ? body.branchHeadRef
        : undefined,
      branchBaseRef: typeof body.branchBaseRef === "string"
        ? body.branchBaseRef
        : undefined
    });

    writeJson(response, 200, diff);
  }

  async function handleReviewBranchesRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const body = await readJson(request);
    const cwd = parseCwd(body.cwd);

    writeJson(response, 200, await resolvedServices.loadReviewBranches(cwd));
  }

  async function handleBranchCheckoutRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const body = await readJson(request);
    const cwd = parseCwd(body.cwd);
    const branch = typeof body.branch === "string" ? body.branch : undefined;

    if (!branch) {
      writeJson(response, 400, { error: "Expected branch" });
      return;
    }

    writeJson(response, 200, await resolvedServices.checkoutReviewBranch(cwd, branch));
  }

  async function interruptRuntime(sessionId?: string, requestId?: string) {
    if (sessionId) {
      await runtime.interrupt(sessionId);
      return;
    }

    if (requestId) {
      await runtime.interruptRequest(requestId);
    }
  }

  function broadcast(event: LiveAgentEvent) {
    // Every session mutation flows through broadcast(), so invalidate the
    // memoized metadata snapshot here.
    invalidateMetadataSnapshot();

    // Serialize once and send the identical payload to every open socket.
    const payload = JSON.stringify(event);

    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  async function listen(options: ComposerServerListenOptions = {}) {
    const requestedPort = options.port ?? 0;
    const host = options.host ?? "127.0.0.1";
    const port = Number.isFinite(requestedPort) ? requestedPort : 0;

    return await new Promise<{ host: string; port: number }>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        const resolvedPort = typeof address === "object" && address ? address.port : port;

        resolve({ host, port: resolvedPort });
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
  }

  async function close() {
    if (closing) {
      return;
    }

    closing = true;
    removeBroadcastListener();

    for (const socket of sockets) {
      socket.terminate();
    }

    await runtime.dispose();
    await closeWebSocketServer(wss);

    if (server.listening) {
      await closeHttpServer(server);
    }
  }

  return {
    server,
    wss,
    sockets,
    listen,
    close
  };
}

function send(socket: WebSocket, event: LiveAgentEvent) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function writeJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  const value = raw ? JSON.parse(raw) : {};

  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function extractPrompt(body: Record<string, unknown>) {
  if (typeof body.prompt === "string") {
    return body.prompt;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages.at(-1) as Record<string, unknown> | undefined;
  const parts = Array.isArray(last?.parts) ? last.parts : [];
  const text = parts
    .map((part) => {
      const record = part as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string"
        ? record.text
        : "";
    })
    .join("");

  return text;
}

function extractImageAttachments(body: Record<string, unknown>): AgentImageAttachment[] {
  if (!Array.isArray(body.imageAttachments)) {
    return [];
  }

  return body.imageAttachments
    .map((value) => value && typeof value === "object" ? value as Record<string, unknown> : null)
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .map((value) => ({
      name: typeof value.name === "string" ? value.name : "Image",
      mediaType: typeof value.mediaType === "string" ? value.mediaType : "image/png",
      dataUrl: typeof value.dataUrl === "string" ? value.dataUrl : undefined,
      path: typeof value.path === "string" ? value.path : undefined
    }))
    .filter((attachment) => attachment.dataUrl || attachment.path);
}

function parseProvider(value: unknown): SessionProvider {
  return parseSessionProvider(value);
}

function parseModel(value: unknown, provider: SessionProvider) {
  return parseProviderModel(value, provider);
}

function parseComposeAgents(value: unknown): AgentSettings["composeAgents"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const agents: AgentSettings["composeAgents"] = {};

  for (const provider of ["codex", "claude"] as const) {
    const raw = record[provider];

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }

    const agent = raw as Record<string, unknown>;
    const model = parseProviderModel(agent.model, provider);
    const intelligence = parseIntelligence(agent.intelligence);

    if (model || intelligence) {
      agents[provider] = { model, intelligence };
    }
  }

  return Object.keys(agents).length > 0 ? agents : undefined;
}

function parseIntelligence(value: unknown) {
  return value === "Low" ||
    value === "Medium" ||
    value === "High" ||
    value === "Extra High"
    ? value
    : undefined;
}

function parseCwd(value: unknown) {
  if (typeof value === "string") {
    const candidate = value.trim();

    if (candidate && path.isAbsolute(candidate)) {
      return candidate;
    }
  }

  return process.cwd();
}

function parseWorkTarget(body: Record<string, unknown>) {
  const mode: "local" | "worktree" =
    body.workTarget === "worktree" ? "worktree" : "local";
  const branch =
    typeof body.branch === "string" && body.branch.trim()
      ? body.branch.trim()
      : undefined;

  return { mode, branch };
}

function isApprovalDecision(value: unknown): value is "accept" | "acceptForSession" | "decline" | "cancel" {
  return (
    value === "accept" ||
    value === "acceptForSession" ||
    value === "decline" ||
    value === "cancel"
  );
}

function closeWebSocketServer(wss: WebSocketServer) {
  return new Promise<void>((resolve, reject) => {
    wss.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeHttpServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
