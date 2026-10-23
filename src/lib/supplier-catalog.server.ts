// Registro server-side de atualizações de catálogo vindas de fornecedores via WhatsApp.
// Primeira versão: salva conteúdo bruto + metadados e marca "pendente_revisao".
// Não extrai nem inventa produtos/preços. Ponto de extensão: processSupplierUpdate().
import { classifySupplierMessage, findSupplierForSender } from "@/lib/suppliers";

export type SupplierMatch = { id: string; company_id: string; telefone: string; ativo: boolean };

export async function findActiveSupplier(admin: any, companyId: string, sender: string): Promise<SupplierMatch | null> {
  const { data, error } = await admin
    .from("suppliers")
    .select("id, company_id, telefone, ativo")
    .eq("company_id", companyId)
    .eq("ativo", true);
  if (error) {
    console.error("[suppliers.lookup]", error.message);
    return null;
  }
  return findSupplierForSender((data ?? []) as SupplierMatch[], companyId, sender);
}

export async function recordSupplierUpdate(
  admin: any,
  supplier: SupplierMatch,
  rawMsg: any,
  whatsappMessageId: string | null,
): Promise<{ ok: boolean; duplicate?: boolean }> {
  try {
    const { tipo, texto, metadata } = classifySupplierMessage(rawMsg);
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("supplier_catalog_updates")
      .insert({
        company_id: supplier.company_id,
        supplier_id: supplier.id,
        tipo,
        conteudo_bruto: texto ? texto.slice(0, 20000) : null,
        midia_metadata: metadata,
        whatsapp_message_id: whatsappMessageId,
        status: "pendente_revisao",
        recebido_em: now,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return { ok: true, duplicate: true };
      console.error("[suppliers.record]", error.message);
      return { ok: false };
    }
    const { error: upErr } = await admin
      .from("suppliers")
      .update({ ultima_atualizacao_em: now })
      .eq("id", supplier.id)
      .eq("company_id", supplier.company_id);
    if (upErr) console.error("[suppliers.touch]", upErr.message);
    if (data?.id) await processSupplierUpdate(admin, data.id);
    return { ok: true };
  } catch (e: any) {
    console.error("[suppliers.record]", e?.message);
    return { ok: false };
  }
}

/** Extensão futura (parsing/OCR/transcrição + revisão humana). Hoje não faz nada de propósito. */
export async function processSupplierUpdate(_admin: any, _updateId: string): Promise<void> {
  return;
}
