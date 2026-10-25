import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/tenant";
import { buildFlowaReference } from "@/lib/billing/normalize";
import { checkoutPaymentDecision, CHECKOUT_PENDING_MESSAGE, STARTER_TRIAL_DAYS } from "@/lib/checkout-policy";

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

    // Caller-supplied plan cannot change the free entitlement. Provision atomically.
    const { data: starter, error: planError } = await supabaseAdmin.from("plan")
      .select("id,trial_days").eq("slug", "starter").eq("ativo", true).single();
    if (planError || !starter || starter.trial_days !== STARTER_TRIAL_DAYS) throw new Error("O teste Starter está indisponível. Entre em contato com o suporte.");
    const slug = `${slugify(data.nome)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: created, error: companyErr } = await supabaseAdmin.rpc("create_company_with_owner", {
      _owner_id: context.userId, _nome: data.nome, _slug: slug, _plan_id: starter.id, _forcar_troca_senha: false,
    });
    const company = created?.[0];
    if (companyErr || !company) throw new Error("Não foi possível iniciar o teste Starter.");
    return { companyId: company.company_id, hasTrial: true };
  });

// Inicia o checkout Asaas da PRÓPRIA empresa do usuário (paywall). O companyId
// nunca vem do cliente: é derivado da membership ativa do usuário autenticado.
export const startAsaasCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { plano_slug: string; mode?: string }) => {
    const plano_slug = String(d?.plano_slug || "").toLowerCase().trim();
    if (!plano_slug) throw new Error("Plano não informado.");
    return { plano_slug, mode: d.mode === "upgrade" || d.mode === "purchase" ? d.mode : undefined };
  })
  .handler(async ({ context, data }) => {
    const { data: membership, error: memErr } = await context.supabase
      .from("company_user")
      .select("company_id, role")
      .eq("user_id", context.userId)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(2);
    if (memErr) throw memErr;
    if (!membership || membership.length !== 1 || membership[0]?.role !== "owner") throw new Error("Apenas o responsável por uma empresa identificada pode gerenciar seu pagamento. Entre em contato com o suporte.");
    const companyId = membership[0].company_id;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company, error: compErr } = await supabaseAdmin
      .from("company")
      .select("id, nome, email_corporativo, cnpj_cpf, selected_plan_slug, status_cobranca, trial_ate")
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
    const { data: subscriptions, error: existErr } = await supabaseAdmin
      .from("subscription")
      .select("id,plan_id,provider,status,external_subscription_id,metadata,updated_at")
      .eq("company_id", companyId);
    if (existErr) throw existErr;
    const decision = checkoutPaymentDecision({ mode: data.mode,
      companyStatus: company.status_cobranca === "trial" && Date.parse(company.trial_ate) <= Date.now() ? "trial_expired" : company.status_cobranca,
      planId: plan.id, subscriptions: subscriptions ?? [] });
    if (decision.kind === "support") return { kind: "support" as const, message: decision.message };
    const { ensureAsaasCustomer, createAsaasSubscription, getAsaasSubscriptionPaymentUrl } =
      await import("@/lib/billing/asaas.server");
    if (decision.kind === "reuse") {
      const url = await getAsaasSubscriptionPaymentUrl(decision.subscriptionId);
      if (!url) throw new Error("Já existe uma assinatura em andamento, mas o Asaas não retornou o link de pagamento.");
      return { kind: "payment" as const, paymentUrl: url, reused: true };
    }

    // Durable reservation before any provider side effect. Concurrent requests
    // lose the CAS/unique index race; uncertain failures remain blocked for support.
    const reservationId = crypto.randomUUID();
    const current = subscriptions?.find((s) => s.id === decision.rowId);
    const metadata = { ...(current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata) ? current.metadata : {}), checkout_reservation: reservationId };
    const reserved = current ? await supabaseAdmin.from("subscription")
      .update({ metadata, plan_id: plan.id, status: "incomplete", updated_at: new Date().toISOString() }).eq("id", current.id)
      .eq("updated_at", current.updated_at).is("external_subscription_id", null)
      .in("status", CURRENT_SUBSCRIPTION_STATUSES).select("id").maybeSingle()
      : await supabaseAdmin.from("subscription").insert({ company_id: companyId, plan_id: plan.id,
        provider: "asaas", status: "incomplete", metadata }).select("id").single();
    if (reserved.error || !reserved.data) return { kind: "support" as const, message: CHECKOUT_PENDING_MESSAGE };

    const userEmail = (context.claims as any)?.email ?? null;
    const customerId = await ensureAsaasCustomer({
      name: company.nome,
      email: company.email_corporativo || userEmail,
      cpfCnpj: company.cnpj_cpf,
    });

    // An explicit purchase is due now, never another free trial.
    const trialEnd = new Date();
    const nextDueDate = trialEnd.toISOString().slice(0, 10);

    const created = await createAsaasSubscription({
      customerId,
      value: plan.preco_cents / 100,
      nextDueDate,
      description: `FLOWA — Plano ${plan.nome}`,
      externalReference: buildFlowaReference(companyId, plan.id),
    });
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
    const { data: saved, error: saveErr } = await supabaseAdmin.from("subscription").update(subPayload)
      .eq("id", reserved.data.id).eq("metadata->>checkout_reservation", reservationId)
      .is("external_subscription_id", null).select("id").maybeSingle();
    if (saveErr || !saved) return { kind: "support" as const, message: CHECKOUT_PENDING_MESSAGE };
    const paymentUrl = created.invoiceUrl ?? (await getAsaasSubscriptionPaymentUrl(created.id));
    if (!paymentUrl) throw new Error("O Asaas não retornou um link de pagamento para a assinatura. Não inicie outra assinatura; procure o suporte.");
    return { kind: "payment" as const, paymentUrl, reused: false };
  });
