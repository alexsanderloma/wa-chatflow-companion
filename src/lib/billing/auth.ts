// Helpers de autenticação/idempotência dos webhooks de cobrança (sem dependências de Node).

/** Comparação em tempo constante (para o comprimento do token esperado). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Valida o token recebido contra o esperado; falha se o esperado não estiver configurado. */
export function isValidWebhookToken(received: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || !received) return false;
  return timingSafeEqualStr(received, expected);
}

/** Extrai o token conforme o provedor. Asaas usa apenas o header `asaas-access-token`. */
export function extractWebhookToken(provider: string, url: URL, headers: Headers): string {
  if (provider === "asaas") return headers.get("asaas-access-token") ?? "";
  return url.searchParams.get("token") || headers.get("x-webhook-token") || "";
}

/** Um evento já foi aplicado se existir log processado com o mesmo id de evento. */
export function isAlreadyProcessed(rows: Array<{ processed?: boolean | null }> | null | undefined): boolean {
  return !!rows?.some((r) => r.processed === true);
}
