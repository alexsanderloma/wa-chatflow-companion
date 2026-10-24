import { test } from "node:test";
import assert from "node:assert/strict";
import { streamWebhookWork } from "./webhook-stream.server.ts";

test("verified work starts immediately and stays alive until the actual send completes", async () => {
  let complete;
  let sent = false;
  const gate = new Promise((resolve) => { complete = resolve; });
  const response = streamWebhookWork(async () => {
    await gate;
    sent = true;
    return new Response("ok");
  }, 5);
  const reader = response.body.getReader();
  const decode = (value) => new TextDecoder().decode(value);
  assert.equal(decode((await reader.read()).value), "processing\n");
  assert.equal(sent, false);
  assert.equal(decode((await reader.read()).value), "processing\n");
  complete();
  assert.equal(decode((await reader.read()).value), "ok\n");
  assert.equal(sent, true);
  assert.equal((await reader.read()).done, true);
});

test("work errors finish the stream without exposing provider errors", async () => {
  const response = streamWebhookWork(async () => { throw new Error("private-provider-body"); }, 5);
  assert.equal(await response.text(), "processing\nprocessing-error\n");
});