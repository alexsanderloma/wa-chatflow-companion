import { test } from "node:test";
import assert from "node:assert/strict";
import { removeConnectionRecord } from "./connection-removal.ts";
import { instanceLimit } from "./instance-limit.ts";

test("missing remote instance still removes local usage from 1 to 0", async () => {
  let used = 1;
  const result = await removeConnectionRecord(async () => { throw new Error("404"); }, async () => { used = 0; });
  assert.equal(result.ok, true);
  assert.equal(result.remoteRemoved, false);
  assert.equal(used, 0);
});
test("remote timeout cannot prevent local cleanup", async () => {
  let deleted = false;
  await removeConnectionRecord(async () => { throw new DOMException("timeout", "TimeoutError"); }, async () => { deleted = true; });
  assert.equal(deleted, true);
});
test("successful remote removal is followed by local cleanup", async () => {
  const calls = [];
  const result = await removeConnectionRecord(async () => { calls.push("remote"); }, async () => { calls.push("local"); });
  assert.equal(result.remoteRemoved, true);
  assert.deepEqual(calls, ["remote", "local"]);
});
test("local cleanup failure never reports success", async () => {
  await assert.rejects(removeConnectionRecord(async () => {}, async () => { throw new Error("denied"); }), /denied/);
});
test("instance limits use the actual plan value, including zero", () => {
  assert.equal(instanceLimit(4), 4);
  assert.equal(instanceLimit(0), 0);
  assert.equal(instanceLimit("2"), 2);
  assert.equal(instanceLimit(undefined), 1);
});