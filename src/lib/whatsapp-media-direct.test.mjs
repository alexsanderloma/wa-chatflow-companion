import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeWhatsappMedia } from "./whatsapp-media.server.ts";
import { detectMedia, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from "./whatsapp-media.ts";

test("WhatsApp image and audio analysis use direct Google contents without remote downloads", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const calls = [];
  process.env.GEMINI_API_KEY = "offline-test-key";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ candidates: [{ content: { parts: [{ text: "análise" }] }, finishReason: "STOP" }] });
  };
  try {
    for (const message of [
      { imageMessage: { mimetype: "image/png", caption: "modelo" }, base64: "QUJD" },
      { audioMessage: { mimetype: "audio/ogg; codecs=opus" }, base64: "QUJD" },
    ]) {
      const media = detectMedia(message);
      assert.equal(await analyzeWhatsappMedia("offline-instance", {}, media), "análise");
      const call = calls.at(-1);
      assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
      assert.deepEqual(call.body.contents[0].parts[1], { inlineData: { data: "QUJD", mimeType: media.mimetype } });
    }
    assert.equal(calls.length, 2);
    const image = detectMedia({ imageMessage: { fileLength: MAX_IMAGE_BYTES + 1 }, base64: "QUJD" });
    const audio = detectMedia({ audioMessage: { fileLength: MAX_AUDIO_BYTES + 1 }, base64: "QUJD" });
    assert.equal(await analyzeWhatsappMedia("offline-instance", {}, image), null);
    assert.equal(await analyzeWhatsappMedia("offline-instance", {}, audio), null);
    assert.equal(calls.length, 2, "oversized media must not be analyzed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  }
});