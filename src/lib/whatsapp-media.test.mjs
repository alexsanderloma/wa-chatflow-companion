import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectMedia, buildMediaAnalysisMessages, crmTextFor, aiUserTextFor,
  audioFormatFromMime, base64ByteLength, IMAGE_LABEL, AUDIO_LABEL,
} from "./whatsapp-media.ts";

test("detects plain, ephemeral and view-once images with caption", () => {
  const img = { imageMessage: { mimetype: "image/jpeg", caption: " preço? ", fileLength: "2048" } };
  for (const m of [img, { ephemeralMessage: { message: img } }, { viewOnceMessageV2: { message: img } }]) {
    const d = detectMedia(m);
    assert.equal(d.kind, "image");
    assert.equal(d.caption, "preço?");
    assert.equal(d.fileLength, 2048);
  }
});

test("detects voice notes and strips codec from mimetype", () => {
  const d = detectMedia({ audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true } });
  assert.equal(d.kind, "audio");
  assert.equal(d.mimetype, "audio/ogg");
  assert.equal(audioFormatFromMime(d.mimetype), "ogg");
});

test("text messages are not media", () => {
  assert.equal(detectMedia({ conversation: "oi" }), null);
});

test("image analysis request carries the real image and caption", () => {
  const d = detectMedia({ imageMessage: { mimetype: "image/png", caption: "esse modelo" } });
  const [msg] = buildMediaAnalysisMessages(d, "QUJD");
  assert.equal(msg.content[1].image_url.url, "data:image/png;base64,QUJD");
  assert.match(msg.content[0].text, /esse modelo/);
});

test("audio analysis request uses input_audio", () => {
  const d = detectMedia({ audioMessage: { mimetype: "audio/ogg" } });
  const [msg] = buildMediaAnalysisMessages(d, "QUJD");
  assert.deepEqual(msg.content[1], { type: "input_audio", input_audio: { data: "QUJD", format: "ogg" } });
});

test("CRM text uses transcription or label, never base64", () => {
  const audio = detectMedia({ audioMessage: {}, base64: "QUJDREVG" });
  assert.equal(crmTextFor(audio, "quero agendar"), `${AUDIO_LABEL} quero agendar`);
  assert.equal(crmTextFor(audio, null), AUDIO_LABEL);
  assert.equal(crmTextFor(audio, "[inaudível]"), AUDIO_LABEL);
  const img = detectMedia({ imageMessage: {} });
  assert.equal(crmTextFor(img, "um tênis"), IMAGE_LABEL);
  assert.ok(!crmTextFor(audio, null).includes("QUJD"));
});

test("AI fallback is honest when analysis fails", () => {
  const img = detectMedia({ imageMessage: { caption: "e aí?" } });
  assert.match(aiUserTextFor(img, null), /NÃO pôde ser analisada/);
  assert.match(aiUserTextFor(img, "foto de um sofá azul"), /sofá azul/);
  const audio = detectMedia({ audioMessage: {} });
  assert.match(aiUserTextFor(audio, null), /NÃO pôde ser transcrito/);
});

test("base64 byte length", () => {
  assert.equal(base64ByteLength("QUJD"), 3);
  assert.equal(base64ByteLength("QUI="), 2);
});
