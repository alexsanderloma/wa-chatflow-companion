import { extractGeminiText, geminiErrorMessage, normalizeGeminiModel, type GeminiRequest } from "./gemini";

/** Shared server-only transport. Credentials stay in a header, never in URLs or errors. */

// Modelos novos (ex.: 3.8) sofrem picos de demanda (503/429). Em falha temporária,
// tentamos modelos estáveis mais antigos, nesta ordem, sem expor detalhes do provedor.
const FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"];
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

async function callGemini(request: GeminiRequest, model: string, signal?: AbortSignal): Promise<Response> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Chave Gemini não configurada no servidor.");
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch {
    throw new Error(signal?.aborted ? "A solicitação ao Gemini foi interrompida." : "Não foi possível conectar ao Gemini.");
  }
  return response;
}

export async function generateGeminiContent(request: GeminiRequest, model?: string, signal?: AbortSignal): Promise<string> {
  const primary = normalizeGeminiModel(model);
  const chain = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastStatus = 0;
  for (const candidate of chain) {
    const response = await callGemini(request, candidate, signal);
    if (!response.ok) {
      lastStatus = response.status;
      // Falha temporária (demanda alta / limite): tenta o próximo modelo da cadeia.
      if (TRANSIENT_STATUSES.has(response.status) && candidate !== chain[chain.length - 1]) continue;
      throw new Error(geminiErrorMessage(response.status));
    }
    let data: unknown;
    try { data = await response.json(); } catch { throw new Error("O Gemini retornou uma resposta inválida."); }
    return extractGeminiText(data);
  }
  throw new Error(geminiErrorMessage(lastStatus || 503));
}
