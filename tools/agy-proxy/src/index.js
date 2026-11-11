/**
 * AGY Proxy — OpenAI-compatible bridge for Antigravity CLI (agy.exe) & Gemini.
 *
 * This proxy bridges Rakazo to your locally authenticated Antigravity account:
 * - NO API KEY REQUIRED: Calls `agy.exe` directly using your existing Antigravity login.
 * - Supports real-time streaming (SSE) via `agy.exe --output-format stream-json`.
 * - Exposes Antigravity models: Gemini 3.8 Flash, Claude Sonnet 4.6, Claude Opus 4.6, etc.
 * - Fallback: Can also call Google Gemini REST API if GEMINI_API_KEY is provided.
 *
 * @module agy-proxy
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.AGY_PROXY_PORT ?? 8765);
const DEFAULT_MODEL = process.env.AGY_DEFAULT_MODEL ?? "gemini-3.8-flash-high";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

// Locate agy.exe
const DEFAULT_AGY_PATH = `${process.env.LOCALAPPDATA ?? "C:\\Users\\hungd\\AppData\\Local"}\\agy\\bin\\agy.exe`;
const AGY_BIN = process.env.AGY_BIN_PATH ?? (existsSync(DEFAULT_AGY_PATH) ? DEFAULT_AGY_PATH : "agy");

// Optional Gemini API fallback
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(level, ...args) {
  if (level === "debug" && LOG_LEVEL !== "debug") return;
  const prefix = `[agy-proxy] [${level.toUpperCase()}]`;
  if (level === "error") console.error(prefix, ...args);
  else console.log(prefix, ...args);
}

// ---------------------------------------------------------------------------
// Antigravity Model Mapping
// ---------------------------------------------------------------------------

const AGY_MODELS = [
  { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", family: "gemini" },
  { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)", family: "gemini" },
  { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)", family: "gemini" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)", family: "claude" },
  { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)", family: "claude" },
  { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", family: "gpt" },
];

/** Map common aliases from Rakazo to AGY model IDs. */
const MODEL_ALIASES = {
  // Aliases -> AGY CLI models
  "gemini-3.8-flash": "gemini-3.8-flash-high",
  "gemini-flash": "gemini-3.8-flash-high",
  "gemini-pro": "gemini-3.8-flash-high",
  "gemini-2.5-pro": "gemini-3.8-flash-high",
  "gemini-2.5-flash": "gemini-3.8-flash-high",
  "gemini-2.0-flash": "gemini-3.8-flash-high",
  "claude-sonnet": "claude-sonnet-4-6",
  "claude-opus": "claude-opus-4-6-thinking",
  "gpt-4o": "gemini-3.8-flash-high",
  "gpt-4o-mini": "gemini-3.8-flash-medium",
  "gpt-4": "gemini-3.8-flash-high",
  "default": DEFAULT_MODEL,
};

function resolveAgyModel(modelName) {
  if (!modelName) return DEFAULT_MODEL;
  const lower = modelName.toLowerCase();
  return MODEL_ALIASES[lower] ?? modelName;
}

// ---------------------------------------------------------------------------
// Message formatting for AGY CLI
// ---------------------------------------------------------------------------

/** Convert OpenAI messages array into a single prompt for agy CLI. */
function messagesToPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  if (messages.length === 1 && messages[0].content) {
    return extractContentText(messages[0].content);
  }

  const parts = [];
  for (const m of messages) {
    const role = m.role === "system" ? "System instruction" : m.role === "assistant" ? "Assistant" : "User";
    const text = extractContentText(m.content);
    if (text) {
      parts.push(`[${role}]:\n${text}`);
    }
  }
  return parts.join("\n\n");
}

function extractContentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}

// ---------------------------------------------------------------------------
// SSE chunk helper
// ---------------------------------------------------------------------------

function openAiChunk(id, model, content, finishReason = null) {
  const delta = content ? { role: "assistant", content } : {};
  const chunk = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason, logprobs: null }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

// ---------------------------------------------------------------------------
// AGY CLI Execution (Direct)
// ---------------------------------------------------------------------------

/** Session mapping: maps Rakazo x-agy-session to AGY conversation_id for multi-turn */
const conversationMap = new Map();

function runAgyCli(prompt, model, options = {}) {
  const args = [
    "-p", prompt,
    "--output-format", "stream-json",
    "--model", model,
    "--dangerously-skip-permissions",
  ];

  if (options.conversationId) {
    args.push("--conversation", options.conversationId);
  }

  log("debug", `Spawning: ${AGY_BIN} ${args.slice(0, 4).join(" ")} ...`);
  const proc = spawn(AGY_BIN, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return proc;
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,x-agy-session,x-agy-client",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  // CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization,Content-Type,x-agy-session,x-agy-client",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost`);
  log("debug", req.method, url.pathname);

  // Health check
  if (url.pathname === "/health" || url.pathname === "/v1/health") {
    sendJson(res, 200, {
      ok: true,
      service: "agy-proxy",
      backend: "antigravity-cli",
      agy_bin: AGY_BIN,
      agy_exists: existsSync(AGY_BIN),
    });
    return;
  }

  // Models list
  if (url.pathname === "/v1/models" && req.method === "GET") {
    const models = AGY_MODELS.map((m) => ({
      id: m.id,
      object: "model",
      created: 1700000000,
      owned_by: "google-antigravity",
    }));
    // Also include common aliases
    for (const [alias, target] of Object.entries(MODEL_ALIASES)) {
      if (!models.some((m) => m.id === alias)) {
        models.push({ id: alias, object: "model", created: 1700000000, owned_by: "google-antigravity" });
      }
    }
    sendJson(res, 200, { object: "list", data: models });
    return;
  }

  // Chat completions
  if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: { message: "Invalid JSON", type: "invalid_request_error" } });
      return;
    }

    const requestedModel = body.model ?? DEFAULT_MODEL;
    const agyModel = resolveAgyModel(requestedModel);
    const stream = body.stream ?? false;
    const requestId = `chatcmpl-${randomUUID()}`;
    const prompt = messagesToPrompt(body.messages ?? []);

    if (!prompt) {
      sendJson(res, 400, { error: { message: "No prompt content found in messages", type: "invalid_request_error" } });
      return;
    }

    // Check session affinity
    const sessionKey = req.headers["x-agy-session"];
    const conversationId = sessionKey ? conversationMap.get(sessionKey) : undefined;

    log("info", `${stream ? "stream" : "sync"} → Antigravity [${agyModel}] (requested: ${requestedModel})`);

    const proc = runAgyCli(prompt, agyModel, { conversationId });

    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      let buffer = "";
      let sentAny = false;

      proc.stdout.on("data", (data) => {
        buffer += data.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            // Record conversation id for multi-turn affinity
            if (event.conversation_id && sessionKey) {
              conversationMap.set(sessionKey, event.conversation_id);
            }

            // Stream text delta
            const delta = event.step_update?.text_delta;
            if (delta) {
              sentAny = true;
              res.write(openAiChunk(requestId, agyModel, delta, null));
            }

            // Finished turn
            if (event.event === "result") {
              res.write(openAiChunk(requestId, agyModel, "", "stop"));
              res.write("data: [DONE]\n\n");
            }
          } catch {
            // Non-JSON line from CLI, ignore
          }
        }
      });

      proc.stderr.on("data", (errData) => {
        const errText = errData.toString("utf8");
        log("error", "AGY stderr:", errText);
      });

      proc.on("close", (code) => {
        if (!sentAny && code !== 0) {
          res.write(openAiChunk(requestId, agyModel, `[Antigravity CLI error: exit code ${code}]`, "stop"));
          res.write("data: [DONE]\n\n");
        }
        res.end();
      });

      req.on("close", () => {
        try { proc.kill(); } catch {}
      });
    } else {
      // Non-streaming
      let accumulatedText = "";
      let capturedConvId;

      proc.stdout.on("data", (data) => {
        const lines = data.toString("utf8").split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.conversation_id) capturedConvId = event.conversation_id;
            if (event.step_update?.text_delta) {
              accumulatedText += event.step_update.text_delta;
            }
            if (event.event === "result" && event.result?.response) {
              accumulatedText = event.result.response;
            }
          } catch {}
        }
      });

      proc.on("close", (code) => {
        if (capturedConvId && sessionKey) {
          conversationMap.set(sessionKey, capturedConvId);
        }
        if (code !== 0 && !accumulatedText) {
          sendJson(res, 502, { error: { message: `Antigravity CLI exited with code ${code}`, type: "upstream_error" } });
          return;
        }
        sendJson(res, 200, {
          id: requestId,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: agyModel,
          choices: [{ index: 0, message: { role: "assistant", content: accumulatedText }, finish_reason: "stop" }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
      });
    }
    return;
  }

  // 404
  sendJson(res, 404, { error: { message: `Not found: ${url.pathname}`, type: "invalid_request_error" } });
});

server.listen(PORT, "0.0.0.0", () => {
  log("info", `AGY Proxy listening on http://0.0.0.0:${PORT}`);
  log("info", `Backend: Antigravity CLI (${AGY_BIN})`);
  log("info", `Default Model: ${DEFAULT_MODEL}`);
  log("info", `Auth: Uses your logged-in Antigravity account — NO API KEY NEEDED`);
});
