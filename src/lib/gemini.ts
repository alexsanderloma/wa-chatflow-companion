/** Pure Google generateContent protocol helpers; no credentials or network. */
export type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
export interface GeminiContent { role: "user" | "model"; parts: GeminiPart[] }
export interface GeminiRequest {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
}

export function normalizeGeminiModel(model?: string): string {
  const normalized = model?.trim().replace(/^google\//, "") || "gemini-3.8-flash";
  return normalized === "gemini-2.5-flash" ? "gemini-3.8-flash" : normalized;
}

export function buildGeminiRequest(messages: { role: "system" | "user" | "assistant"; content: string }[]): GeminiRequest {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content);
  return {
    ...(system.length ? { systemInstruction: { parts: [{ text: system.join("\n\n") }] } } : {}),
    contents: messages.filter((message) => message.role !== "system").map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
  };
}

export function geminiErrorMessage(status: number): string {
  if (status === 429) return "Limite temporário do Gemini atingido. Tente em alguns minutos.";
  if (status === 401 || status === 403) return "Chave Gemini não autorizada.";
  return `Não foi possível obter uma resposta do Gemini (HTTP ${status}).`;
}

export function extractGeminiText(data: unknown): string {
  const response = data as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] } | null;
  const candidate = response?.candidates?.[0];
  if (response?.promptFeedback?.blockReason || (candidate?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason))) {
    throw new Error("O Gemini não pôde responder a esta solicitação.");
  }
  const text = candidate?.content?.parts?.filter((part) => typeof part.text === "string" && !part.thought).map((part) => part.text).join("").trim() || "";
  if (!text) throw new Error("O Gemini retornou uma resposta vazia.");
  return text;
}