// Regras puras (sem I/O) de Fornecedores e Catálogo. Usadas pela tela, pelas server functions e pelo webhook.

export const SUPPLIER_CATEGORIES = ["android", "iphone", "tablet", "acessorios", "manutencao", "outros"] as const;
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SupplierCategory, string> = {
  android: "Android",
  iphone: "iPhone",
  tablet: "Tablet",
  acessorios: "Acessórios",
  manutencao: "Manutenção",
  outros: "Outros",
};

/** Nenhuma margem é predefinida: cada empresa salva a sua (0 = sem margem configurada). */
export const DEFAULT_MARGINS: Record<SupplierCategory, number> = {
  android: 0,
  iphone: 0,
  tablet: 0,
  acessorios: 0,
  manutencao: 0,
  outros: 0,
};

export const DEFAULT_VALIDITY_HOURS = 24;

export type UpdateKind = "texto" | "imagem" | "audio" | "documento" | "video" | "outro";

/**
 * Normaliza telefone para dígitos E.164 (sem "+"). Números brasileiros sem DDI
 * (10 ou 11 dígitos) recebem 55. Retorna null se inválido.
 */
export function normalizeSupplierPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = String(input).split("@")[0].replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 15) return null;
  return d;
}

/** Variações do mesmo número BR (com e sem o 9º dígito), para casar o remetente do WhatsApp. */
export function phoneVariants(phone: string): string[] {
  const n = normalizeSupplierPhone(phone);
  if (!n) return [];
  const out = new Set([n]);
  if (n.startsWith("55")) {
    const ddd = n.slice(2, 4);
    const rest = n.slice(4);
    if (rest.length === 9 && rest.startsWith("9")) out.add(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8) out.add(`55${ddd}9${rest}`);
  }
  return [...out];
}

export type SupplierLite = { id: string; company_id: string; telefone: string; ativo: boolean };

/** Group identities are never phones. Only explicit participant phone JIDs are trusted.
 * LID identities need an explicit participantAlt phone; never infer from sender/group IDs.
 */
export function groupSupplierSenderPhone(data: any): string | null {
  for (const value of [data?.key?.participant, data?.key?.participantAlt, data?.participant]) {
    if (typeof value !== "string") continue;
    const match = value.match(/^([1-9]\d{9,14})(?::\d+)?@(s\.whatsapp\.net|c\.us)$/);
    if (match) return normalizeSupplierPhone(match[1]);
  }
  return null;
}

/** Encontra o fornecedor ativo DAQUELA empresa que corresponde ao remetente. */
export function findSupplierForSender<T extends SupplierLite>(
  suppliers: T[],
  companyId: string,
  sender: string,
): T | null {
  const variants = new Set(phoneVariants(sender));
  if (!variants.size) return null;
  for (const s of suppliers) {
    if (s.company_id !== companyId || !s.ativo) continue;
    if (phoneVariants(s.telefone).some((v) => variants.has(v))) return s;
  }
  return null;
}

/** Preço sugerido = custo total / (1 - margem). Valores em centavos. */
export function suggestedPriceCents(costCents: number, extraCostsCents: number, marginPct: number): number | null {
  if (!Number.isFinite(costCents) || costCents < 0) return null;
  if (!Number.isFinite(marginPct) || marginPct < 0 || marginPct >= 100) return null;
  const total = costCents + Math.max(0, extraCostsCents || 0);
  return Math.ceil(total / (1 - marginPct / 100));
}

export type QuoteStatus = "atualizado" | "vencido" | "sem_tabela";

export function supplierQuoteStatus(lastUpdate: string | null | undefined, validityHours: number, now = Date.now()): QuoteStatus {
  if (!lastUpdate) return "sem_tabela";
  const t = new Date(lastUpdate).getTime();
  if (!Number.isFinite(t)) return "sem_tabela";
  return now - t <= validityHours * 3_600_000 ? "atualizado" : "vencido";
}

/** Classifica a mensagem do fornecedor e extrai somente metadados seguros (nunca base64). */
export function classifySupplierMessage(rawMsg: any): { tipo: UpdateKind; texto: string | null; metadata: Record<string, unknown> } {
  let msg = rawMsg ?? {};
  for (let i = 0; i < 3; i++) {
    const inner = msg?.ephemeralMessage?.message || msg?.viewOnceMessage?.message || msg?.viewOnceMessageV2?.message || msg?.documentWithCaptionMessage?.message;
    if (!inner) break;
    msg = inner;
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => {
    const n = typeof v === "object" && v && "low" in (v as any) ? Number((v as any).low) : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const text = str(msg.conversation) || str(msg.extendedTextMessage?.text);
  if (msg.imageMessage) return { tipo: "imagem", texto: str(msg.imageMessage.caption), metadata: { mimetype: str(msg.imageMessage.mimetype), tamanho: num(msg.imageMessage.fileLength) } };
  if (msg.audioMessage || msg.pttMessage) {
    const a = msg.audioMessage || msg.pttMessage;
    return { tipo: "audio", texto: null, metadata: { mimetype: str(a.mimetype), segundos: num(a.seconds), tamanho: num(a.fileLength) } };
  }
  if (msg.documentMessage) {
    const d = msg.documentMessage;
    return { tipo: "documento", texto: str(d.caption), metadata: { mimetype: str(d.mimetype), arquivo: str(d.fileName), paginas: num(d.pageCount), tamanho: num(d.fileLength) } };
  }
  if (msg.videoMessage) return { tipo: "video", texto: str(msg.videoMessage.caption), metadata: { mimetype: str(msg.videoMessage.mimetype), segundos: num(msg.videoMessage.seconds) } };
  if (text) return { tipo: "texto", texto: text, metadata: {} };
  return { tipo: "outro", texto: null, metadata: {} };
}

export type CatalogItemInput = {
  produto: string; marca: string | null; modelo: string | null; categoria: SupplierCategory;
  custo_cents: number | null; disponibilidade: string | null;
};

/** "R$ 1.234,56" | "1234.56" | "1,234.56" → centavos; vazio/inválido → null. */
export function parseBrlToCents(input: unknown): number | null {
  let s = String(input ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const HEADER_ALIASES: Record<keyof CatalogItemInput, string[]> = {
  produto: ["produto", "nome", "item", "descricao", "product"],
  marca: ["marca", "brand", "fabricante"],
  modelo: ["modelo", "model", "versao"],
  categoria: ["categoria", "category", "tipo"],
  custo_cents: ["custo", "preco", "valor", "price", "preco custo", "valor custo"],
  disponibilidade: ["disponibilidade", "estoque", "status", "qtd", "quantidade"],
};

export function toCategory(v: unknown): SupplierCategory {
  const n = norm(String(v ?? ""));
  const hit = SUPPLIER_CATEGORIES.find((c) => n === c || n === norm(CATEGORY_LABELS[c]));
  if (hit) return hit;
  if (n.includes("iphone")) return "iphone";
  if (n.includes("android") || n.includes("samsung") || n.includes("xiaomi") || n.includes("motorola")) return "android";
  if (n.includes("tablet") || n.includes("ipad")) return "tablet";
  if (n.includes("acess")) return "acessorios";
  if (n.includes("manut") || n.includes("reparo")) return "manutencao";
  return "outros";
}

/** Converte linhas de planilha (1ª linha = cabeçalho) em itens. Sem coluna de produto → erro claro. */
export function mapCatalogRows(rows: string[][]): { items: CatalogItemInput[]; skipped: number } {
  const [header, ...body] = rows.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (!header) throw new Error("Arquivo vazio.");
  const h = header.map((c) => norm(String(c ?? "")));
  const col = (k: keyof CatalogItemInput) => h.findIndex((x) => HEADER_ALIASES[k].includes(x));
  const idx = Object.fromEntries((Object.keys(HEADER_ALIASES) as (keyof CatalogItemInput)[]).map((k) => [k, col(k)])) as Record<keyof CatalogItemInput, number>;
  if (idx.produto < 0) throw new Error("Não encontrei a coluna 'produto' no cabeçalho do arquivo.");
  const get = (r: string[], k: keyof CatalogItemInput) => (idx[k] >= 0 ? String(r[idx[k]] ?? "").trim() : "");
  let skipped = 0;
  const items: CatalogItemInput[] = [];
  for (const r of body) {
    const produto = get(r, "produto").slice(0, 200);
    if (!produto) { skipped++; continue; }
    items.push({
      produto,
      marca: get(r, "marca").slice(0, 120) || null,
      modelo: get(r, "modelo").slice(0, 120) || null,
      categoria: toCategory(get(r, "categoria") || `${produto} ${get(r, "marca")}`),
      custo_cents: parseBrlToCents(get(r, "custo_cents")),
      disponibilidade: get(r, "disponibilidade").slice(0, 120) || null,
    });
  }
  return { items, skipped };
}
