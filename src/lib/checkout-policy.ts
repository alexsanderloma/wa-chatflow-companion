export const CHECKOUT_SUPPORT_MESSAGE = "A alteração deste plano precisa ser feita pelo suporte/Master. Nenhuma cobrança ou assinatura foi criada, alterada ou cancelada. Para mudar a cobrança existente, o responsável deve ajustar também a assinatura no Asaas; uma alteração interna no Master não faz isso automaticamente.";
export const CHECKOUT_PENDING_MESSAGE = "Já existe uma solicitação de pagamento em andamento ou que precisa de conferência. Não criaremos outra cobrança. Entre em contato com o suporte para verificar.";
export const CHECKOUT_CURRENT_STATUSES = ["trialing", "active", "past_due", "incomplete", "paused"];

// Planos sem trial (trial_days = 0) nascem aguardando pagamento; só o Starter tem trial.
export function companyStatusForPlan(trialDays: number | null | undefined, slug = "starter") {
  return slug === "starter" && (Number(trialDays) || 0) > 0 ? "trial" : "checkout_pending";
}

export const STARTER_TRIAL_DAYS = 3;
export function checkoutInitialPlan(company: { status_cobranca: string; selected_plan_slug?: string | null } | null, mode?: string, requested?: string) {
  if (!company || (company.status_cobranca === "trial" && mode !== "purchase")) return "starter";
  return requested || company.selected_plan_slug || "starter";
}
export function checkoutCanSelect(company: { status_cobranca: string } | null, mode?: string) {
  return !!company && (company.status_cobranca !== "trial" || mode === "purchase");
}
export function checkoutAccessPlan(companyStatus: string, subscribedSlug?: string | null, masterAccessUntil?: string | null) {
  return companyStatus === "trial" && !masterAccessUntil ? "starter" : subscribedSlug || "starter";
}

export function checkoutRedirect(company: { status_cobranca: string; trial_ate: string; onboarding_completed?: boolean | null } | null, mode?: string, now = Date.now()) {
  if (!company || mode === "upgrade" || mode === "purchase") return null;
  const hasAccess = company.status_cobranca === "ativo" || (company.status_cobranca === "trial" && Date.parse(company.trial_ate) > now);
  return hasAccess ? company.onboarding_completed ? "/app/dashboard" : "/app/onboarding" : null;
}

export function planChangeSearch(plan: { slug?: string | null } | null, selectedSlug?: string | null, upgrade = true) {
  return { plano: plan?.slug ?? selectedSlug ?? undefined, mode: upgrade ? "upgrade" : undefined };
}

type Subscription = {
  id: string; plan_id: string | null; provider: string; status: string;
  external_subscription_id: string | null; metadata?: unknown;
};
export function checkoutPaymentDecision(input: { mode?: string; companyStatus: string; planId: string; subscriptions: Subscription[] }) {
  if (input.companyStatus === "ativo" || input.mode === "upgrade" || (input.companyStatus === "trial" && input.mode !== "purchase")) {
    return { kind: "support" as const, message: CHECKOUT_SUPPORT_MESSAGE };
  }
  const current = input.subscriptions.filter((s) => CHECKOUT_CURRENT_STATUSES.includes(s.status));
  if (current.length > 1) return { kind: "support" as const, message: CHECKOUT_PENDING_MESSAGE };
  const row = current[0];
  const marker = row?.metadata && typeof row.metadata === "object" && "checkout_reservation" in row.metadata;
  if (row?.provider === "asaas" && row.external_subscription_id && row.plan_id === input.planId) {
    return { kind: "reuse" as const, subscriptionId: row.external_subscription_id, rowId: row.id };
  }
  // History may still have an external charge: never infer provider cancellation from local status.
  if (marker || input.subscriptions.some((s) => s.provider === "asaas") || row?.external_subscription_id || (row && row.provider !== "manual")) {
    return { kind: "support" as const, message: CHECKOUT_PENDING_MESSAGE };
  }
  return { kind: "create" as const, rowId: row?.id ?? null };
}