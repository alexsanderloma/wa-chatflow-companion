export const OPERATIONAL_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "incomplete", "paused"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MASTER_PERIODS = ["trial_7", "temporary_30", "permanent"] as const;
export type MasterPeriod = typeof MASTER_PERIODS[number];
export function validateMasterPlanInput(input: { companyId: string; planId?: string; action: "assign" | "cancel"; period?: string }) {
  if (!UUID.test(input.companyId)) throw new Error("Empresa inválida");
  if (input.action !== "assign" && input.action !== "cancel") throw new Error("Ação inválida");
  if (input.action === "assign" && (!input.planId || !UUID.test(input.planId))) throw new Error("Selecione um plano válido");
  if (input.action === "assign" && !MASTER_PERIODS.some((period) => period === input.period)) throw new Error("Selecione um período válido");
  return { companyId: input.companyId, planId: input.action === "assign" ? input.planId : null, action: input.action, period: input.action === "assign" ? input.period as MasterPeriod : null };
}

export function masterPlanDecision(period: MasterPeriod | null, action: "assign" | "cancel", now: Date) {
  if (action === "assign" && !MASTER_PERIODS.some((value) => value === period)) throw new Error("Selecione um período válido");
  const trial = action === "assign" && period === "trial_7";
  const periodEnd = period === "permanent" ? null : new Date(now.getTime() + (trial ? 7 : 30) * 86_400_000).toISOString();
  return {
    status: action === "cancel" ? "canceled" : trial ? "trialing" : "active",
    companyStatus: action === "cancel" ? "suspenso" : trial ? "trial" : "ativo",
    periodEnd: action === "cancel" ? now.toISOString() : periodEnd,
    trialEndsAt: trial ? periodEnd : null,
    canceledAt: action === "cancel" ? now.toISOString() : null,
  };
}