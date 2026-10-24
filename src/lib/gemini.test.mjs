import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGeminiModel, buildGeminiRequest, extractGeminiText, geminiErrorMessage } from "./gemini.ts";
import { generateGeminiContent } from "./gemini.server.ts";
import { lovableAiChat } from "./lovable-ai.server.ts";
import { buildMediaAnalysisMessages, detectMedia, maxBytesFor } from "./whatsapp-media.ts";

test("direct Gemini defaults to 3.8 and maps both legacy spellings", () => {
  for (const model of [undefined, "", "  ", "google/gemini-2.5-flash", "gemini-2.5-flash"]) {
    assert.equal(normalizeGeminiModel(model), "gemini-3.8-flash");
  }
});
test("normalization removes only the vendor prefix and preserves other selected models", () => {
  assert.equal(normalizeGeminiModel(" google/gemini-3.8-flash "), "gemini-3.8-flash");
  assert.equal(normalizeGeminiModel("google/gemini-custom"), "gemini-custom");
});
test("conversation maps system separately and preserves user/model order", () => {
  assert.deepEqual(buildGeminiRequest([
    { role: "system", content: "regras" }, { role: "user", content: "oi" },
    { role: "assistant", content: "olá" }, { role: "system", content: "contexto" },
    { role: "user", content: "preço?" },
  ]), {
    systemInstruction: { parts: [{ text: "regras\n\ncontexto" }] },
    contents: [
      { role: "user", parts: [{ text: "oi" }] },
      { role: "model", parts: [{ text: "olá" }] },
      { role: "user", parts: [{ text: "preço?" }] },
    ],
  });
  assert.equal("systemInstruction" in buildGeminiRequest([{ role: "user", content: "oi" }]), false);
});
test("response concatenates visible text only from the first candidate", () => {
  assert.equal(extractGeminiText({ candidates: [
    { finishReason: "STOP", content: { parts: [{ text: "privado", thought: true }, { text: " olá" }, { text: " mundo " }] } },
    { content: { parts: [{ text: "alternativa" }] } },
  ] }), "olá mundo");
});
test("blocked and empty responses never become invented assistant replies", () => {
  assert.throws(() => extractGeminiText({ promptFeedback: { blockReason: "SAFETY" } }), /não pôde responder/);
  assert.throws(() => extractGeminiText({ candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "parcial" }] } }] }), /não pôde responder/);
  assert.throws(() => extractGeminiText({ candidates: [] }), /resposta vazia/);
});
test("errors distinguish temporary limits and unauthorized keys without raw bodies", () => {
  assert.match(geminiErrorMessage(429), /Limite temporário/);
  assert.equal(geminiErrorMessage(401), "Chave Gemini não autorizada.");
  assert.equal(geminiErrorMessage(403), "Chave Gemini não autorizada.");
  assert.equal(geminiErrorMessage(500), "Não foi possível obter uma resposta do Gemini (HTTP 500).");
});
test("media uses native inlineData and keeps exact MIME for each supported recording", () => {
  for (const mimeType of ["audio/ogg", "audio/mp4", "audio/webm", "audio/mpeg", "audio/wav", "audio/flac", "image/png", "image/jpeg"]) {
    const media = detectMedia({ documentMessage: { mimetype: mimeType } });
    const [content] = buildMediaAnalysisMessages(media, "QUJD");
    assert.equal(content.role, "user");
    assert.deepEqual(content.parts[1], { inlineData: { data: "QUJD", mimeType } });
  }
  assert.throws(() => buildMediaAnalysisMessages(detectMedia({ audioMessage: {} }), " "), /Mídia vazia/);
});
test("media size limits remain 5 MiB images and 10 MiB audio", () => {
  assert.equal(maxBytesFor("image"), 5 * 1024 * 1024);
  assert.equal(maxBytesFor("audio"), 10 * 1024 * 1024);
});

// All transport tests replace fetch: no Google, Gateway or billing calls can occur.
test("public chat interface and transport use only the direct Gemini server key", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const calls = [];
  process.env.GEMINI_API_KEY = "offline-test-key";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "resposta" }] } }] });
  };
  try {
    const messages = [{ role: "system", content: "regras" }, { role: "user", content: "oi" }];
    for (const config of [undefined, "google/gemini-2.5-flash", { provider: "gemini", model: "google/gemini-2.5-flash" }, { provider: "default" }]) {
      assert.equal(await lovableAiChat(messages, config), "resposta");
    }
    for (const call of calls) {
      assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
      assert.equal(call.init.method, "POST");
      assert.equal(call.init.headers["x-goog-api-key"], "offline-test-key");
      assert.equal(call.init.headers.Authorization, undefined);
      assert.deepEqual(call.body, { ...buildGeminiRequest(messages), generationConfig: { thinkingConfig: { thinkingLevel: "low" } } });
      assert.equal(call.url.includes("offline-test-key"), false);
      assert.equal(JSON.stringify(call.body).includes("offline-test-key"), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});
test("transient failures fall back to stable models and only then surface a safe error", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "offline-test-key";
  const request = buildGeminiRequest([{ role: "user", content: "oi" }]);
  try {
    // 503 no primário → reserva responde: a conversa não fica sem resposta.
    const seen = [];
    globalThis.fetch = async (url) => {
      seen.push(String(url));
      if (seen.length === 1) return new Response("high demand", { status: 503 });
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "ok reserva" }] } }] });
    };
    assert.equal(await generateGeminiContent(request), "ok reserva");
    assert.equal(seen[0], "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    assert.equal(seen[1], "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent");
    assert.equal(seen.length, 2);

    // Todos os modelos em 429/503 → erro seguro, sem corpo do provedor, 4 tentativas.
    for (const status of [429, 500, 503]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response("offline-test-key secret provider body", { status }); };
      await assert.rejects(generateGeminiContent(request), { message: geminiErrorMessage(status) });
      assert.equal(calls, 4);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});
test("direct errors discard provider and network bodies and never retry permanent failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "offline-test-key";
  const request = buildGeminiRequest([{ role: "user", content: "oi" }]);
  try {
    for (const status of [400, 401, 403, 404]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response("offline-test-key secret provider body", { status }); };
      await assert.rejects(generateGeminiContent(request), { message: geminiErrorMessage(status) });
      assert.equal(calls, 1);
    }
    globalThis.fetch = async () => { throw new Error("offline-test-key network detail"); };
    await assert.rejects(generateGeminiContent(request), { message: "Não foi possível conectar ao Gemini." });
    globalThis.fetch = async () => new Response("invalid json offline-test-key");
    await assert.rejects(generateGeminiContent(request), { message: "O Gemini retornou uma resposta inválida." });
    delete process.env.GEMINI_API_KEY;
    globalThis.fetch = async () => { assert.fail("missing key must not make a request"); };
    await assert.rejects(generateGeminiContent(request), { message: "Chave Gemini não configurada no servidor." });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});
test("OpenAI and Anthropic keep their tenant-key protocols and output limits", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return Response.json(String(url).includes("anthropic") ? { content: [{ type: "text", text: "claude" }] } : { choices: [{ message: { content: "openai" } }] });
  };
  try {
    const messages = [{ role: "system", content: "regras" }, { role: "user", content: "oi" }];
    assert.equal(await lovableAiChat(messages, { provider: "openai", openaiKey: "tenant-openai" }), "openai");
    assert.equal(await lovableAiChat(messages, { provider: "anthropic", anthropicKey: "tenant-anthropic" }), "claude");
    assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(calls[0].init.headers.Authorization, "Bearer tenant-openai");
    assert.deepEqual(calls[0].body, { model: "gpt-4o-mini", messages });
    assert.equal(calls[1].url, "https://api.anthropic.com/v1/messages");
    assert.equal(calls[1].init.headers["x-api-key"], "tenant-anthropic");
    assert.deepEqual(calls[1].body, { model: "claude-3-5-sonnet-latest", max_tokens: 1024, system: "regras", messages: [{ role: "user", content: "oi" }] });
  } finally { globalThis.fetch = originalFetch; }
});