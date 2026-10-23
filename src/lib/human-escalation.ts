export const ESCALATION_FAILURE_REPLY = "Não consegui confirmar o contato com a equipe agora. Não posso confirmar essa informação no momento.";

export function normalizeEscalationPhone(value: string): string | null {
  const digits = value.replace(/[^\d]/g, "");
  const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^[1-9]\d{9,14}$/.test(phone) ? phone : null;
}

export function parseEscalationMarker(raw: string): { text: string; motivo: string | null } {
  let motivo: string | null = null;
  const text = raw.replace(/\[\s*ESCALAR\b([^\]]*)(?:\]|$)/gi, (_marker, content: string) => {
    const reason = content.replace(/^\s*:\s*/, "").replace(/[\r\n\[\]]/g, " ").trim();
    // Even an empty/malformed marker requests human help; never leak it.
    motivo ??= (reason || "Atendimento humano necessário").slice(0, 200);
    return "";
  }).trim();
  return { text, motivo };
}

// Secondary fail-closed guard only; escalation itself is driven by the structured marker.
export function hasUnmarkedHumanPromise(parts: string[]): boolean {
  const text = parts.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(vou|vamos|irei|iremos|estou|ja|acabei de)\b.{0,60}\b(chamar|chamei|chamamos|acionar|acionei|avisar|avisei|notificar|notifiquei|transferir|transferi|encaminhar|encaminhei|consultar|consultei|confirmar|verificar)\b/.test(text)
    || /\b(equipe|time|atendente|responsavel|humano)\b.{0,40}\b(avisad[oa]|acionad[oa]|notificad[oa]|vai.{0,10}(assumir|retornar|entrar em contato))\b/.test(text)
    || /\b(atendimento|conversa|solicitacao)\b.{0,30}\b(transferid[oa]|encaminhad[oa])\b/.test(text);
}

export function escalationCustomerParts(parts: string[], result: "notified" | "failed" | "duplicate"): string[] {
  if (result === "duplicate") return [];
  if (result !== "notified") return [ESCALATION_FAILURE_REPLY];
  // Fixed acknowledgement prevents hallucinated promises, numbers or private details.
  return ["Avisei a equipe para continuar seu atendimento por aqui."];
}

export interface EscalationInput {
  companyId: string; userId: string; sourceMessageId: string;
  numero: string; nome: string | null; motivo: string; ultimaMensagem: string;
  responsavelNome: string; responsavelTelefone: string;
}

export interface EscalationIO {
  claim(input: EscalationInput): Promise<string | null>;
  notify(phone: string, text: string): Promise<void>;
  finish(id: string, status: "notified" | "failed", error: string | null): Promise<void>;
}

function safeExcerpt(value: string, max: number): string {
  return value.replace(/data:[^\s]+|[A-Za-z0-9+/=]{200,}/g, "[conteúdo omitido]").replace(/[\r\n]+/g, " ").slice(0, max);
}

// Claim + pause are one database transaction. Only the winner may send a notification.
export async function executeEscalation(input: EscalationInput, io: EscalationIO): Promise<"notified" | "failed" | "duplicate"> {
  input = { ...input, nome: input.nome ? safeExcerpt(input.nome, 100) : null,
    motivo: safeExcerpt(input.motivo, 200), ultimaMensagem: safeExcerpt(input.ultimaMensagem, 800),
    responsavelNome: safeExcerpt(input.responsavelNome, 100),
    responsavelTelefone: normalizeEscalationPhone(input.responsavelTelefone) || "" };
  let id: string | null = null;
  try {
    id = await io.claim(input);
    if (!id) return "duplicate";
    const phone = normalizeEscalationPhone(input.responsavelTelefone);
    if (!phone || phone === normalizeEscalationPhone(input.numero)) {
      await io.finish(id, "failed", "Responsável ausente, inválido ou igual ao contato do cliente.");
      return "failed";
    }
    const notification = [
      `Atendimento humano${input.responsavelNome ? ` — ${safeExcerpt(input.responsavelNome, 80)}` : ""}`,
      `Cliente: ${safeExcerpt(input.nome || "Sem nome", 100)} (${safeExcerpt(input.numero, 24)})`,
      `Motivo: ${safeExcerpt(input.motivo, 200)}`,
      `Última mensagem: ${safeExcerpt(input.ultimaMensagem, 800)}`,
      "Assuma a conversa em Conversas no FLOWA. A IA está pausada para este contato.",
    ].join("\n");
    await io.notify(phone, notification);
    await io.finish(id, "notified", null);
    return "notified";
  } catch {
    // Never persist provider error bodies: they can contain credentials or media.
    if (id) {
      try { await io.finish(id, "failed", "Não foi possível confirmar a notificação e seu registro. IA permanece pausada."); } catch { /* caller records operational failure without private data */ }
    }
    return "failed";
  }
}