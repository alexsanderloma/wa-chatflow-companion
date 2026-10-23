import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupSupplierSenderPhone, findSupplierForSender } from "./suppliers.ts";

// Execute the real handler prefix with isolated database/send/AI I/O.
const source = readFileSync(new URL("../routes/api/public/whatsapp-webhook.ts", import.meta.url), "utf8");
const prefix = source.slice(source.indexOf("          const payload:"), source.indexOf('          if (noClientContent) return new Response("no text"', source.indexOf("// Fornecedor DAQUELA")))
  .replace(/:\s*any\b/g, "")
  .replace(/:\s*string\s*\|\s*(undefined|null)/g, "")
  .replace(/:\s*(string|boolean)\b/g, "")
  .replace(/\s+as any/g, "")
  .replace(/\s+as string/g, "")
  .replace(/await import\("([^\"]+)"\)/g, (_all, path) => `modules[${JSON.stringify(path)}]`);
const run = new (Object.getPrototypeOf(async function () {}).constructor)("request", "modules", `${prefix}\nreturn new Response('customer-path');`);
const supplier = { id: "supplier-a", company_id: "company-a", telefone: "5531973175308", ativo: true };

async function deliver({ group = true, participant = supplier.telefone + "@s.whatsapp.net", token = "test-token", fromMe = false } = {}) {
  const lookups = [], records = [], accesses = [];
  const admin = { from: table => {
    accesses.push(table);
    assert.equal(table, "whatsapp_instances", "groups cannot touch CRM or other tables");
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { company_id: "company-a", user_id: "owner-a", webhook_token: "test-token" }, error: null }) };
    return q;
  } };
  const forbidden = () => { throw Error("No AI or messages may be sent"); };
  const modules = {
    "@/integrations/supabase/client.server": { supabaseAdmin: admin },
    "@/lib/evolution.server": { evoSendText: forbidden, evoSendPresence: forbidden },
    "@/lib/lovable-ai.server": { lovableAiChat: forbidden },
    "@/lib/ai-prompt": {},
    "@/lib/suppliers": { groupSupplierSenderPhone },
    "@/lib/whatsapp-media": { detectMedia: () => null },
    "@/lib/supplier-catalog.server": {
      findActiveSupplier: async (_admin, companyId, phone) => { lookups.push([companyId, phone]); return findSupplierForSender([supplier], companyId, phone); },
      recordSupplierUpdate: async (_admin, match, msg, id) => { records.push({ match, msg, id }); return { ok: true }; },
    },
  };
  const request = new Request(`http://localhost/api/public/whatsapp-webhook?t=${token}`, { method: "POST", body: JSON.stringify({
    event: "messages.upsert", instance: "tenant-instance", data: { key: { id: "message-a", remoteJid: group ? "120363123456789@g.us" : supplier.telefone + "@s.whatsapp.net", participant, fromMe }, message: { conversation: "Tabela atualizada" } },
  }) });
  const response = await run(request, modules);
  return { status: response.status, body: await response.text(), lookups, records, accesses };
}

test("group supplier records only the authenticated participant in the same company", async () => {
  const r = await deliver();
  assert.equal(r.body, "supplier-update");
  assert.deepEqual(r.lookups, [["company-a", supplier.telefone]]);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].id, "message-a");
  assert.equal(r.records[0].msg.conversation, "Tabela atualizada");
});

test("ordinary group member, missing participant, group/LID identity and own messages are ignored", async () => {
  for (const options of [{ participant: "5511988887777@s.whatsapp.net" }, { participant: null }, { participant: "120363123456789@g.us" }, { participant: "5531973175308@lid" }, { fromMe: true }]) {
    const r = await deliver(options);
    assert.equal(r.body, "group");
    assert.equal(r.records.length, 0);
    assert.deepEqual(r.accesses, ["whatsapp_instances"]);
  }
});

test("individual supplier remains recorded", async () => {
  const r = await deliver({ group: false });
  assert.equal(r.body, "supplier-update");
  assert.equal(r.records.length, 1);
});

test("invalid tokens refuse group and individual before supplier lookup or persistence", async () => {
  for (const group of [true, false]) {
    const r = await deliver({ group, token: "invalid" });
    assert.equal(r.status, 401);
    assert.equal(r.body, "invalid webhook");
    assert.equal(r.lookups.length, 0);
    assert.equal(r.records.length, 0);
  }
});

test("phone fallback accepts explicit participantAlt but not sender or remoteJid", () => {
  assert.equal(groupSupplierSenderPhone({ key: { participant: "123456789012@lid", participantAlt: "5531973175308:2@s.whatsapp.net" } }), supplier.telefone);
  assert.equal(groupSupplierSenderPhone({ participant: supplier.telefone + "@c.us" }), supplier.telefone);
  assert.equal(groupSupplierSenderPhone({ key: { remoteJid: supplier.telefone + "@g.us" }, sender: supplier.telefone }), null);
});