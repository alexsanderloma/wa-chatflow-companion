import { extractGeminiText, geminiErrorMessage, normalizeGeminiModel, type GeminiRequest } from "./gemini";

/** Shared server-only transport. Credentials stay in a header, never in URLs or errors. */
export async function generateGeminiContent(request: GeminiRequest, model?: string, signal?: AbortSignal): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Chave Gemini não configurada no servidor.");
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizeGeminiModel(model))}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch {
    throw new Error(signal?.aborted ? "A solicitação ao Gemini foi interrompida." : "Não foi possível conectar ao Gemini.");
  }
  if (!response.ok) throw new Error(geminiErrorMessage(response.status));
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error("O Gemini retornou uma resposta inválida."); }
  return extractGeminiText(data);
}