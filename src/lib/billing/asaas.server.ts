// Acesso server-only à API do Asaas (produção). Nunca importar em código de cliente:
// a chave ASAAS_API_KEY é lida apenas dentro destas funções, em tempo de chamada.

const ASAAS_BASE_URL = "https://api.asaas.com/v3";

function asaasKey(): string {
  const key = process.env["ASAAS_API_KEY"];
  if (!key) {
    throw new Error("ASAAS_API_KEY não configurada. Adicione o segredo nas configurações do projeto.");
  }
  return key;
}

async function asaasFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: asaasKey(),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      json?.errors?.[0]?.description || json?.message || `HTTP ${res.status}`;
    throw new Error(`Asaas: ${msg}`);
  }
  if (json == null || typeof json !== "object") {
    throw new Error("Asaas retornou uma resposta inválida.");
  }
  return json as T;
}

export type AsaasCustomerInput = {
  name: string;
  email?: string | null;
  /** CPF/CNPJ somente números; omitido quando indisponível. */
  cpfCnpj?: string | null;
};

/** Reusa o cliente Asaas pelo e-mail quando existe; senão cria. Retorna o id (cus_...). */
export async function ensureAsaasCustomer(input: AsaasCustomerInput): Promise<string> {
  const email = input.email?.trim().toLowerCase() || null;
  if (email) {
    const found = await asaasFetch<{ data?: Array<{ id?: string }> }>(
      `/customers?email=${encodeURIComponent(email)}&limit=1`,
    );
    const existing = found?.data?.[0]?.id;
    if (existing) return existing;
  }
  const body: Record<string, unknown> = { name: input.name };
  if (email) body.email = email;
  const doc = input.cpfCnpj?.replace(/\D/g, "");
  if (doc) body.cpfCnpj = doc;
  const created = await asaasFetch<{ id?: string }>("/customers", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!created.id) throw new Error("Asaas não retornou o id do cliente.");
  return created.id;
}

export type AsaasSubscriptionInput = {
  customerId: string;
  /** Valor mensal em reais. */
  value: number;
  /** Primeira cobrança (YYYY-MM-DD) — fim do trial do plano. */
  nextDueDate: string;
  description: string;
  /** Referência segura e parseável: flowa:<company UUID>:<plan UUID>. */
  externalReference: string;
};

/** Cria assinatura mensal. Retorna id e, quando disponível, o link de pagamento. */
export async function createAsaasSubscription(
  input: AsaasSubscriptionInput,
): Promise<{ id: string; invoiceUrl: string | null }> {
  const created = await asaasFetch<{ id?: string; invoiceUrl?: string }>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "UNDEFINED",
      cycle: "MONTHLY",
      value: input.value,
      nextDueDate: input.nextDueDate,
      description: input.description,
      externalReference: input.externalReference,
    }),
  });
  if (!created.id) throw new Error("Asaas não retornou o id da assinatura.");
  return { id: created.id, invoiceUrl: created.invoiceUrl ?? null };
}

/** Busca o link de pagamento (invoiceUrl) da cobrança pendente de uma assinatura. */
export async function getAsaasSubscriptionPaymentUrl(subscriptionId: string): Promise<string | null> {
  const res = await asaasFetch<{ data?: Array<{ invoiceUrl?: string }> }>(
    `/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=1`,
  );
  return res?.data?.[0]?.invoiceUrl ?? null;
}
