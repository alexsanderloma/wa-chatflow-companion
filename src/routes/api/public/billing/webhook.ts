import { createFileRoute } from "@tanstack/react-router";
import { normalize, type NormalizedBillingEvent } from "@/lib/billing/normalize";

type Provider = "kiwify" | "cakto" | "perfectpay";

function tokenEnv(provider: Provider): string {
  return provider === "kiwify"
    ? "KIWIFY_WEBHOOK_TOKEN"
    : provider === "cakto"
    ? "CAKTO_WEBHOOK_TOKEN"
    : "PERFECTPAY_WEBHOOK_TOKEN";
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findCompanyByEmail(supabase: any, email: string): Promise<string | null> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle();
  if (!prof?.user_id) return null;
  const { data: cu } = await supabase
    .from("company_user")
    .select("company_id")
    .eq("user_id", prof.user_id)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return cu?.company_id ?? null;
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

  if (!evt.buyerEmail) {
    await supabase.from("billing_event_log").insert({ ...logRow, error: "sem email do comprador" });
    return;
  }

  const companyId = await findCompanyByEmail(supabase, evt.buyerEmail);
  if (!companyId) {
    await supabase
      .from("billing_event_log")
      .insert({ ...logRow, error: "empresa não encontrada para o email" });
    return;
  }

  const planId = await findPlanByRef(supabase, evt.productRef);

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

  // 1) Mesma assinatura do provedor → atualiza; 2) senão a assinatura corrente
  // da empresa; 3) senão cria nova. Canceladas ficam como histórico.
  const CURRENT = ["trialing", "active", "past_due", "incomplete", "paused"];
  let targetId: string | null = null;
  if (evt.externalSubscriptionId) {
    const { data: byExt, error: extErr } = await supabase
      .from("subscription")
      .select("id")
      .eq("provider", evt.provider)
      .eq("external_subscription_id", evt.externalSubscriptionId)
      .maybeSingle();
    if (extErr) throw new Error(`subscription lookup (externo): ${extErr.message}`);
    targetId = byExt?.id ?? null;
  }
  if (!targetId) {
    const { data: cur, error: curErr } = await supabase
      .from("subscription")
      .select("id")
      .eq("company_id", companyId)
      .in("status", CURRENT)
      .maybeSingle();
    if (curErr) throw new Error(`subscription lookup (corrente): ${curErr.message}`);
    targetId = cur?.id ?? null;
  }
  if (targetId) {
    const { error: updErr } = await supabase.from("subscription").update(subPayload).eq("id", targetId);
    if (updErr) throw new Error(`subscription update: ${updErr.message}`);
  } else {
    const { error: insErr } = await supabase.from("subscription").insert(subPayload);
    if (insErr) throw new Error(`subscription insert: ${insErr.message}`);
  }

  if (companyStatus) {
    const { error: compErr } = await supabase
      .from("company")
      .update({ status_cobranca: companyStatus })
      .eq("id", companyId);
    if (compErr) throw new Error(`company status: ${compErr.message}`);
  }

  // Recarrega créditos do plano quando assinatura ativa/renova
  if (subStatus === "active" && planId) {
    const { data: planRow, error: planErr } = await supabase.from("plan").select("slug").eq("id", planId).maybeSingle();
    if (planErr) throw new Error(`plan lookup: ${planErr.message}`);
    if (planRow?.slug) {
      const { error: topErr } = await supabase.rpc("topup_plan_credits", { _company_id: companyId, _plan_slug: planRow.slug });
      if (topErr) throw new Error(`credit topup: ${topErr.message}`);
    }
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
        const token = url.searchParams.get("token") || request.headers.get("x-webhook-token") || "";

        if (!["kiwify", "cakto", "perfectpay"].includes(provider)) {
          return new Response("provider inválido", { status: 400 });
        }
        const expected = process.env[tokenEnv(provider)];
        if (!expected || token !== expected) {
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
