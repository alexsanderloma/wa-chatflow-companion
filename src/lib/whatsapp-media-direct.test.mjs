import { test } from "node:test";
import assert from "node:assert/strict";
import { gatewayChat } from './ai-gateway.server.ts';
import { detectMedia, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from "./whatsapp-media.ts";

test("Gateway carries image and audio without remote downloads", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.LOVABLE_API_KEY;
  const calls = [];
  process.env.LOVABLE_API_KEY = "offline-test-key";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('data: '+JSON.stringify({choices:[{delta:{content:'análise'}}]})+'\n\ndata: [DONE]\n\n');
  };
  try {
    for (const message of [
      { imageMessage: { mimetype: "image/png", caption: "modelo" }, base64: "QUJD" },
      { audioMessage: { mimetype: "audio/ogg; codecs=opus" }, base64: "QUJD" },
    ]) {
      const media = detectMedia(message);
      const part=media.kind==='image'?{type:'image_url',image_url:{url:`data:${media.mimetype};base64,QUJD`}}:{type:'input_audio',input_audio:{data:'QUJD',format:'ogg'}};
      assert.equal(await gatewayChat([{role:'user',content:[{type:'text',text:'Analise'},part]}],undefined,{}, {access:async()=>{},pause:async()=>{},record:async()=>{}}), "análise");
      const call = calls.at(-1);
      assert.equal(call.url, "https://ai.gateway.lovable.dev/v1/chat/completions");
      assert.deepEqual(call.body.messages[0].content[1], part);
    }
    assert.equal(calls.length, 2);
    assert.equal(MAX_IMAGE_BYTES, 5*1024*1024); assert.equal(MAX_AUDIO_BYTES, 10*1024*1024);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.LOVABLE_API_KEY; else process.env.LOVABLE_API_KEY = originalKey;
  }
});