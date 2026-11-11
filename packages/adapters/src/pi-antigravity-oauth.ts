import type { AuthInteraction, OAuthCredential } from "@earendil-works/pi-ai";
import { assertHeaderSafeApiKey } from "@rakazo/contracts";

export interface AntigravityOAuthOptions {
  verifyKey?: boolean;
}

/**
 * Manual sign-in flow for Antigravity:
 * Shows the user a link to Google AI Studio to get a key, or prompts them
 * to paste their Gemini API key / local AGY proxy token.
 */
export function createManualAntigravityOAuthLogin(_options: AntigravityOAuthOptions = {}) {
  return async (interaction: AuthInteraction): Promise<OAuthCredential> => {
    const signal = interaction.signal ?? new AbortController().signal;

    interaction.notify({
      type: "auth_url",
      url: "https://aistudio.google.com/apikey",
      instructions: "Get an API key from Google AI Studio, or use your local Antigravity proxy token.",
    });

    const input = await interaction.prompt({
      type: "manual_code",
      message: "Paste your Gemini API key or Antigravity proxy token:",
      signal,
    });

    const token = input.trim();
    if (!token) throw new Error("API key or token is required.");
    assertHeaderSafeApiKey(token);

    return {
      type: "oauth",
      access: token,
      // 1 year validity before requiring reconnect
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    };
  };
}
