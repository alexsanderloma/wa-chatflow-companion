// Server-only: baixa a mídia pela Evolution API e analisa com o gateway Gemini.
// Base64 só existe em memória durante a requisição; nunca é logado nem salvo.
import { evoGetMediaBase64 } from "./evolution.server";
import {
  base64ByteLength,
  buildMediaAnalysisMessages,
  maxBytesFor,
  type DetectedMedia,
} from "./whatsapp-media";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MEDIA_MODEL = "google/gemini-3.8-flash";
const DOWNLOAD_TIMEOUT_MS = 15_000;
const ANALYSIS_TIMEOUT_MS = 30_000;

export async function analyzeWhatsappMedia(
  instanceName: string,
  data: any,
  media: DetectedMedia,
): Promise<string | null> {
  const limit = maxBytesFor(media.kind);
  if (media.fileLength && media.fileLength > limit) {
    console.warn("[media] arquivo acima do limite", media.kind, media.fileLength);
    return null;
  }
  try {
    let base64 = media.inlineBase64;
    if (!base64) {
      const r = await evoGetMediaBase64(instanceName, { key: data?.key, message: data?.message }, DOWNLOAD_TIMEOUT_MS);
      base64 = r.base64;
      if (r.mimetype && !media.mimetype) media = { ...media, mimetype: r.mimetype };
    }
    if (!base64) return null;
    if (base64ByteLength(base64) > limit) {
      console.warn("[media] download acima do limite", media.kind);
      return null;
    }
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return null;
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MEDIA_MODEL, messages: buildMediaAnalysisMessages(media, base64) }),
      signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
    });
    base64 = null;
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[media.ai]", res.status, t.slice(0, 200));
      return null;
    }
    const json: any = await res.json();
    const out = json?.choices?.[0]?.message?.content?.toString().trim() || "";
    return out ? out.slice(0, 2000) : null;
  } catch (e: any) {
    console.error("[media]", media.kind, e?.name || "", String(e?.message || "").slice(0, 200));
    return null;
  }
}
