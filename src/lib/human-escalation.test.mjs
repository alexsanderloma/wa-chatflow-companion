import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAiOutput, buildSystemPrompt } from "./ai-prompt.ts";
import { normalizeEscalationPhone, executeEscalation, escalationCustomerParts, hasUnmarkedHumanPromise, ESCALATION_FAILURE_REPLY } from "./human-escalation.ts";

const input = { companyId: "company-a", userId: "owner-a", sourceMessageId: "message-a", numero: "5511999998888", nome: "Cliente", motivo: "Consultar estoque", ultimaMensagem: "Tem disponível?", responsavelNome: "Alex", responsavelTelefone: "5531973175308" };

test("deterministic marker is removed, bounded and never leaks even malformed/repeated", () => {
  const parsed = parseAiOutput("Vou consultar. [ESCALAR: estoque] ||| Aguarde [ESCALAR: preço] [ESTAGIO: Conversas]");
  assert.equal(parsed.escalar, "estoque");
  assert.deepEqual(parsed.parts, ["Vou consultar.", "Aguarde"]);
  assert.equal(parsed.stage, "Conversas");
  assert.equal(parseAiOutput("oi [ESCALAR:").escalar, "Atendimento humano necessário");
  assert.equal(parseAiOutput("oi").escalar, null);
  assert.equal(parseAiOutput(`[ESCALAR: ${"x".repeat(300)}]`).escalar.length, 200);
});

test("responsible Brazilian phone normalization", () => {
  assert.equal(normalizeEscalationPhone("(31) 97317-5308"), "5531973175308");
  assert.equal(normalizeEscalationPhone("+55 31 97317-5308"), "5531973175308");
  assert.equal(normalizeEscalationPhone("123"), null);
  assert.equal(normalizeEscalationPhone(""), null);
});

test("atomic claim deduplicates concurrent deliveries and scopes by company", async () => {
  const claimed = new Set(); const sent = []; const states = [];
  const io = {
    claim: async i => { const k = `${i.companyId}:${i.sourceMessageId}`; if (claimed.has(k)) return null; claimed.add(k); return k; },
    notify: async (phone, text) => { sent.push([phone, text]); },
    finish: async (...args) => { states.push(args); },
  };
  const results = await Promise.all([executeEscalation(input, io), executeEscalation(input, io)]);
  assert.deepEqual(results.sort(), ["duplicate", "notified"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "5531973175308");
  assert.ok(sent[0][1].includes("Tem disponível?"));
  assert.equal(states[0][1], "notified");
  await executeEscalation({ ...input, companyId: "company-b" }, io);
  assert.equal(sent.length, 2);
});

test("failed delivery never allows a promise and records safe error", async () => {
  const states = [];
  const result = await executeEscalation(input, {
    claim: async () => "id", notify: async () => { throw new Error("private provider body"); },
    finish: async (...args) => { states.push(args); },
  });
  assert.equal(result, "failed");
  assert.deepEqual(escalationCustomerParts(["Chamei a equipe"], result), [ESCALATION_FAILURE_REPLY]);
  assert.equal(states[0][1], "failed");
  assert.ok(!states[0][2].includes("private"));
  assert.deepEqual(escalationCustomerParts(["Chamei"], "duplicate"), []);
});

test("persistence failures and missing or customer-equal recipient fail closed", async () => {
  let sends = 0;
  for (const phone of ["", input.numero]) {
    const result = await executeEscalation({ ...input, responsavelTelefone: phone }, {
      claim: async () => "id", notify: async () => { sends++; }, finish: async () => {},
    });
    assert.equal(result, "failed");
  }
  assert.equal(sends, 0);
  assert.equal(await executeEscalation(input, { claim: async () => { throw Error(); }, notify: async () => { sends++; }, finish: async () => {} }), "failed");
  assert.equal(sends, 0);
  assert.equal(await executeEscalation(input, { claim: async () => "id", notify: async () => {}, finish: async () => { throw Error(); } }), "failed");
});

test("unmarked human promises require escalation", () => {
  for (const p of ["Vou chamar alguém", "Vou consultar o estoque", "Já avisei o responsável", "Atendimento transferido"]) assert.equal(hasUnmarkedHumanPromise([p]), true, p);
  assert.equal(hasUnmarkedHumanPromise(["Temos duas opções disponíveis."]), false);
  assert.ok(!buildSystemPrompt({ telefone_transferencia: "5531973175308" }).includes("5531973175308"));
});

// Exercise the actual webhook decision block with fake I/O; never send real messages.
const webhook = readFileSync(new URL("../routes/api/public/whatsapp-webhook.ts", import.meta.url), "utf8");
const decision = webhook.slice(webhook.indexOf("          const { escalationCustomerParts"), webhook.indexOf("          // Cria evento no Google Agenda"))
  .replace('await import("@/lib/human-escalation")', "helpers")
  .replace('await import("@/lib/human-escalation.server")', "{ escalateToHuman }");
const runDecision = new (Object.getPrototypeOf(async function () {}).constructor)(
  "parts", "escalar", "escalateToHuman", "helpers", "input",
  `const { companyId, userId, sourceMessageId: whatsappMessageId, numero: number, nome: pushName, ultimaMensagem: text } = input;
   const inserted = { id: 'crm-id' }, cardRow = null, supabaseAdmin = {}, instanceName = 'tenant-instance';
   const cfg = { responsavel_escalonamento_nome: input.responsavelNome, telefone_transferencia: input.responsavelTelefone };
   const responderEmPartes = true, sanitizeAiParts = p => p;
   ${decision}
   return finalParts;`,
);
const helpers = { escalationCustomerParts, hasUnmarkedHumanPromise };

test("webhook fallback dispatches safe reason and only acknowledges persisted notification", async () => {
  for (const result of ["notified", "failed", "duplicate"]) {
    const calls = [];
    const parts = await runDecision(["Vou consultar a equipe."], null, async (_db, instance, data) => {
      calls.push({ instance, data }); return result;
    }, helpers, input);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.motivo, "A IA indicou que a equipe precisa assumir o atendimento.");
    assert.equal(calls[0].data.companyId, input.companyId);
    assert.equal(calls[0].data.sourceMessageId, input.sourceMessageId);
    assert.equal(calls[0].data.responsavelTelefone, input.responsavelTelefone);
    assert.deepEqual(parts, escalationCustomerParts([], result));
  }
  let calls = 0;
  assert.deepEqual(await runDecision(["Temos duas opções."], null, async () => { calls++; }, helpers, input), ["Temos duas opções."]);
  assert.equal(calls, 0);
});

test("marker and fallback share one claim and never notify twice for the same source", async () => {
  const claimed = new Set(); let sends = 0; const reasons = [];
  const io = {
    claim: async data => {
      const key = `${data.companyId}:${data.sourceMessageId}`;
      if (claimed.has(key)) return null;
      claimed.add(key); reasons.push(data.motivo); return key;
    },
    notify: async () => { sends++; }, finish: async () => {},
  };
  const escalate = async (_db, _instance, data) => executeEscalation(data, io);
  const replies = await Promise.all([
    runDecision(["Vou chamar a equipe."], "Consultar estoque", escalate, helpers, input),
    runDecision(["Vou chamar a equipe."], null, escalate, helpers, input),
  ]);
  assert.equal(sends, 1);
  assert.deepEqual(reasons, ["Consultar estoque"]);
  assert.equal(replies.filter(parts => parts.length === 0).length, 1);
});