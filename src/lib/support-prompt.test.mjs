import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, parseAiOutput } from "./ai-prompt.ts";

const prompt = buildSystemPrompt({ nome_empresa: "Loja X" });

test("prompt includes technical support and warranty procedure", () => {
  assert.ok(prompt.includes("SUPORTE TÉCNICO E GARANTIA"));
  assert.ok(prompt.includes("TV box sem canais"));
  assert.ok(prompt.includes("PRIORIZE resolver antes de qualquer venda"));
  assert.ok(prompt.includes("nunca culpe o cliente"));
  assert.ok(prompt.includes("UMA pergunta por vez"));
  assert.ok(prompt.includes("modem/roteador"));
  assert.ok(prompt.includes("NUNCA diga que resolveu sem confirmação explícita"));
  assert.ok(prompt.includes("NUNCA invente disponibilidade de servidor, prazo, cobertura de garantia, reparo ou troca"));
  assert.ok(prompt.includes("Não envie o cliente para links"));
});

test("support procedure escalates with marker and escalation rule is kept", () => {
  const support = prompt.slice(prompt.indexOf("SUPORTE TÉCNICO E GARANTIA"));
  assert.ok(support.includes("[ESCALAR: motivo curto]"));
  assert.ok(prompt.includes("ESCALONAMENTO HUMANO OBRIGATÓRIO"));
});

test("escalation marker in a support reply is extracted and hidden", () => {
  const r = parseAiOutput("Entendi, vou acionar a equipe.\n[ESCALAR: garantia TV box]\n[ESTAGIO: Conversas]");
  assert.equal(r.escalar, "garantia TV box");
  assert.ok(!r.parts.join(" ").includes("ESCALAR"));
});
