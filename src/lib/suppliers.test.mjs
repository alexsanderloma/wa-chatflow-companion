import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSupplierPhone, findSupplierForSender, suggestedPriceCents, supplierQuoteStatus,
  classifySupplierMessage, DEFAULT_MARGINS,
} from "./suppliers.ts";

test("normalizes Brazilian phones to E.164 digits", () => {
  assert.equal(normalizeSupplierPhone("(31) 97317-5308"), "5531973175308");
  assert.equal(normalizeSupplierPhone("+55 31 97317-5308"), "5531973175308");
  assert.equal(normalizeSupplierPhone("5531973175308@s.whatsapp.net"), "5531973175308");
  assert.equal(normalizeSupplierPhone("3133334444"), "553133334444");
  assert.equal(normalizeSupplierPhone("12345"), null);
  assert.equal(normalizeSupplierPhone(""), null);
});

test("supplier detection is scoped to the company and active suppliers", () => {
  const list = [
    { id: "a", company_id: "c1", telefone: "5531973175308", ativo: true },
    { id: "b", company_id: "c2", telefone: "5511999990000", ativo: true },
    { id: "x", company_id: "c1", telefone: "5521988887777", ativo: false },
  ];
  assert.equal(findSupplierForSender(list, "c1", "5531973175308")?.id, "a");
  assert.equal(findSupplierForSender(list, "c1", "553173175308")?.id, "a"); // sem o 9º dígito
  assert.equal(findSupplierForSender(list, "c1", "5511999990000"), null); // fornecedor de outra empresa
  assert.equal(findSupplierForSender(list, "c1", "5521988887777"), null); // inativo
});

test("suggested price uses net margin: total cost / (1 - margin)", () => {
  assert.equal(DEFAULT_MARGINS.android, 0);
  assert.equal(DEFAULT_MARGINS.iphone, 0);
  assert.equal(DEFAULT_MARGINS.tablet, 0);
  assert.equal(DEFAULT_MARGINS.acessorios, 0);
  assert.equal(DEFAULT_MARGINS.manutencao, 0);
  assert.equal(DEFAULT_MARGINS.outros, 0);
  assert.equal(suggestedPriceCents(70000, 0, 30), 100000);
  assert.equal(suggestedPriceCents(65000, 5000, 30), 100000); // frete/taxas compõem o custo
  assert.equal(suggestedPriceCents(1000, 0, 100), null);
});

test("quote status respects supplier validity", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  assert.equal(supplierQuoteStatus(null, 24, now), "sem_tabela");
  assert.equal(supplierQuoteStatus("2026-10-23T00:00:00Z", 24, now), "atualizado");
  assert.equal(supplierQuoteStatus("2026-10-21T00:00:00Z", 24, now), "vencido");
});

test("classifies supplier messages without storing base64", () => {
  assert.equal(classifySupplierMessage({ conversation: "iPhone 15 R$ 4000" }).tipo, "texto");
  const pdf = classifySupplierMessage({ documentMessage: { mimetype: "application/pdf", fileName: "tabela.pdf" }, base64: "AAAA" });
  assert.equal(pdf.tipo, "documento");
  assert.equal(pdf.metadata.arquivo, "tabela.pdf");
  assert.ok(!JSON.stringify(pdf).includes("AAAA"));
  assert.equal(classifySupplierMessage({ audioMessage: { mimetype: "audio/ogg", seconds: 5 } }).tipo, "audio");
});
