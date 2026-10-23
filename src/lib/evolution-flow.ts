// Pure helpers for the Evolution connection flow (no secrets, no network).

export type EvoErrorCode = "nao_configurada" | "api_indisponivel" | "timeout" | "instancia_ausente" | "http";

export class EvolutionError extends Error {
  code: EvoErrorCode;
  status: number | null;
  constructor(code: EvoErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "EvolutionError";
    this.code = code;
    this.status = status;
  }
}

/** Transient = worth a short retry: network, timeout, 5xx, 429. */
export function isTransientEvoError(e: unknown): boolean {
  if (!(e instanceof EvolutionError)) return false;
  if (e.code === "api_indisponivel" || e.code === "timeout") return true;
  return e.code === "http" && e.status !== null && (e.status >= 500 || e.status === 429);
}

export function classifyHttpFailure(status: number, body: string): EvoErrorCode {
  if (status === 404) return "instancia_ausente";
  if ((status === 400 || status === 403) && /not\s*exist|does not exist|not found|não existe/i.test(body)) return "instancia_ausente";
  return "http";
}

export function isAlreadyExistsMessage(msg: string): boolean {
  return /already|exists|in use|em uso|já existe/i.test(msg);
}

/** Normalizes Evolution connectionState responses to open | connecting | close | null. */
export function parseEvoState(payload: any): "open" | "connecting" | "close" | null {
  const s = payload?.instance?.state ?? payload?.state ?? payload?.instance?.status ?? null;
  if (s === "open" || s === "connecting") return s;
  if (s === "close" || s === "closed" || s === "disconnected") return "close";
  return null;
}

export type ConnectAction = "create" | "already_open" | "connect";

/** Idempotent decision: never recreate an existing instance; never call connect on an open one. */
export function decideConnectAction(state: "open" | "connecting" | "close" | null | "missing"): ConnectAction {
  if (state === "missing") return "create";
  if (state === "open") return "already_open";
  return "connect";
}

function looksLikeImageBase64(base64: string) {
  try {
    const bin = atob(base64.replace(/\s/g, "").slice(0, 64));
    return (
      (bin.charCodeAt(0) === 0x89 && bin.slice(1, 4) === "PNG") ||
      (bin.charCodeAt(0) === 0xff && bin.charCodeAt(1) === 0xd8) ||
      (bin.slice(0, 4) === "RIFF" && bin.slice(8, 12) === "WEBP")
    );
  } catch {
    return false;
  }
}

export function asImageDataUrl(value: unknown, allowRawBase64 = false): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (text.startsWith("data:image/")) return text;
  const base64 = text.includes("base64,") ? text.split("base64,").pop()?.trim() : text;
  if (allowRawBase64 && base64 && base64.length > 120 && /^[A-Za-z0-9+/=\s]+$/.test(base64) && looksLikeImageBase64(base64)) {
    return `data:image/png;base64,${base64.replace(/\s/g, "")}`;
  }
  return null;
}

/** Extracts an image data URL and/or raw QR string from any supported Evolution connect payload. */
export function parseQrPayload(payload: any): { image: string | null; code: string | null; pairingCode: string | null } {
  const roots = [payload, payload?.qrcode, payload?.qr, payload?.instance?.qrcode].filter((r) => r && typeof r === "object");
  let image: string | null = null;
  for (const r of roots) {
    image = asImageDataUrl(r.base64, true);
    if (image) break;
  }
  if (!image) image = asImageDataUrl(payload?.qrcode, true) || asImageDataUrl(payload?.qr, true);
  let code: string | null = null;
  const codes = [payload?.code, payload?.qrcode?.code, payload?.qr?.code, payload?.qrCode, payload?.qrcode, payload?.qr];
  for (const v of codes) {
    if (typeof v === "string" && v.trim() && !asImageDataUrl(v, true) && v.trim().length > 20) { code = v.trim(); break; }
  }
  const pc = payload?.pairingCode ?? payload?.qrcode?.pairingCode ?? null;
  return { image, code, pairingCode: typeof pc === "string" && pc ? pc : null };
}

export type DiagnosticCode = "nao_configurada" | "api_indisponivel" | "instancia_ausente" | "qr_indisponivel" | "desconectada" | "conectando" | "conectada";

export function diagnosticFromError(e: unknown): DiagnosticCode {
  if (e instanceof EvolutionError) {
    if (e.code === "nao_configurada") return "nao_configurada";
    if (e.code === "instancia_ausente") return "instancia_ausente";
    if (e.code === "api_indisponivel" || e.code === "timeout" || isTransientEvoError(e)) return "api_indisponivel";
  }
  return "api_indisponivel";
}

export const DIAGNOSTIC_MESSAGES: Record<DiagnosticCode, string> = {
  nao_configurada: "O servidor de integração do WhatsApp ainda não está configurado. Fale com o suporte.",
  api_indisponivel: "O servidor de integração do WhatsApp não respondeu. Não é problema da sua senha nem do seu WhatsApp. Tente novamente em instantes.",
  instancia_ausente: "Sua linha ainda não foi criada no servidor de integração. Clique em Conectar WhatsApp para criá-la.",
  qr_indisponivel: "O servidor de integração não devolveu o QR Code desta vez. Clique em Tentar novamente.",
  desconectada: "Sua linha está desconectada. Clique em Conectar WhatsApp para gerar o QR Code.",
  conectando: "Aguardando a leitura do QR Code no celular.",
  conectada: "WhatsApp conectado. As mensagens serão respondidas automaticamente.",
};

/** Retries only transient failures, with short linear backoff. */
export async function withEvoRetry<T>(op: () => Promise<T>, attempts = 3, delayMs = 600, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await op(); } catch (e) {
      last = e;
      if (!isTransientEvoError(e) || i === attempts - 1) throw e;
      await sleep(delayMs * (i + 1));
    }
  }
  throw last;
}
