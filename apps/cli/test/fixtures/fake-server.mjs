import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";

const port = Number(process.env.COMPOSER_AGENT_SERVER_PORT ?? 0);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/interrupt") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    const body = await readJson(request);

    response.writeHead(200, { "content-type": "text/event-stream" });
    if (body.prompt === "approval") {
      writeEvent(response, {
        id: "event-approval-requested",
        type: "approval.requested",
        sessionId: "fake-session",
        approval: {
          id: "fake-approval",
          title: "Fake approval"
        }
      });
      return;
    }

    writeEvent(response, {
      id: "event-session-started",
      type: "session.started",
      session: {
        id: "fake-session",
        provider: body.provider,
        cwd: body.cwd,
        settings: {
          model: body.model,
          permissionMode: body.permissionMode,
          intelligence: body.intelligence
        }
      }
    });
    writeEvent(response, {
      id: "event-turn-started",
      type: "turn.started",
      sessionId: "fake-session",
      turnId: "fake-turn",
      label: "Fake turn"
    });
    writeEvent(response, {
      id: "event-tool-started",
      type: "tool.started",
      sessionId: "fake-session",
      toolId: "fake-tool",
      label: "fake tool"
    });
    writeEvent(response, {
      id: "event-message-delta",
      type: "message.delta",
      sessionId: "fake-session",
      messageId: "fake-message",
      delta: typeof body.prompt === "string" ? body.prompt : ""
    });
    writeEvent(response, {
      id: "event-message-completed",
      type: "message.completed",
      sessionId: "fake-session",
      messageId: "fake-message",
      body: typeof body.prompt === "string" ? body.prompt : ""
    });
    writeEvent(response, {
      id: "event-tool-completed",
      type: "tool.completed",
      sessionId: "fake-session",
      toolId: "fake-tool",
      label: "fake tool"
    });
    writeEvent(response, {
      id: "event-turn-completed",
      type: "turn.completed",
      sessionId: "fake-session",
      turnId: "fake-turn",
      status: "idle"
    });
    response.end();
    return;
  }

  writeJson(response, 404, { error: "Not found" });
});

server.listen(Number.isFinite(port) ? port : 0, "127.0.0.1", () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  process.stdout.write(`COMPOSER_AGENT_SERVER_READY ${actualPort}\n`);
});

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

async function shutdown() {
  if (process.env.FAKE_SERVER_EXIT_MARKER) {
    await writeFile(process.env.FAKE_SERVER_EXIT_MARKER, "stopped", "utf8");
  }

  server.close(() => process.exit(0));
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function writeJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function writeEvent(response, event) {
  response.write(`data: ${JSON.stringify({ type: "data-composer", data: event })}\n\n`);
}
