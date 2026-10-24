// Server-only: baixa a mídia pela Evolution API e analisa com Gemini direto.
// Base64 só existe em memória durante a requisição; nunca é logado nem salvo.
import { evoGetMediaBase64 } from "./evolution.server";
import { generateGeminiContent } from "./gemini.server";
import {
  base64ByteLength,
  buildMediaAnalysisMessages,
  maxBytesFor,
  type DetectedMedia,
} from "./whatsapp-media";

const MEDIA_MODEL = "gemini-3.8-flash";
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
    const out = await generateGeminiContent(
      { contents: buildMediaAnalysisMessages(media, base64) }, MEDIA_MODEL,
      AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
    );
    base64 = null;
    return out ? out.slice(0, 2000) : null;
  } catch {
    // Neither download nor provider exceptions are trusted to exclude credentials/media.
    console.error("[media]", media.kind, "Falha ao baixar ou analisar mídia.");
    return null;
  }
}
