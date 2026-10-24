// Server-only: downloads media then analyzes through the same Lovable Gateway.
// Base64 só existe em memória durante a requisição; nunca é logado nem salvo.
import { evoGetMediaBase64 } from "./evolution.server";
import { gatewayChat } from "./ai-gateway.server";
import type { AiUsageContext } from "./ai-usage.server";
import {
  base64ByteLength,
  buildMediaAnalysisMessages,
  audioFormatFromMime,
  maxBytesFor,
  type DetectedMedia,
} from "./whatsapp-media";

const MEDIA_MODEL = "google/gemini-2.5-flash";
const DOWNLOAD_TIMEOUT_MS = 15_000;

export async function analyzeWhatsappMedia(
  instanceName: string,
  data: any,
  media: DetectedMedia,
  usage: AiUsageContext = {},
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
    const native = buildMediaAnalysisMessages(media, base64);
    const instruction = native[0]?.parts.find(part => 'text' in part);
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: instruction && 'text' in instruction ? instruction.text : '' },
      media.kind === 'image'
        ? { type: 'image_url', image_url: { url: `data:${media.mimetype};base64,${base64}` } }
        : { type: 'input_audio', input_audio: { data: base64, format: audioFormatFromMime(media.mimetype) } },
    ];
    const out = await gatewayChat([{ role: 'user', content }], MEDIA_MODEL, { ...usage, purpose: media.kind });
    base64 = null;
    return out ? out.slice(0, 2000) : null;
  } catch {
    // Neither download nor provider exceptions are trusted to exclude credentials/media.
    console.error("[media]", media.kind, "Falha ao baixar ou analisar mídia.");
    return null;
  }
}
