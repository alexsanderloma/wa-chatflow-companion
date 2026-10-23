import { createFileRoute, Link } from "@tanstack/react-router";
import { APRESENTACAO_ABAS, type ApresentacaoAba } from "@/lib/apresentacao.shared";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Building2, TrendingUp, Activity, Wallet, Search, CreditCard, BarChart3 } from "lucide-react";
import { getApresentacao } from "@/lib/apresentacao.functions";

export const Route = createFileRoute("/master/apresentacao")({
  validateSearch: (s: Record<string, unknown>): { aba: ApresentacaoAba } => ({
    aba: (APRESENTACAO_ABAS as readonly string[]).includes(s.aba as string) ? (s.aba as ApresentacaoAba) : "painel",
  }),
  head: () => ({ meta: [{ title: "Master — Apresentação (Demonstração)" }, { name: "robots", content: "noindex" }] }),
  component: Apresentacao,
});

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s: string) => s.split("-").reverse().join("/");
const RED = "var(--brand-master)";

function Apresentacao() {
  const fn = useServerFn(getApresentacao);
  const [data, setData] = useState<Awaited<ReturnType<typeof getApresentacao>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { aba: tab } = Route.useSearch();
  const [q, setQ] = useState("");
  const [qs, setQs] = useState("");
  const [comp, setComp] = useState("todas");

  useEffect(() => { fn().then(setData).catch((e) => setErr(e?.message ?? "Acesso negado")); }, []);

  const empresas = useMemo(() => {
    const t = q.toLowerCase().trim();
    return (data?.empresas ?? []).filter((e: any) => !t || `${e.nome} ${e.responsavel} ${e.email} ${e.cidade}`.toLowerCase().includes(t));
  }, [data, q]);
  const assinaturas = useMemo(() => {
    const t = qs.toLowerCase().trim();
    return (data?.assinaturas ?? []).filter((a: any) => !t || `${a.empresa} ${a.responsavel} ${a.email}`.toLowerCase().includes(t));
  }, [data, qs]);
  const pagamentos = useMemo(() => (data?.pagamentos ?? []).filter((p: any) => comp === "todas" || p.competencia === comp), [data, comp]);

  if (err) return <div className="text-sm text-muted-foreground">Acesso negado.</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  const s = data.stats;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border px-4 py-2.5 text-[13px] font-semibold flex items-center gap-2" style={{ borderColor: RED, color: RED, background: "rgba(220,38,38,.08)" }}>
        <span className="size-2 rounded-full" style={{ background: RED }} />
        Demonstração — dados 100% fictícios, não representam empresas ou pagamentos reais.
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold">Apresentação <span className="text-sm font-semibold" style={{ color: RED }}>(Demonstração)</span></h1>
          <p className="text-xs text-muted-foreground">Cenário simulado · plano único R$ 297/mês · abril a setembro/2026</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {([["painel", "Painel", BarChart3], ["empresas", "Empresas", Building2], ["assinaturas", "Assinaturas", CreditCard]] as const).map(([k, l, I]) => (
            <Link key={k} to="/master/apresentacao" search={{ aba: k }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium ${tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`} style={tab === k ? { background: "rgba(220,38,38,.12)" } : undefined}>
              <I className="size-4" />{l}
            </Link>
          ))}
        </div>
      </header>

      {tab === "painel" && (
        <>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<Building2 className="size-4" />} label="Empresas" value={s.total} trend={`+${s.novasMes} em set/26`} />
            <Kpi icon={<Activity className="size-4" />} label="Ativas" value={s.ativas} trend="100%" />
            <Kpi icon={<Wallet className="size-4" />} label="MRR (set/26)" value={brl(s.mrr_cents)} />
            <Kpi icon={<TrendingUp className="size-4" />} label="Receita acumulada" value={brl(s.receitaTotal_cents)} trend={`${s.totalPagamentos} pagamentos`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Empresas pagantes (acumulado)">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.15)" />
                  <XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="empresas" stroke="#FF5A5A" strokeWidth={2.5} dot={{ r: 3, fill: "#FF5A5A" }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Receita mensal por competência">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,.15)" />
                  <XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} />
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
                  <Bar dataKey="receita" fill="#FF5A5A" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}

      {tab === "empresas" && (
        <Card title={`Empresas (${empresas.length} de ${data.empresas.length})`}>
          <div className="relative mb-3">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa, responsável, e-mail ou cidade…" className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground text-left"><tr><th className="py-2 pr-3">Empresa</th><th className="pr-3">Responsável</th><th className="pr-3">Cidade</th><th className="pr-3">Plano</th><th className="pr-3">Status</th><th>Cadastro</th></tr></thead>
              <tbody>
                {empresas.map((e: any) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{e.nome}</td>
                    <td className="pr-3"><div>{e.responsavel}</div><div className="text-xs text-muted-foreground">{e.email}</div></td>
                    <td className="pr-3 text-muted-foreground">{e.cidade}</td>
                    <td className="pr-3">{e.plano} · {brl(e.preco_cents)}</td>
                    <td className="pr-3"><span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Ativo</span></td>
                    <td className="whitespace-nowrap">{dt(e.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "assinaturas" && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            {data.series.map((m: any) => (
              <div key={m.mes} className="rounded-xl border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground">{m.mes}</div>
                <div className="font-display font-bold">{m.empresas} pagos</div>
                <div className="text-xs" style={{ color: RED }}>{m.receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
              </div>
            ))}
          </div>
          <Card title={`Assinaturas ativas (${assinaturas.length} de ${data.assinaturas.length}) · MRR ${brl(s.mrr_cents)}`}>
            <div className="relative mb-3">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={qs} onChange={(e) => setQs(e.target.value)} placeholder="Buscar empresa, responsável ou e-mail…" className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm" />
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground text-left sticky top-0 bg-card"><tr><th className="py-2 pr-3">Empresa</th><th className="pr-3">Plano</th><th className="pr-3">Início</th><th className="pr-3">Último pagamento</th><th className="pr-3">Próxima cobrança</th><th className="pr-3">Valor</th><th>Status</th></tr></thead>
                <tbody>
                  {assinaturas.map((a: any) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="py-2 pr-3"><div className="font-medium">{a.empresa}</div><div className="text-xs text-muted-foreground">{a.responsavel}</div></td>
                      <td className="pr-3 whitespace-nowrap">{a.plano}</td>
                      <td className="pr-3 whitespace-nowrap">{dt(a.inicio)}</td>
                      <td className="pr-3 whitespace-nowrap">{dt(a.ultimo_pagamento)}</td>
                      <td className="pr-3 whitespace-nowrap">{dt(a.proxima_cobranca)}</td>
                      <td className="pr-3 whitespace-nowrap">{brl(a.valor_cents)}/mês</td>
                      <td><span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Ativa (simulado)</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={`Histórico de pagamentos fictícios (${pagamentos.length})`}>
            <select value={comp} onChange={(e) => setComp(e.target.value)} className="mb-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="todas">Todas as competências</option>
              {["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((c) => <option key={c} value={c}>{c.slice(5)}/{c.slice(0, 4)}</option>)}
            </select>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground text-left sticky top-0 bg-card"><tr><th className="py-2 pr-3">Empresa</th><th className="pr-3">Responsável</th><th className="pr-3">Competência</th><th className="pr-3">Valor</th><th className="pr-3">Pago em</th><th>Status</th></tr></thead>
                <tbody>
                  {pagamentos.map((p: any) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2 pr-3 font-medium">{p.empresa}</td>
                      <td className="pr-3 text-muted-foreground">{p.responsavel}</td>
                      <td className="pr-3">{p.competencia_label}</td>
                      <td className="pr-3">{brl(p.valor_cents)}</td>
                      <td className="pr-3">{dt(p.pago_em)}</td>
                      <td><span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Pago (simulado)</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-display text-[15px] font-semibold mb-3">{title}</h2>{children}</div>;
}

function Kpi({ icon, label, value, trend }: { icon: React.ReactNode; label: string; value: React.ReactNode; trend?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><span style={{ color: RED }}>{icon}</span>{label}</div>
      <div className="font-display font-extrabold text-2xl mt-2">{value}</div>
      {trend && <div className="text-xs mt-2 text-muted-foreground">{trend}</div>}
    </div>
  );
}
