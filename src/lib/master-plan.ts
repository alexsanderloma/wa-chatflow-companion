export const OPERATIONAL_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "incomplete", "paused"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateMasterPlanInput(input: { companyId: string; planId?: string; action: "assign" | "cancel" }) {
  if (!UUID.test(input.companyId)) throw new Error("Empresa inválida");
  if (input.action !== "assign" && input.action !== "cancel") throw new Error("Ação inválida");
  if (input.action === "assign" && (!input.planId || !UUID.test(input.planId))) throw new Error("Selecione um plano válido");
  return { companyId: input.companyId, planId: input.action === "assign" ? input.planId : null, action: input.action };
}

export function masterPlanDecision(company: { status_cobranca: string; trial_ate: string }, action: "assign" | "cancel", now: Date) {
  const trial = action === "assign" && company.status_cobranca === "trial" && Date.parse(company.trial_ate) > now.getTime();
  // Calendar month, clamped at month end (not a fixed 30-day duration).
  const monthEnd = new Date(now);
  monthEnd.setUTCDate(1);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() + 1, 0)).getUTCDate();
  monthEnd.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return {
    status: action === "cancel" ? "canceled" : "active",
    companyStatus: action === "cancel" ? "suspenso" : trial ? "trial" : "ativo",
    periodEnd: action === "cancel" ? now.toISOString() : trial ? company.trial_ate : monthEnd.toISOString(),
    trialEndsAt: trial ? company.trial_ate : null,
    canceledAt: action === "cancel" ? now.toISOString() : null,
  };
}