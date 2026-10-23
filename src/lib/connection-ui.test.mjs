import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionStatus, pairingView, connectionRequests } from "./connection-ui.ts";

test("unknown statuses do not pretend the line is disconnected", () => {
  assert.equal(connectionStatus("open"), "unknown");
  assert.equal(connectionStatus("connected"), "connected");
});
test("disconnected and connected states discard stale pairing QR", () => {
  assert.deepEqual(pairingView("disconnected", "qr"), { qr: null, poll: false });
  assert.deepEqual(pairingView("connected", "qr"), { qr: null, poll: false });
  assert.deepEqual(pairingView("connecting", "qr"), { qr: "qr", poll: true });
});
test("a new connection action prevents an older status check from overwriting it", () => {
  const requests = connectionRequests();
  const check = requests.next();
  const connect = requests.next();
  assert.equal(requests.current(check), false);
  assert.equal(requests.current(connect), true);
});