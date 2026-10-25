export const MONTHLY_ALLOWANCES = { starter: 1000, pro: 5000, business: 20000 } as const;
export const MONTHLY_PRICES_CENTS = { starter: 9700, pro: 19700, business: 49700 } as const;

export function estimateGatewayCredits(input: number | null, output: number | null, audio = false) {
  if (input === null || output === null) return null;
  return input * (audio ? 0.000004 : 0.0000012) + output * 0.00001;
}

export function simulatePrice(cost: number, expenses: number, multiplier: number, safetyPct: number) {
  if (![cost, expenses, multiplier, safetyPct].every(Number.isFinite) || cost < 0 || expenses < 0 || multiplier < 1 || safetyPct < 0 || safetyPct > 100) {
    throw new Error("Valores inválidos para simulação.");
  }
  const recommended = (cost * multiplier + expenses) * (1 + safetyPct / 100);
  return { recommended, margin: recommended ? (recommended - cost - expenses) / recommended * 100 : null };
}

export function deliveredStatus(status: unknown): boolean {
  return ["DELIVERY_ACK", "READ", "PLAYED", 3, 4, 5].includes(status as string | number);
}

export function paymentKey(event: { provider: string; externalPaymentId?: string | null }) {
  if (!event.externalPaymentId?.trim()) throw new Error("Pagamento sem identificador estável; requer conciliação.");
  return `${event.provider}:${event.externalPaymentId}`;
}