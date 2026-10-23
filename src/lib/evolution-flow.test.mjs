import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseQrPayload, parseEvoState, decideConnectAction, EvolutionError, isTransientEvoError,
  withEvoRetry, classifyHttpFailure, diagnosticFromError, isAlreadyExistsMessage,
} from "./evolution-flow.ts";

const PNG = "iVBORw0KGgo" + "A".repeat(200);
const QR_STRING = "2@abcdefghijklmnopqrstuvwxyz0123456789,xyz";

test("parses QR in every supported shape", () => {
  assert.equal(parseQrPayload({ base64: `data:image/png;base64,${PNG}` }).image, `data:image/png;base64,${PNG}`);
  assert.equal(parseQrPayload({ base64: PNG }).image, `data:image/png;base64,${PNG}`);
  assert.equal(parseQrPayload({ qrcode: { base64: PNG, code: QR_STRING } }).code, QR_STRING);
  assert.ok(parseQrPayload({ qrcode: { base64: PNG } }).image);
  assert.equal(parseQrPayload({ code: QR_STRING }).code, QR_STRING);
  assert.equal(parseQrPayload({ pairingCode: "ABCD1234", code: QR_STRING }).pairingCode, "ABCD1234");
});

test("payload without QR yields nothing (count:0 / state only)", () => {
  for (const p of [{ count: 0 }, { instance: { state: "close" } }, null, {}]) {
    const r = parseQrPayload(p);
    assert.equal(r.image, null); assert.equal(r.code, null);
  }
});

test("idempotent decision: missing → create, open → keep, closed/connecting → connect", () => {
  assert.equal(decideConnectAction("missing"), "create");
  assert.equal(decideConnectAction("open"), "already_open");
  assert.equal(decideConnectAction("close"), "connect");
  assert.equal(decideConnectAction("connecting"), "connect");
  assert.equal(decideConnectAction(null), "connect");
});

test("state parser normalizes variants", () => {
  assert.equal(parseEvoState({ instance: { state: "open" } }), "open");
  assert.equal(parseEvoState({ state: "close" }), "close");
  assert.equal(parseEvoState({}), null);
});

test("network/timeout/5xx are transient; 4xx is not", () => {
  assert.ok(isTransientEvoError(new EvolutionError("timeout", "x")));
  assert.ok(isTransientEvoError(new EvolutionError("api_indisponivel", "x")));
  assert.ok(isTransientEvoError(new EvolutionError("http", "x", 502)));
  assert.ok(!isTransientEvoError(new EvolutionError("http", "x", 401)));
  assert.ok(!isTransientEvoError(new EvolutionError("instancia_ausente", "x", 404)));
});

test("retry only transient failures", async () => {
  let n = 0;
  const ok = await withEvoRetry(async () => { if (++n < 3) throw new EvolutionError("timeout", "t"); return "ok"; }, 3, 0, async () => {});
  assert.equal(ok, "ok"); assert.equal(n, 3);
  let m = 0;
  await assert.rejects(withEvoRetry(async () => { m++; throw new EvolutionError("http", "bad", 401); }, 3, 0, async () => {}));
  assert.equal(m, 1);
});

test("classification and diagnostics never leak secrets", () => {
  assert.equal(classifyHttpFailure(404, ""), "instancia_ausente");
  assert.equal(classifyHttpFailure(403, 'The "x" instance does not exist'), "instancia_ausente");
  assert.equal(classifyHttpFailure(500, ""), "http");
  assert.equal(diagnosticFromError(new EvolutionError("timeout", "t")), "api_indisponivel");
  assert.equal(diagnosticFromError(new EvolutionError("nao_configurada", "t")), "nao_configurada");
  assert.ok(isAlreadyExistsMessage('This name "flowa_x" is already in use.'));
});
