import * as QRCode from "qrcode";
import { supportWhatsappUrl } from "@/config/brand";
import { EvolutionError, classifyHttpFailure, parseQrPayload, withEvoRetry } from "./evolution-flow";

// Wrapper server-only para a Evolution API v2.
// Arquivo *.server.ts é bloqueado do bundle client.

const SUPPORT_SUFFIX = ` Se persistir, fale com o suporte: ${supportWhatsappUrl}`;
const DEFAULT_TIMEOUT_MS = 15_000;

function env() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) {
    throw new EvolutionError("nao_configurada", `Servidor do WhatsApp não configurado.${SUPPORT_SUFFIX}`);
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function evo<T = any>(
  path: string,
  init: RequestInit & { json?: any } = {},
): Promise<T> {
  const { url, key } = env();
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch (e: any) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    // Nunca inclui URL/chave na mensagem.
    throw new EvolutionError(timeout ? "timeout" : "api_indisponivel",
      `Servidor de integração do WhatsApp ${timeout ? "não respondeu a tempo" : "indisponível"}.${SUPPORT_SUFFIX}`);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const raw = data?.response?.message ?? data?.message ?? data?.error ?? `HTTP ${res.status}`;
    const msg = (Array.isArray(raw) ? raw.join(" ") : String(raw)).slice(0, 200);
    throw new EvolutionError(classifyHttpFailure(res.status, msg), `Evolution API: ${msg}.${SUPPORT_SUFFIX}`, res.status);
  }
  return data as T;
}

export async function evoCreateInstance(instanceName: string, webhookUrl?: string) {
  // Evolution v2: POST /instance/create
  const body: any = {
    instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
  };
  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT"],
    };
  }
  return evo(`/instance/create`, { method: "POST", json: body, signal: AbortSignal.timeout(20_000) });
}

export async function evoConnect(instanceName: string, number?: string): Promise<any> {
  // GET /instance/connect/{instance}[?number=] → { base64, code, pairingCode } (só usar no clique "Conectar").
  const q = number ? `?number=${encodeURIComponent(number)}` : "";
  return withEvoRetry(() => evo(`/instance/connect/${encodeURIComponent(instanceName)}${q}`, { method: "GET" }));
}

/** Reinicia a instância (não apaga dados) — usado só quando connect não devolve QR. */
export async function evoRestart(instanceName: string) {
  return evo(`/instance/restart/${encodeURIComponent(instanceName)}`, { method: "PUT" });
}

export async function qrFromPayload(payload: any): Promise<{ qrBase64: string | null; code: string | null; pairingCode: string | null }> {
  const { image, code, pairingCode } = parseQrPayload(payload);
  if (image) return { qrBase64: image, code, pairingCode };
  if (code) {
    const qrBase64 = await QRCode.toDataURL(code, { width: 320, margin: 2, errorCorrectionLevel: "M" });
    return { qrBase64, code, pairingCode };
  }
  return { qrBase64: null, code: null, pairingCode };
}

export async function evoGetQr(instanceName: string, number?: string) {
  return qrFromPayload(await evoConnect(instanceName, number));
}

export async function evoState(instanceName: string): Promise<{ instance?: { state?: string }; state?: string }> {
  return withEvoRetry(() => evo(`/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET", signal: AbortSignal.timeout(10_000) }));
}

export async function evoSetWebhook(instanceName: string, webhookUrl: string) {
  return withEvoRetry(() => evo(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"],
      },
    },
  }));
}

export async function evoSendText(instanceName: string, number: string, text: string, timeoutMs?: number) {
  return evo(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: { number, text },
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
}

export async function evoSendPresence(instanceName: string, number: string, presence: "composing" | "paused" | "available", delayMs = 1500) {
  try {
    await evo(`/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      json: { number, presence, delay: delayMs },
    });
  } catch {
    // best-effort
  }
}

// Baixa uma mídia recebida (imagem/áudio) como base64. Timeout obrigatório.
export async function evoGetMediaBase64(
  instanceName: string,
  message: { key: any; message: any },
  timeoutMs = 15_000,
): Promise<{ base64: string | null; mimetype: string | null }> {
  const data: any = await evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: { message, convertToMp4: false },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = typeof data?.base64 === "string" ? data.base64 : null;
  const base64 = raw ? (raw.includes("base64,") ? raw.split("base64,").pop()! : raw).replace(/\s/g, "") : null;
  return { base64: base64 || null, mimetype: typeof data?.mimetype === "string" ? data.mimetype : null };
}

export async function evoLogout(instanceName: string) {
  return evo(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function evoDelete(instanceName: string) {
  return evo(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function evoFetchNumberFromInstance(instanceName: string): Promise<string | null> {
  try {
    const data: any = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, {
      method: "GET",
    });
    const inst = Array.isArray(data) ? data[0] : data?.[0] ?? data;
    return inst?.instance?.owner || inst?.owner || inst?.number || null;
  } catch {
    return null;
  }
}
