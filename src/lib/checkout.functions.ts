import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/tenant";
import { buildFlowaReference } from "@/lib/billing/normalize";

const CURRENT_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "incomplete", "paused"];

export const createCheckoutCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string; plano_slug?: string }) => {
    const nome = String(d.nome || "").trim();
    if (nome.length < 2) throw new Error("Informe o nome da sua empresa.");
    const plano_slug = d.plano_slug ? String(d.plano_slug).toLowerCase().trim() : null;
    return { nome, plano_slug };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("company_user")
      .select("company_id")
      .eq("user_id", context.userId)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing?.company_id) return { companyId: existing.company_id as string };

    // Trial days: do plano escolhido (ou starter como fallback).
    let trialDays = 3;
    let planSlug = data.plano_slug;
    if (planSlug) {
      const { data: plan } = await supabaseAdmin
        .from("plan")
        .select("trial_days, slug")
        .eq("slug", planSlug)
        .maybeSingle();
      if (plan?.trial_days != null) trialDays = Number(plan.trial_days) || trialDays;
    } else {
      const { data: starter } = await supabaseAdmin
        .from("plan")
        .select("trial_days, slug")
        .eq("slug", "starter")
        .maybeSingle();
      if (starter?.trial_days != null) trialDays = Number(starter.trial_days) || trialDays;
      planSlug = starter?.slug ?? null;
    }

    const slug = `${slugify(data.nome)}-${Math.random().toString(36).slice(2, 6)}`;
    const trialAte = new Date(Date.now() + trialDays * 86400000).toISOString();

    const { data: company, error: companyErr } = await supabaseAdmin
      .from("company")
      .insert({
        nome: data.nome,
        slug,
        primary_color: "#25D366",
        created_by: context.userId,
        status_cobranca: "trial",
        onboarding_completed: false,
        onboarding_step: 0,
        trial_ate: trialAte,
        selected_plan_slug: planSlug,
      } as any)
      .select("id")
      .single();
    if (companyErr || !company) throw new Error(companyErr?.message || "Falha ao criar empresa");

    const { error: memberErr } = await supabaseAdmin.from("company_user").insert({
      user_id: context.userId,
      company_id: company.id,
      role: "owner",
      ativo: true,
    });
    if (memberErr) throw memberErr;

    return { companyId: company.id as string };
  });

// Inicia o checkout Asaas da PRÓPRIA empresa do usuário (paywall). O companyId
// nunca vem do cliente: é derivado da membership ativa do usuário autenticado.
export const startAsaasCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { plano_slug: string }) => {
    const plano_slug = String(d?.plano_slug || "").toLowerCase().trim();
    if (!plano_slug) throw new Error("Plano não informado.");
    return { plano_slug };
  })
  .handler(async ({ context, data }) => {
    const { data: membership, error: memErr } = await context.supabase
      .from("company_user")
      .select("company_id")
      .eq("user_id", context.userId)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (memErr) throw memErr;
    if (!membership?.company_id) throw new Error("Você não é membro ativo de nenhuma empresa.");
    const companyId = membership.company_id as string;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company, error: compErr } = await supabaseAdmin
      .from("company")
      .select("id, nome, email_corporativo, cnpj_cpf, selected_plan_slug")
      .eq("id", companyId)
      .single();
    if (compErr || !company) throw new Error("Empresa não encontrada.");

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plan")
      .select("id, slug, nome, preco_cents, trial_days, ativo")
      .eq("slug", data.plano_slug)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan || !plan.ativo) throw new Error("Plano inexistente ou inativo.");
    if (company.selected_plan_slug && company.selected_plan_slug !== plan.slug) {
      throw new Error("O plano solicitado não corresponde ao plano escolhido para esta empresa.");
    }

    const { ensureAsaasCustomer, createAsaasSubscription, getAsaasSubscriptionPaymentUrl } =
      await import("@/lib/billing/asaas.server");

    // Sem duplicata: se já existe assinatura Asaas corrente para esta empresa,
    // reutiliza e devolve o link de pagamento dela.
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("subscription")
      .select("id, external_subscription_id")
      .eq("company_id", companyId)
      .eq("provider", "asaas")
      .in("status", CURRENT_SUBSCRIPTION_STATUSES)
      .not("external_subscription_id", "is", null)
      .maybeSingle();
    if (existErr) throw existErr;
    if (existing?.external_subscription_id) {
      const url = await getAsaasSubscriptionPaymentUrl(existing.external_subscription_id);
      if (!url) throw new Error("Já existe uma assinatura em andamento, mas o Asaas não retornou o link de pagamento.");
      return { paymentUrl: url, reused: true };
    }

    const userEmail = (context.claims as any)?.email ?? null;
    const customerId = await ensureAsaasCustomer({
      name: company.nome,
      email: company.email_corporativo || userEmail,
      cpfCnpj: company.cnpj_cpf,
    });

    const trialDays = Number(plan.trial_days) || 0;
    const trialEnd = new Date(Date.now() + trialDays * 86400000);
    const nextDueDate = trialEnd.toISOString().slice(0, 10);

    const created = await createAsaasSubscription({
      customerId,
      value: plan.preco_cents / 100,
      nextDueDate,
      description: `FLOWA — Plano ${plan.nome}`,
      externalReference: buildFlowaReference(companyId, plan.id),
    });
    const paymentUrl = created.invoiceUrl ?? (await getAsaasSubscriptionPaymentUrl(created.id));
    if (!paymentUrl) throw new Error("O Asaas não retornou um link de pagamento para a assinatura.");

    // Registro local somente após resposta do Asaas.
    const subPayload: any = {
      company_id: companyId,
      plan_id: plan.id,
      provider: "asaas",
      external_subscription_id: created.id,
      external_customer_id: customerId,
      buyer_email: company.email_corporativo || userEmail,
      status: "incomplete",
      trial_ends_at: trialEnd.toISOString(),
      current_period_end: trialEnd.toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: current, error: curErr } = await supabaseAdmin
      .from("subscription")
      .select("id")
      .eq("company_id", companyId)
      .in("status", CURRENT_SUBSCRIPTION_STATUSES)
      .maybeSingle();
    if (curErr) throw curErr;
    if (current?.id) {
      const { error: updErr } = await supabaseAdmin.from("subscription").update(subPayload).eq("id", current.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabaseAdmin.from("subscription").insert(subPayload);
      if (insErr) throw insErr;
    }

    return { paymentUrl, reused: false };
  });
