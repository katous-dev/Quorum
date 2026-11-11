import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { afterEach, describe, expect, it } from "vitest";
import {
  ANTIGRAVITY_CATALOG_MODELS,
  ANTIGRAVITY_CLIENT_HEADER,
  ANTIGRAVITY_CLIENT_VALUE,
  ANTIGRAVITY_DEFAULT_MODEL,
  ANTIGRAVITY_PROVIDER,
  ANTIGRAVITY_PROXY_ENV_KEY,
  ANTIGRAVITY_SESSION_HEADER,
  antigravityEndpointPreset,
  antigravityProvider,
  antigravityProxyBaseUrl,
  registerAntigravityProvider,
  resolvedAntigravityBaseUrl,
} from "./pi-antigravity-provider.js";
import { loadProviderOAuth, SUBSCRIPTION_SIGN_IN_PROVIDERS } from "./pi-oauth.js";

const savedProxyUrl = process.env[ANTIGRAVITY_PROXY_ENV_KEY];

afterEach(() => {
  if (savedProxyUrl === undefined) delete process.env[ANTIGRAVITY_PROXY_ENV_KEY];
  else process.env[ANTIGRAVITY_PROXY_ENV_KEY] = savedProxyUrl;
});

describe("Antigravity model provider adapter", () => {
  it("uses the canonical provider identifier", () => {
    expect(ANTIGRAVITY_PROVIDER).toBe("antigravity");
  });

  it("defaults to host.docker.internal:8765 when RAKAZO_ANTIGRAVITY_PROXY_URL is unset", () => {
    delete process.env[ANTIGRAVITY_PROXY_ENV_KEY];
    expect(antigravityProxyBaseUrl()).toBeNull();
    expect(resolvedAntigravityBaseUrl()).toBe("http://host.docker.internal:8765/v1");
  });

  it("honors RAKAZO_ANTIGRAVITY_PROXY_URL and strips trailing slashes", () => {
    process.env[ANTIGRAVITY_PROXY_ENV_KEY] = "http://127.0.0.1:9999/v1///";
    expect(antigravityProxyBaseUrl()).toBe("http://127.0.0.1:9999/v1");
    expect(resolvedAntigravityBaseUrl()).toBe("http://127.0.0.1:9999/v1");
  });

  it("exposes the expected catalog models", () => {
    const provider = antigravityProvider();
    expect(provider.id).toBe("antigravity");
    expect(provider.name).toBe("Antigravity");

    const modelIds = provider.getModels().map((m) => m.id);
    expect(modelIds).toContain("gemini-3.8-flash-high");
    expect(modelIds).toContain("claude-sonnet-4-6");
    expect(modelIds).toContain("claude-opus-4-6-thinking");
    expect(ANTIGRAVITY_DEFAULT_MODEL).toBe("gemini-3.8-flash-high");
  });

  it("sets zero cost for proxy models", () => {
    const models = antigravityProvider().getModels();
    for (const model of models) {
      expect(model.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    }
  });

  it("registers itself into a MutableModels registry", () => {
    const models = registerAntigravityProvider(builtinModels());
    const provider = models.getProvider("antigravity");
    expect(provider).toBeDefined();
    expect(provider?.id).toBe("antigravity");
    expect(provider?.getModels().length).toBe(ANTIGRAVITY_CATALOG_MODELS.length);
  });

  it("defines the expected session affinity headers", () => {
    expect(ANTIGRAVITY_SESSION_HEADER).toBe("x-agy-session");
    expect(ANTIGRAVITY_CLIENT_HEADER).toBe("x-agy-client");
    expect(ANTIGRAVITY_CLIENT_VALUE).toBe("rakazo");
  });

  it("provides an OpenAI-compatible preset entry", () => {
    const preset = antigravityEndpointPreset();
    expect(preset).not.toBeNull();
    expect(preset?.label).toContain("Antigravity");
    expect(preset?.baseUrl).toBe(resolvedAntigravityBaseUrl());
  });

  it("registers in SUBSCRIPTION_SIGN_IN_PROVIDERS with auth-url mode", () => {
    const entry = SUBSCRIPTION_SIGN_IN_PROVIDERS[ANTIGRAVITY_PROVIDER];
    expect(entry).toBeDefined();
    expect(entry?.mode).toBe("auth-url");
    expect(entry?.loginLabel).toBe("Connect Antigravity");
  });

  it("provides an OAuth handler for token resolution", async () => {
    const oauth = loadProviderOAuth("antigravity");
    expect(oauth).toBeDefined();
    expect(oauth?.isSubscription).toBe(true);

    const cred = { type: "oauth" as const, access: "test-token-123", expires: Date.now() + 10000 };
    const auth = await oauth?.toAuth(cred);
    expect(auth?.apiKey).toBe("test-token-123");

    const refreshed = await oauth?.refresh(cred, new AbortController().signal);
    expect(refreshed).toEqual(cred);
  });
});
