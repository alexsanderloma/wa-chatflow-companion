// Detecção de mídia (imagem/áudio) em mensagens da Evolution API e montagem
// do conteúdo multimodal enviado à IA. Módulo puro (sem rede) para testes.

export type MediaKind = "image" | "audio";
export type AudioFormat = "wav" | "mp3" | "webm" | "m4a" | "ogg" | "aac" | "flac";

export interface DetectedMedia {
  kind: MediaKind;
  mimetype: string;
  caption: string | null;
  fileLength: number | null;
  /** base64 já incluído no webhook (quando a instância envia base64). Nunca persistir. */
  inlineBase64: string | null;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const IMAGE_LABEL = "[Imagem recebida]";
export const AUDIO_LABEL = "[Áudio recebido]";

/** Remove invólucros comuns (temporária, visualização única, documento com legenda). */
export function unwrapMessage(msg: any): any {
  let current = msg ?? {};
  for (let i = 0; i < 5; i++) {
    const inner =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.documentWithCaptionMessage?.message;
    if (!inner) break;
    current = inner;
  }
  return current;
}

function toNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  if (typeof v === "object" && typeof v.low === "number") return v.low >>> 0; // Long do protobuf
  return null;
}

function cleanBase64(v: any): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.includes("base64,") ? v.split("base64,").pop()! : v;
  return s.replace(/\s/g, "") || null;
}

export function detectMedia(rawMsg: any): DetectedMedia | null {
  const msg = unwrapMessage(rawMsg);
  const inline = cleanBase64(rawMsg?.base64 ?? msg?.base64);
  const img = msg?.imageMessage;
  if (img) {
    return {
      kind: "image",
      mimetype: String(img.mimetype || "image/jpeg").split(";")[0].trim(),
      caption: typeof img.caption === "string" && img.caption.trim() ? img.caption.trim() : null,
      fileLength: toNumber(img.fileLength),
      inlineBase64: inline,
    };
  }
  const aud = msg?.audioMessage || msg?.pttMessage;
  if (aud) {
    return {
      kind: "audio",
      mimetype: String(aud.mimetype || "audio/ogg").split(";")[0].trim(),
      caption: null,
      fileLength: toNumber(aud.fileLength),
      inlineBase64: inline,
    };
  }
  // Documento que na verdade é imagem/áudio
  const doc = msg?.documentMessage;
  const docMime = typeof doc?.mimetype === "string" ? doc.mimetype.split(";")[0].trim() : "";
  if (doc && (docMime.startsWith("image/") || docMime.startsWith("audio/"))) {
    return {
      kind: docMime.startsWith("image/") ? "image" : "audio",
      mimetype: docMime,
      caption: typeof doc.caption === "string" && doc.caption.trim() ? doc.caption.trim() : null,
      fileLength: toNumber(doc.fileLength),
      inlineBase64: inline,
    };
  }
  return null;
}

export function maxBytesFor(kind: MediaKind) {
  return kind === "image" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
}

export function base64ByteLength(b64: string): number {
  const s = b64.replace(/\s/g, "");
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

export function audioFormatFromMime(mime: string): AudioFormat {
  const m = mime.toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("aac")) return "aac";
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  if (m.includes("flac")) return "flac";
  return "ogg";
}

const IMAGE_PROMPT =
  "Você recebe uma imagem enviada por um cliente no WhatsApp. Descreva objetivamente, em português, o que aparece nela, incluindo qualquer texto legível (preços, nomes, códigos). Não invente detalhes que não estejam visíveis. Responda em no máximo 6 frases.";
const AUDIO_PROMPT =
  "Transcreva fielmente, em português, o áudio enviado por um cliente no WhatsApp. Responda apenas com a transcrição, sem comentários. Se o áudio estiver inaudível ou sem fala, responda exatamente: [inaudível]";

/** Mensagens para o gateway (chat completions) com a mídia real. */
export function buildMediaAnalysisMessages(media: DetectedMedia, base64: string) {
  if (!base64.trim()) throw new Error("Mídia vazia");
  if (media.kind === "image") {
    const content: any[] = [{ type: "text", text: IMAGE_PROMPT + (media.caption ? `\nLegenda do cliente: ${media.caption}` : "") }];
    content.push({ type: "image_url", image_url: { url: `data:${media.mimetype || "image/jpeg"};base64,${base64}` } });
    return [{ role: "user", content }];
  }
  return [
    {
      role: "user",
      content: [
        { type: "text", text: AUDIO_PROMPT },
        { type: "input_audio", input_audio: { data: base64, format: audioFormatFromMime(media.mimetype) } },
      ],
    },
  ];
}

export function isUsableAnalysis(text: string | null | undefined): text is string {
  if (!text) return false;
  const t = text.trim();
  return !!t && t.toLowerCase() !== "[inaudível]";
}

/** Texto salvo no CRM/histórico: legenda/transcrição, ou rótulo. Nunca base64. */
export function crmTextFor(media: DetectedMedia, analysis: string | null): string {
  if (media.kind === "audio") {
    return isUsableAnalysis(analysis) ? `${AUDIO_LABEL} ${analysis.trim()}` : AUDIO_LABEL;
  }
  return media.caption ? `${IMAGE_LABEL} ${media.caption}` : IMAGE_LABEL;
}

/** Conteúdo entregue à IA de atendimento como última mensagem do contato. */
export function aiUserTextFor(media: DetectedMedia, analysis: string | null): string {
  if (media.kind === "image") {
    const caption = media.caption ? `\nLegenda/texto do contato: ${media.caption}` : "";
    if (isUsableAnalysis(analysis)) {
      return `[O contato enviou uma imagem. Descrição do conteúdo visual: ${analysis.trim()}]${caption}`;
    }
    return `[O contato enviou uma imagem que NÃO pôde ser analisada. Diga com honestidade que não conseguiu ver a imagem e peça para descrever por texto. Não invente o conteúdo.]${caption}`;
  }
  if (isUsableAnalysis(analysis)) {
    return `[O contato enviou um áudio. Transcrição:] ${analysis.trim()}`;
  }
  return "[O contato enviou um áudio que NÃO pôde ser transcrito. Diga com honestidade que não conseguiu ouvir o áudio e peça para escrever a mensagem. Não invente o conteúdo.]";
}

export interface MediaGateState {
  hasMedia: boolean;
  optOut: boolean;
  paused: boolean;
  offHours: boolean;
  superseded: boolean;
  humanActive: boolean;
  noCredit: boolean;
  throttled: boolean;
}

/** Download/análise só é permitido quando nenhuma saída bloqueia a resposta automática. */
export function shouldAnalyzeMedia(s: MediaGateState): boolean {
  return s.hasMedia && !s.optOut && !s.paused && !s.offHours && !s.superseded && !s.humanActive && !s.noCredit && !s.throttled;
}
