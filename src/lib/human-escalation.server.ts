import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { executeEscalation, type EscalationInput } from "./human-escalation";
import { evoSendText } from "./evolution.server";

export async function escalateToHuman(admin: SupabaseClient<Database>, instanceName: string, input: EscalationInput) {
  const result = await executeEscalation(input, {
    claim: async (i) => {
      const { data, error } = await admin.rpc("claim_human_escalation", {
        _company_id: i.companyId, _user_id: i.userId, _source_message_id: i.sourceMessageId,
        _numero: i.numero, _nome: i.nome || "", _motivo: i.motivo,
        _ultima_mensagem: i.ultimaMensagem.slice(0, 1000),
        _responsavel_nome: i.responsavelNome.slice(0, 100), _responsavel_telefone: i.responsavelTelefone,
      });
      if (error) throw new Error("Escalation persistence failed");
      return data || null;
    },
    notify: async (phone, text) => {
      const reply = await evoSendText(instanceName, phone, text, 15_000);
      if (!reply?.key?.id && !reply?.message?.key?.id) throw new Error("Notification not acknowledged");
    },
    finish: async (id, status, errorText) => {
      const now = new Date().toISOString();
      const { data, error } = await admin.from("human_escalations").update({
        status, erro: errorText, updated_at: now, notified_at: status === "notified" ? now : null,
      }).eq("company_id", input.companyId).eq("id", id).select("id").single();
      if (error || !data) throw new Error("Escalation status persistence failed");
    },
  });
  if (result === "failed") console.error("[escalation] notification or persistence not confirmed");
  return result;
}