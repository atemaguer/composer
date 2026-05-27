import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  type UIMessage
} from "ai";

import { loadLocalSessions } from "../electron/session-loader.js";
import { loadCapabilityCatalog, readCapabilityContent } from "./capabilities.js";
import {
  checkoutReviewBranch,
  loadReviewBranches,
  loadReviewDiff
} from "./review-diff.js";
import { AgentRuntime } from "./runtime.js";
import type {
  AgentSettings,
  AgentImageAttachment,
  ComposerChatDataTypes,
  LiveAgentEvent,
  SessionSnapshot,
  SessionProvider
} from "../src/types.js";

type ComposerUIMessage = UIMessage<unknown, ComposerChatDataTypes>;

const runtime = new AgentRuntime(loadLocalSessions());
const sockets = new Set<WebSocket>();

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
      writeJson(response, 200, await loadCapabilityCatalog());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/capabilities/content") {
      const filePath = url.searchParams.get("path");

      if (!filePath) {
        writeJson(response, 400, { error: "Missing path" });
        return;
      }

      writeJson(response, 200, await readCapabilityContent(filePath));
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
  send(socket, { id: randomUUID(), type: "sessions.snapshot", snapshot: runtime.snapshot() });

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
        send(socket, {
          id: randomUUID(),
          type: "sessions.snapshot",
          snapshot: runtime.snapshot()
        });
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

runtime.onBroadcast((event) => broadcast(event));

const requestedPort = Number(process.env.COMPOSER_AGENT_SERVER_PORT ?? 0);

server.listen(Number.isFinite(requestedPort) ? requestedPort : 0, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;

  console.log(`COMPOSER_AGENT_SERVER_READY ${port}`);
});

let shuttingDown = false;

process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGHUP", () => {
  void shutdown();
});
process.once("disconnect", () => {
  void shutdown();
});

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
    model: parseModel(body.model, provider)
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

  const snapshot: SessionSnapshot = runtime.adoptParallelThread(sessionId, provider);
  writeJson(response, 200, { ok: true, snapshot });
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
  const diff = await loadReviewDiff(cwd, {
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

  writeJson(response, 200, await loadReviewBranches(cwd));
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

  writeJson(response, 200, await checkoutReviewBranch(cwd, branch));
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
  for (const socket of sockets) {
    send(socket, event);
  }
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

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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
  if (value === "claude" || value === "meta") {
    return value;
  }

  return "codex";
}

function parseModel(value: unknown, provider: SessionProvider) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const model = value.trim();
  const allowedModels =
    provider === "meta"
      ? [
          "meta-claude-opus-codex-mini",
          "meta-planner-review",
          "meta-parallel-initial"
        ]
      : provider === "claude"
      ? ["claude-sonnet-4-6", "claude-opus-4-7"]
      : ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"];

  return allowedModels.includes(model) ? model : undefined;
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

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const socket of sockets) {
    socket.terminate();
  }

  await runtime.dispose();
  await new Promise<void>((resolve) => {
    wss.close(() => {
      server.close(() => resolve());
    });
  });

  process.exit(0);
}
