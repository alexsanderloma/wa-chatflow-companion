import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeSupplierPhone, SUPPLIER_CATEGORIES, DEFAULT_MARGINS, type SupplierCategory } from "@/lib/suppliers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertMember(supabase: any, userId: string, companyId: string) {
  if (!UUID.test(companyId)) throw new Error("Empresa inválida");
  const { data, error } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta empresa");
}

const cid = (d: any) => {
  const c = String(d?.companyId || "");
  if (!UUID.test(c)) throw new Error("Empresa inválida");
  return c;
};

export const getSuppliersOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => ({ companyId: cid(d) }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertMember(sb, context.userId, data.companyId);
    const [s, u, i, m] = await Promise.all([
      sb.from("suppliers").select("id, nome, telefone, validade_horas, observacoes, ativo, ultima_atualizacao_em, created_at").eq("company_id", data.companyId).order("nome"),
      sb.from("supplier_catalog_updates").select("id, supplier_id, tipo, conteudo_bruto, midia_metadata, status, recebido_em").eq("company_id", data.companyId).order("recebido_em", { ascending: false }).limit(50),
      sb.from("supplier_catalog_items").select("id, supplier_id, produto, marca, modelo, categoria, custo_cents, moeda, disponibilidade, fonte, aprovado, atualizado_em").eq("company_id", data.companyId).order("atualizado_em", { ascending: false }).limit(200),
      sb.from("supplier_margin_rules").select("categoria, margem_liquida_pct, custos_extras_cents").eq("company_id", data.companyId),
    ]);
    for (const r of [s, u, i, m]) if (r.error) throw new Error(r.error.message);
    const margins = SUPPLIER_CATEGORIES.map((c) => {
      const row = (m.data ?? []).find((r: any) => r.categoria === c);
      return {
        categoria: c,
        margem_liquida_pct: row ? Number(row.margem_liquida_pct) : DEFAULT_MARGINS[c],
        custos_extras_cents: row ? Number(row.custos_extras_cents) : 0,
      };
    });
    return { suppliers: s.data ?? [], updates: u.data ?? [], items: i.data ?? [], margins };
  });

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; id?: string; nome: string; telefone: string; validade_horas?: number; observacoes?: string; ativo?: boolean }) => {
    const nome = String(d?.nome || "").trim().slice(0, 120);
    if (!nome) throw new Error("Nome obrigatório");
    const telefone = normalizeSupplierPhone(d?.telefone);
    if (!telefone) throw new Error("Telefone WhatsApp inválido (use DDD + número)");
    const v = Math.round(Number(d?.validade_horas ?? 24));
    if (!Number.isFinite(v) || v < 1 || v > 720) throw new Error("Validade deve ser entre 1 e 720 horas");
    if (d?.id && !UUID.test(d.id)) throw new Error("id inválido");
    return { companyId: cid(d), id: d?.id, nome, telefone, validade_horas: v, observacoes: String(d?.observacoes || "").trim().slice(0, 2000) || null, ativo: d?.ativo ?? true };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertMember(sb, context.userId, data.companyId);
    const row = { nome: data.nome, telefone: data.telefone, validade_horas: data.validade_horas, observacoes: data.observacoes, ativo: data.ativo };
    const { error } = data.id
      ? await sb.from("suppliers").update(row).eq("id", data.id).eq("company_id", data.companyId)
      : await sb.from("suppliers").insert({ ...row, company_id: data.companyId });
    if (error) throw new Error(error.code === "23505" ? "Já existe fornecedor com este telefone" : error.message);
    return { ok: true };
  });

export const setSupplierActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; id: string; ativo: boolean }) => {
    if (!UUID.test(d?.id || "")) throw new Error("id inválido");
    return { companyId: cid(d), id: d.id, ativo: !!d.ativo };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertMember(sb, context.userId, data.companyId);
    const { error } = await sb.from("suppliers").update({ ativo: data.ativo }).eq("id", data.id).eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; id: string }) => {
    if (!UUID.test(d?.id || "")) throw new Error("id inválido");
    return { companyId: cid(d), id: d.id };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertMember(sb, context.userId, data.companyId);
    const { error } = await sb.from("suppliers").delete().eq("id", data.id).eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveMarginRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; categoria: SupplierCategory; margem_liquida_pct: number; custos_extras_cents: number }) => {
    if (!SUPPLIER_CATEGORIES.includes(d?.categoria)) throw new Error("Categoria inválida");
    const m = Number(d?.margem_liquida_pct);
    if (!Number.isFinite(m) || m < 0 || m >= 95) throw new Error("Margem deve ser entre 0% e 94%");
    const c = Math.round(Number(d?.custos_extras_cents || 0));
    if (!Number.isFinite(c) || c < 0) throw new Error("Custos extras inválidos");
    return { companyId: cid(d), categoria: d.categoria, margem_liquida_pct: m, custos_extras_cents: c };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertMember(sb, context.userId, data.companyId);
    const { error } = await sb.from("supplier_margin_rules").upsert(
      { company_id: data.companyId, categoria: data.categoria, margem_liquida_pct: data.margem_liquida_pct, custos_extras_cents: data.custos_extras_cents },
      { onConflict: "company_id,categoria" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
