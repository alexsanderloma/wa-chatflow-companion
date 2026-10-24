import { createFileRoute } from "@tanstack/react-router";
import { normalize, type NormalizedBillingEvent, type BillingProvider } from "@/lib/billing/normalize";
import { extractWebhookToken, isAlreadyProcessed, isValidWebhookToken } from "@/lib/billing/auth";
import { paymentKey } from '@/lib/ai-accounting';

type Provider = BillingProvider;
const PROVIDERS: Provider[] = ["kiwify", "cakto", "perfectpay", "asaas"];

function tokenEnv(provider: Provider): string {
  return provider === "kiwify"
    ? "KIWIFY_WEBHOOK_TOKEN"
    : provider === "cakto"
    ? "CAKTO_WEBHOOK_TOKEN"
    : provider === "asaas"
    ? "ASAAS_WEBHOOK_TOKEN"
    : "PERFECTPAY_WEBHOOK_TOKEN";
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type CompanyMatch = { companyId: string; error?: undefined } | { companyId?: undefined; error: string };

// Associação explícita: exige exatamente 1 empresa ativa para o e-mail; nunca escolhe arbitrariamente.
async function findCompanyByEmail(supabase: any, email: string): Promise<CompanyMatch> {
  const { data: profs, error: profErr } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("email", email)
    .limit(2);
  if (profErr) return { error: `falha ao buscar perfil: ${profErr.message}` };
  if (!profs?.length) return { error: "nenhum usuário encontrado para o email" };
  if (profs.length > 1) return { error: "email corresponde a mais de um usuário; associação ambígua" };
  const { data: cus, error: cuErr } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", profs[0].user_id)
    .eq("ativo", true)
    .limit(2);
  if (cuErr) return { error: `falha ao buscar empresa: ${cuErr.message}` };
  if (!cus?.length) return { error: "empresa não encontrada para o email" };
  if (cus.length > 1) return { error: "email vinculado a mais de uma empresa ativa; associação ambígua" };
  return { companyId: cus[0].company_id as string };
}

async function findPlanByRef(supabase: any, ref: string | null): Promise<string | null> {
  if (!ref) return null;
  const { data: bySlug } = await supabase.from("plan").select("id").eq("slug", ref).maybeSingle();
  if (bySlug?.id) return bySlug.id;
  const { data: byCheckout } = await supabase
    .from("plan")
    .select("id")
    .ilike("checkout_url", `%${ref}%`)
    .maybeSingle();
  return byCheckout?.id ?? null;
}

async function applyEvent(evt: NormalizedBillingEvent) {
  const supabase = await getAdmin();

  const logRow: any = {
    provider: evt.provider,
    event_type: evt.rawEventName || evt.eventType,
    external_id: evt.externalSubscriptionId,
    buyer_email: evt.buyerEmail,
    payload: evt as any,
  };

  let companyId: string;
  let planId: string | null = null;

  if (evt.provider === "asaas") {
    // Asaas: a associação vem da externalReference 'flowa:<company>:<plan>' emitida
    // pelo checkout. Sem referência válida, registra erro e não toca em nenhuma empresa.
    if (!evt.flowaRef) {
      const { error: logErr } = await supabase.from("billing_event_log").insert({
        ...logRow,
        error: "externalReference ausente ou inválida (esperado flowa:<company>:<plan>)",
      });
      if (logErr) console.error("[billing.webhook] log", logErr.message);
      return;
    }
    companyId = evt.flowaRef.companyId;
    planId = evt.flowaRef.planId;
  } else {
    // Demais provedores: fallback por e-mail, exigindo exatamente 1 empresa ativa.
    if (!evt.buyerEmail) {
      await supabase.from("billing_event_log").insert({ ...logRow, error: "sem email do comprador" });
      return;
    }

    const match = await findCompanyByEmail(supabase, evt.buyerEmail);
    if (match.error !== undefined) {
      const { error: logErr } = await supabase
        .from("billing_event_log")
        .insert({ ...logRow, error: match.error });
      if (logErr) console.error("[billing.webhook] log", logErr.message);
      return;
    }
    companyId = match.companyId;

    planId = await findPlanByRef(supabase, evt.productRef);
  }

  // Map status / billing
  let subStatus: string | null = null;
  let companyStatus: string | null = null;

  switch (evt.eventType) {
    case "purchase_approved":
    case "subscription_renewed":
      subStatus = "active";
      companyStatus = "ativo";
      break;
    case "subscription_canceled":
      subStatus = "canceled";
      companyStatus = "suspenso";
      break;
    case "refunded":
    case "chargeback":
      subStatus = "canceled";
      companyStatus = "suspenso";
      break;
    case "payment_failed":
      subStatus = "past_due";
      companyStatus = "pendente";
      break;
    default:
      await supabase.from("billing_event_log").insert({
        ...logRow,
        matched_company_id: companyId,
        processed: true,
        error: "evento ignorado",
      });
      return;
  }

  if (subStatus === 'active') {
    if (!planId) throw new Error('Plano não identificado; requer conciliação.');
    const { error } = await supabase.rpc('apply_paid_credit_event', { _event: {
      ...evt, companyId, planId, paymentKey: paymentKey(evt),
    } });
    if (error) throw new Error('Pagamento não aplicado; requer conciliação.');
    return;
  }

  const subPayload: any = {
    company_id: companyId,
    provider: evt.provider,
    external_subscription_id: evt.externalSubscriptionId,
    external_customer_id: evt.externalCustomerId,
    buyer_email: evt.buyerEmail,
    status: subStatus,
    updated_at: new Date().toISOString(),
  };
  if (planId) subPayload.plan_id = planId;
  if (evt.periodEnd) subPayload.current_period_end = evt.periodEnd;
  if (subStatus === "canceled") subPayload.canceled_at = new Date().toISOString();

  // Non-paid events only target the exact external subscription; never a fallback.
  let targetId: string | null = null;
  if (evt.externalSubscriptionId) {
    const { data: byExt, error: extErr } = await supabase
      .from("subscription")
      .select("id,company_id,plan_id,status")
      .eq("provider", evt.provider)
      .eq("external_subscription_id", evt.externalSubscriptionId)
      .maybeSingle();
    if (extErr) throw new Error(`subscription lookup (externo): ${extErr.message}`);
    if (byExt && (byExt.company_id !== companyId || (planId && byExt.plan_id !== planId))) throw new Error('Associação de assinatura conflitante.');
    targetId = byExt?.id ?? null;
  }
  if (!targetId) {
    await supabase.from('billing_event_log').insert({ ...logRow, matched_company_id: companyId, error: 'Assinatura externa não localizada; conciliação necessária', processed: false });
    return;
  }
  const { error: updErr } = await supabase.from("subscription").update(subPayload).eq("id", targetId);
  if (updErr) throw new Error(`subscription update: ${updErr.message}`);

  if (companyStatus) {
    const { error: compErr } = await supabase
      .from("company")
      .update({ status_cobranca: companyStatus })
      .eq("id", companyId);
    if (compErr) throw new Error(`company status: ${compErr.message}`);
  }

  const { error: logErr } = await supabase.from("billing_event_log").insert({
    ...logRow,
    matched_company_id: companyId,
    processed: true,
  });
  if (logErr) throw new Error(`event log: ${logErr.message}`);
}

export const Route = createFileRoute("/api/public/billing/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const provider = (url.searchParams.get("provider") || "") as Provider;

        if (!PROVIDERS.includes(provider)) {
          return new Response("provider inválido", { status: 400 });
        }
        const token = extractWebhookToken(provider, url, request.headers);
        const expected = process.env[tokenEnv(provider)];
        if (!isValidWebhookToken(token, expected)) {
          return new Response("token inválido", { status: 401 });
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          // Alguns provedores enviam form-encoded
          try {
            const form = await request.formData();
            body = Object.fromEntries(form.entries());
          } catch {
            body = {};
          }
        }

        try {
          const evt = normalize(provider, body);
          // Asaas entrega ao menos uma vez: se o evento já foi aplicado, não reaplica.
          if (provider === "asaas" && evt.eventId) {
            const admin = await getAdmin();
            const { data: seen, error: seenErr } = await admin
              .from("billing_event_log")
              .select("processed")
              .eq("provider", "asaas")
              .eq("payload->>eventId", evt.eventId)
              .eq("processed", true)
              .limit(1);
            if (seenErr) throw new Error(`idempotency lookup: ${seenErr.message}`);
            if (isAlreadyProcessed(seen as any)) return Response.json({ ok: true, duplicate: true });
          }
          await applyEvent(evt);
          return Response.json({ ok: true });
        } catch (e: any) {
          console.error("[billing.webhook]", provider, e);
          try {
            const admin = await getAdmin();
            await admin.from("billing_event_log").insert({
              provider,
              event_type: "error",
              payload: body,
              error: String(e?.message || e),
            });
          } catch {}
          return Response.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
        }
      },
    },
  },
});
