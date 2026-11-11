/**
 * Smoke test for agy-proxy (Direct AGY CLI mode)
 */
import assert from "node:assert";

const BASE = "http://127.0.0.1:8765";

async function run() {
  console.log("1. Testing /health...");
  const healthRes = await fetch(`${BASE}/health`);
  assert.strictEqual(healthRes.status, 200, "Health status should be 200");
  const healthData = await healthRes.json();
  assert.strictEqual(healthData.ok, true, "Health ok should be true");
  assert.strictEqual(healthData.backend, "antigravity-cli");
  assert.strictEqual(healthData.agy_exists, true, "agy.exe must exist");
  console.log("   ✓ /health ok (Backend: Antigravity CLI)");

  console.log("2. Testing /v1/models...");
  const modelsRes = await fetch(`${BASE}/v1/models`);
  assert.strictEqual(modelsRes.status, 200, "Models status should be 200");
  const modelsData = await modelsRes.json();
  assert.strictEqual(modelsData.object, "list");
  const modelIds = modelsData.data.map((m) => m.id);
  assert(modelIds.includes("gemini-3.8-flash-high"), "should list gemini-3.8-flash-high");
  assert(modelIds.includes("claude-sonnet-4-6"), "should list claude-sonnet-4-6");
  console.log(`   ✓ /v1/models ok (${modelsData.data.length} models listed)`);

  console.log("3. Testing /v1/chat/completions (AGY CLI execution without key)...");
  const chatRes = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.8-flash-high",
      messages: [{ role: "user", content: "Say OK in 1 word" }],
    }),
  });
  assert.strictEqual(chatRes.status, 200, "Chat completion should succeed with 200");
  const chatData = await chatRes.json();
  assert(chatData.choices?.[0]?.message?.content, "Should receive message content from AGY");
  console.log(`   ✓ /v1/chat/completions ok: "${chatData.choices[0].message.content.trim()}"`);

  console.log("\nAll smoke tests passed! Antigravity CLI integration verified.");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
