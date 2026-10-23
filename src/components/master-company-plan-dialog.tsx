import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCompanyPlanManagement, manageCompanyPlan } from "@/lib/master.functions";
import { OPERATIONAL_SUBSCRIPTION_STATUSES } from "@/lib/master-plan";

type PlanData = Awaited<ReturnType<typeof getCompanyPlanManagement>>;
export function MasterCompanyPlanDialog({ companyId, onClose, onSaved }: { companyId: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const fetchPlan = useServerFn(getCompanyPlanManagement);
  const mutate = useServerFn(manageCompanyPlan);
  const [data, setData] = useState<PlanData | null>(null);
  const [planId, setPlanId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const current = data?.subscriptions.find((s) => OPERATIONAL_SUBSCRIPTION_STATUSES.some((status) => status === s.status));

  useEffect(() => {
    let live = true;
    setData(null); setPlanId(""); setError(""); setConfirmRemoval(false);
    if (!companyId) return;
    setLoading(true);
    fetchPlan({ data: { companyId } }).then((result) => {
      if (!live) return;
      setData(result);
      const active = result.subscriptions.find((s) => OPERATIONAL_SUBSCRIPTION_STATUSES.some((status) => status === s.status));
      setPlanId(result.plans.some((p) => p.id === active?.plan_id) ? active?.plan_id ?? "" : "");
    }).catch(() => { if (live) setError("Não foi possível carregar os planos. Feche e tente novamente."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [companyId]);

  async function save(action: "assign" | "cancel") {
    if (!companyId || !data || saving) return;
    setSaving(true);
    try {
      const result = await mutate({ data: { companyId, planId, action } });
      toast.success(result.changed ? action === "cancel" ? "Plano removido; acesso suspenso" : "Plano atualizado internamente" : "O plano já está neste estado");
      await onSaved();
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar o plano"); }
    finally { setSaving(false); }
  }

  return <Dialog open={!!companyId} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Gerenciar plano{data ? ` — ${data.company.nome}` : ""}</DialogTitle></DialogHeader>
      {loading ? <div className="py-8 grid place-items-center"><Loader2 className="animate-spin" aria-label="Carregando plano" /></div> : error ? <p role="alert" className="text-destructive">{error}</p> : data && <div className="space-y-5 text-sm">
        <div className="border-b pb-4 space-y-1">
          <p>Plano atual: <strong>{current?.plan?.nome ?? "Sem plano operacional"}</strong></p>
          <p>Status da assinatura: <strong>{current ? subscriptionStatusLabel(current.status) : "Sem assinatura operacional"}</strong></p>
          <p className="text-muted-foreground">Empresa: {data.company.status_cobranca}{current?.current_period_end ? ` · Período até ${new Date(current.current_period_end).toLocaleDateString("pt-BR")}` : ""}</p>
        </div>
        <p className="text-muted-foreground">Alteração interna de acesso ao FLOWA. Não altera nem cancela cobranças ou assinaturas no Asaas ou em outro provedor.</p>
        <div className="space-y-2">
          <label htmlFor="company-plan">Plano ativo</label>
          <Select value={planId} onValueChange={setPlanId} disabled={saving}>
            <SelectTrigger id="company-plan"><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
            <SelectContent>{data.plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome} · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: p.moeda }).format(p.preco_cents / 100)}</SelectItem>)}</SelectContent>
          </Select>
          {data.plans.length === 0 && <p className="text-muted-foreground">Nenhum plano ativo disponível.</p>}
        </div>
        {confirmRemoval ? <div className="border border-destructive/40 rounded-md p-4 space-y-3" role="alert">
          <p className="font-medium">Remover o plano e suspender o acesso imediatamente?</p>
          <p>Os dados e o histórico serão preservados. Cancele separadamente qualquer cobrança externa no Asaas.</p>
          <div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={saving} onClick={() => save("cancel")}>Confirmar remoção</Button><Button variant="outline" disabled={saving} onClick={() => setConfirmRemoval(false)}>Voltar</Button></div>
        </div> : <div className="flex flex-wrap gap-2">
          <Button disabled={saving || !planId} onClick={() => save("assign")}>{saving && <Loader2 className="size-4 animate-spin" />}{current ? "Trocar plano" : "Atribuir plano"}</Button>
          <Button variant="destructive" disabled={saving || (!current && data.company.status_cobranca === "suspenso")} onClick={() => setConfirmRemoval(true)}>Remover plano</Button>
        </div>}
        <section className="border-t pt-4 space-y-2"><h3 className="font-semibold">Histórico de assinaturas</h3>
          {data.subscriptions.length ? data.subscriptions.map((s) => <div key={s.id} className="flex flex-wrap justify-between gap-1 border-b py-2">
            <span>{s.plan?.nome ?? "Plano indisponível"} · {subscriptionStatusLabel(s.status)} · {s.provider === "manual" ? "Gestão interna" : s.provider}</span>
            <span className="text-muted-foreground">{new Date(s.canceled_at ?? s.created_at).toLocaleString("pt-BR")}</span>
          </div>) : <p className="text-muted-foreground">Sem assinaturas anteriores.</p>}
        </section>
        <section className="border-t pt-4 space-y-2"><h3 className="font-semibold">Alterações administrativas</h3>
          {data.history.length ? data.history.map((event) => <p key={event.id}>{new Date(event.created_at).toLocaleString("pt-BR")} · {event.acao === "master_plan_cancel" ? "Remoção administrativa" : "Atribuição/troca administrativa"} · Responsável: {event.user_id}</p>) : <p className="text-muted-foreground">Nenhuma alteração administrativa registrada.</p>}
        </section>
      </div>}
    </DialogContent>
  </Dialog>;
}

export function subscriptionStatusLabel(status: string) {
  return ({ active: "Ativa", trialing: "Em teste", canceled: "Cancelada", past_due: "Inadimplente", paused: "Pausada", incomplete: "Incompleta" } as Record<string, string>)[status] ?? status;
}