/**
 * Antigravity provider adapter for the pi-ai model runtime.
 *
 * Routes model requests through a local OpenAI-compatible proxy that
 * forwards to Gemini API (or any other backend the proxy is configured for).
 * The proxy URL is read from RAKAZO_ANTIGRAVITY_PROXY_URL; if not set, the
 * provider falls back to http://host.docker.internal:8765/v1.
 *
 * Provider-neutral contract: nothing in this file names any vendor SDK or
 * external service directly — the proxy is the only boundary.
 */

import type { Model, MutableModels, Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { createProvider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { Dispatcher } from "undici";
import { Agent } from "undici";
import { MODEL_STREAM_AGENT_TIMEOUTS } from "./pi-runtime-limits.js";
import { fetchPairedWithDispatcher } from "./undici-fetch.js";

export const ANTIGRAVITY_PROVIDER = "antigravity";
export const ANTIGRAVITY_PROXY_ENV_KEY = "RAKAZO_ANTIGRAVITY_PROXY_URL";

/**
 * Default proxy URL when running inside Docker Compose alongside the agy-proxy
 * service (see tools/agy-proxy). host.docker.internal resolves to the Docker
 * host, where the proxy listens on port 8765.
 */
const DEFAULT_PROXY_URL = "http://host.docker.internal:8765/v1";

/** True when the deployment has an Antigravity proxy or key configured. */
export function isAntigravityConfigured(): boolean {
  return Boolean(antigravityProxyBaseUrl() || process.env.GEMINI_API_KEY);
}

/**
 * Base URL for the Antigravity proxy, or null when not explicitly set in env.
 * Trailing slash is normalised away so callers can append paths directly.
 */
export function antigravityProxyBaseUrl(): string | null {
  const raw = process.env[ANTIGRAVITY_PROXY_ENV_KEY];
  if (!raw) return null;
  return raw.trim().replace(/\/+$/, "");
}

export function resolvedAntigravityBaseUrl(): string {
  return antigravityProxyBaseUrl() ?? DEFAULT_PROXY_URL;
}

/**
 * Virtual model catalog entries exposed when the proxy is active.
 */
export interface AntigravityModelEntry {
  id: string;
  label: string;
  reasoning: boolean;
}

export const ANTIGRAVITY_CATALOG_MODELS: readonly AntigravityModelEntry[] = [
  { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)", reasoning: true },
  { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)", reasoning: true },
  { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)", reasoning: false },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)", reasoning: true },
  { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)", reasoning: true },
  { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", reasoning: true },
];

/** Suggested default model id for new Antigravity connections. */
export const ANTIGRAVITY_DEFAULT_MODEL = "gemini-3.8-flash-high";

/**
 * Session header injected on every request to the proxy so the proxy can
 * correlate streaming sessions (similar to x-opencode-session for OpenCode).
 */
export const ANTIGRAVITY_SESSION_HEADER = "x-agy-session";
export const ANTIGRAVITY_CLIENT_HEADER = "x-agy-client";
export const ANTIGRAVITY_CLIENT_VALUE = "rakazo";

/**
 * OpenAI-compatible preset entry for the Antigravity proxy.
 * Inserted into COMPATIBLE_ENDPOINT_PRESETS so users can select it from the
 * dropdown instead of typing the URL manually.
 */
export function antigravityEndpointPreset(): {
  label: string;
  baseUrl: string;
  hint: string;
} | null {
  const url = resolvedAntigravityBaseUrl();
  return {
    label: "Antigravity (local proxy)",
    baseUrl: url,
    hint: "Paste your Gemini API key, or the key passed to the agy-proxy.",
  };
}

let antigravityDispatcher: Dispatcher | undefined;

function antigravityFetch(baseFetch?: typeof globalThis.fetch): typeof globalThis.fetch {
  antigravityDispatcher ??= new Agent(MODEL_STREAM_AGENT_TIMEOUTS);
  const dispatcher = antigravityDispatcher;
  const transport = fetchPairedWithDispatcher(baseFetch);
  return (input, init) =>
    transport(input, { ...init, dispatcher } as RequestInit & { dispatcher: Dispatcher });
}

function antigravityApi(): ProviderStreams {
  const api = openAICompletionsApi();
  return {
    stream: (model, context, options) =>
      api.stream(model, context, { ...options, fetch: antigravityFetch(options?.fetch) }),
    streamSimple: (model, context, options) =>
      api.streamSimple(model, context, { ...options, fetch: antigravityFetch(options?.fetch) }),
  };
}

function antigravityModel(entry: AntigravityModelEntry): Model<"openai-completions"> {
  const baseUrl = resolvedAntigravityBaseUrl();
  return {
    id: entry.id,
    name: entry.label,
    api: "openai-completions",
    provider: ANTIGRAVITY_PROVIDER,
    baseUrl,
    reasoning: entry.reasoning,
    compat: entry.reasoning
      ? { supportsDeveloperRole: false, supportsReasoningEffort: true, thinkingFormat: "openai" }
      : { supportsDeveloperRole: false, supportsReasoningEffort: false },
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 8_192,
  };
}

export function antigravityProvider(): Provider {
  const baseUrl = resolvedAntigravityBaseUrl();
  return createProvider({
    id: ANTIGRAVITY_PROVIDER,
    name: "Antigravity",
    baseUrl,
    auth: {
      apiKey: {
        name: "Antigravity API key",
        resolve: async () => ({
          auth: { apiKey: process.env.GEMINI_API_KEY ?? "antigravity", baseUrl },
          source: "antigravity proxy",
        }),
      },
      oauth: {
        name: "Antigravity",
        loginLabel: "Connect Antigravity",
        isSubscription: true,
        refresh: async (credential) => credential,
        toAuth: async (credential) => ({ apiKey: credential.access }),
      },
    },
    models: ANTIGRAVITY_CATALOG_MODELS.map(antigravityModel),
    api: antigravityApi(),
  });
}

/**
 * Register the Antigravity provider in the Pi models registry.
 */
export function registerAntigravityProvider(models: MutableModels): MutableModels {
  models.setProvider(antigravityProvider());
  return models;
}
