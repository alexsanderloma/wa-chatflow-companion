import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { brand } from "@/config/brand";
import { maskPhone } from "@/lib/masks";
import {
  CATEGORY_LABELS, suggestedPriceCents, supplierQuoteStatus, type SupplierCategory,
} from "@/lib/suppliers";
import {
  getSuppliersOverview, saveSupplier, setSupplierActive, deleteSupplier, saveMarginRule,
} from "@/lib/suppliers.functions";

export const Route = createFileRoute("/app/fornecedores")({
  head: () => ({
    meta: [
      { title: `${brand.name} — Fornecedores e Catálogo` },
      { name: "description", content: "Cadastre fornecedores por WhatsApp e acompanhe tabelas de catálogo e margens." },
      { property: "og:title", content: `${brand.name} — Fornecedores e Catálogo` },
      { property: "og:description", content: "Fornecedores, catálogo e margens por categoria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FornecedoresPage,
});

type Overview = Awaited<ReturnType<typeof getSuppliersOverview>>;
const STATUS_LABEL = { atualizado: "Atualizado", vencido: "Vencido", sem_tabela: "Sem tabela" } as const;
const TIPO_LABEL: Record<string, string> = { texto: "Texto", imagem: "Imagem", audio: "Áudio", documento: "Documento", video: "Vídeo", outro: "Outro" };
const UPD_STATUS: Record<string, string> = { pendente_revisao: "Pendente de revisão", processando: "Processando", processado: "Processado", erro: "Erro", ignorado: "Ignorado" };
const brl = (c: number | null | undefined, moeda = "BRL") =>
  c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: moeda });
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");

const empty = { id: undefined as string | undefined, nome: "", telefone: "", validade_horas: 24, observacoes: "", ativo: true };

function FornecedoresPage() {
  const ctx = Route.useRouteContext() as any;
  const companyId: string | undefined = ctx?.company?.id;
  const load = useServerFn(getSuppliersOverview);
  const save = useServerFn(saveSupplier);
  const toggle = useServerFn(setSupplierActive);
  const remove = useServerFn(deleteSupplier);
  const saveMargin = useServerFn(saveMarginRule);

  const [data, setData] = useState<Overview | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [margins, setMargins] = useState<Record<string, { m: string; c: string }>>({});

  async function reload() {
    if (!companyId) return;
    try {
      const r = await load({ data: { companyId } });
      setData(r);
      setMargins(Object.fromEntries(r.margins.map((m) => [m.categoria, { m: String(m.margem_liquida_pct), c: String(m.custos_extras_cents / 100) }])));
    } catch (e: any) { toast.error(e?.message || "Erro ao carregar"); }
  }
  useEffect(() => { void reload(); }, [companyId]);

  async function submit() {
    if (!companyId) return;
    setBusy(true);
    try {
      await save({ data: { companyId, ...form, validade_horas: Number(form.validade_horas) } });
      toast.success(form.id ? "Fornecedor atualizado" : "Fornecedor cadastrado");
      setForm(empty);
      await reload();
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar"); }
    finally { setBusy(false); }
  }

  const supplierName = (id: string) => data?.suppliers.find((s: any) => s.id === id)?.nome ?? "—";

  if (!data) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Fornecedores e Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Mensagens recebidas no WhatsApp de um fornecedor ativo viram atualizações de catálogo e não recebem resposta automática.
          Custos são visíveis apenas para a sua equipe.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium">{form.id ? "Editar fornecedor" : "Novo fornecedor"}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label>WhatsApp</Label><Input value={form.telefone} placeholder="(31) 99999-9999" onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
          <div><Label>Validade das cotações (horas)</Label><Input type="number" min={1} max={720} value={form.validade_horas} onChange={(e) => setForm({ ...form, validade_horas: Number(e.target.value) })} /></div>
        </div>
        <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{form.id ? "Salvar" : "Cadastrar"}</Button>
          {form.id && <Button variant="outline" onClick={() => setForm(empty)}>Cancelar</Button>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-medium">Fornecedores</h2>
        {data.suppliers.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p> : (
          <div className="space-y-2">
            {data.suppliers.map((s: any) => {
              const st = supplierQuoteStatus(s.ultima_atualizacao_em, s.validade_horas);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium">{s.nome} {!s.ativo && <Badge variant="outline">Inativo</Badge>}</div>
                    <div className="text-xs text-muted-foreground">+{s.telefone.slice(0, 2)} {maskPhone(s.telefone.slice(2))} · validade {s.validade_horas}h · última atualização {dt(s.ultima_atualizacao_em)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={st === "atualizado" ? "default" : st === "vencido" ? "destructive" : "secondary"}>{STATUS_LABEL[st]}</Badge>
                    <Switch checked={s.ativo} onCheckedChange={async (v) => { try { await toggle({ data: { companyId: companyId!, id: s.id, ativo: v } }); await reload(); } catch (e: any) { toast.error(e?.message); } }} />
                    <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setForm({ id: s.id, nome: s.nome, telefone: s.telefone, validade_horas: s.validade_horas, observacoes: s.observacoes ?? "", ativo: s.ativo })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Remover" onClick={async () => { if (!confirm(`Remover ${s.nome}? O histórico dele também será removido.`)) return; try { await remove({ data: { companyId: companyId!, id: s.id } }); await reload(); } catch (e: any) { toast.error(e?.message); } }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 font-medium">Margens por categoria</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Preço sugerido = custo total ÷ (1 − margem líquida). O custo total soma o custo do fornecedor mais taxas, frete e outros custos informados.
          Nenhuma margem vem predefinida: defina e salve a margem líquida de cada categoria. Sem margem salva, não há preço sugerido. Ex.: custo total R$ 700 com margem de 30% → R$ 1.000.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {data.margins.map((m) => (
            <div key={m.categoria} className="space-y-2 border border-border p-3">
              <div className="text-sm font-medium">{CATEGORY_LABELS[m.categoria as SupplierCategory]}</div>
              {m.margem_liquida_pct === 0 && <p className="text-xs text-muted-foreground">Sem margem configurada: defina sua própria regra antes de usar o preço sugerido.</p>}
              <div className="flex gap-2">
                <div className="flex-1"><Label className="text-xs">Margem %</Label><Input type="number" value={margins[m.categoria]?.m ?? ""} onChange={(e) => setMargins({ ...margins, [m.categoria]: { ...margins[m.categoria], m: e.target.value } })} /></div>
                <div className="flex-1"><Label className="text-xs">Custos extras (R$)</Label><Input type="number" value={margins[m.categoria]?.c ?? ""} onChange={(e) => setMargins({ ...margins, [m.categoria]: { ...margins[m.categoria], c: e.target.value } })} /></div>
              </div>
              <Button size="sm" variant="outline" onClick={async () => {
                try {
                  await saveMargin({ data: { companyId: companyId!, categoria: m.categoria as SupplierCategory, margem_liquida_pct: Number(margins[m.categoria]?.m), custos_extras_cents: Math.round(Number(margins[m.categoria]?.c || 0) * 100) } });
                  toast.success("Margem salva"); await reload();
                } catch (e: any) { toast.error(e?.message); }
              }}>Salvar</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-x-auto p-4">
        <h2 className="mb-3 font-medium">Itens de catálogo</h2>
        {data.items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item extraído ainda. As atualizações recebidas ficam pendentes de revisão.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Produto</th><th>Marca/modelo</th><th>Custo</th><th>Preço sugerido</th><th>Disponibilidade</th><th>Fonte</th><th>Atualizado</th></tr></thead>
            <tbody>
              {data.items.map((it: any) => {
                const rule = data.margins.find((m) => m.categoria === it.categoria);
                const sug = it.custo_cents != null && rule && rule.margem_liquida_pct > 0 ? suggestedPriceCents(Number(it.custo_cents), rule.custos_extras_cents, rule.margem_liquida_pct) : null;
                return (
                  <tr key={it.id} className="border-t border-border">
                    <td className="py-2">{it.produto}</td>
                    <td>{[it.marca, it.modelo].filter(Boolean).join(" ") || "—"}</td>
                    <td>{brl(it.custo_cents, it.moeda)}</td>
                    <td>{brl(sug, it.moeda)}</td>
                    <td>{it.disponibilidade || "—"}</td>
                    <td>{it.fonte || supplierName(it.supplier_id)}</td>
                    <td>{dt(it.atualizado_em)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-medium">Atualizações recebidas</h2>
        {data.updates.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma atualização recebida.</p> : (
          <div className="space-y-2">
            {data.updates.map((u: any) => (
              <div key={u.id} className="border-b border-border pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span>{dt(u.recebido_em)}</span><span>· {supplierName(u.supplier_id)}</span>
                  <Badge variant="outline">{TIPO_LABEL[u.tipo] ?? u.tipo}</Badge>
                  <Badge variant="secondary">{UPD_STATUS[u.status] ?? u.status}</Badge>
                  {u.midia_metadata?.arquivo && <span className="text-muted-foreground">{u.midia_metadata.arquivo}</span>}
                </div>
                {u.conteudo_bruto && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{u.conteudo_bruto}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
