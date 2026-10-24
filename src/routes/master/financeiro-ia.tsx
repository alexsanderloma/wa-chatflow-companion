import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { queryOptions, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getAiFinance, addAiExpense, saveAiSettings, resumeAiAccess } from '@/lib/ai-finance.functions';
import { financeTotals } from '@/lib/ai-finance';
import { simulatePrice } from '@/lib/ai-accounting';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Download, RefreshCw, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

const initialFilter = () => { const today=new Date().toISOString().slice(0,10);return {from:`${today.slice(0,7)}-01`,to:today}; };
const financeQuery = (filters: {from:string;to:string;companyId?:string;plan?:'starter'|'pro'|'business'})=>queryOptions({queryKey:['master-ai-finance',filters],queryFn:()=>getAiFinance({data:filters})});
export const Route=createFileRoute('/master/financeiro-ia')({
  loader:({context})=>context.queryClient.ensureQueryData(financeQuery(initialFilter())),
  head:()=>({meta:[{title:`${brand.name} — Finanças da IA`},{name:'description',content:'Controle financeiro privado de IA do FLOWA para o Master.'},{property:'og:title',content:`${brand.name} — Finanças da IA`},{property:'og:description',content:'Consumo, despesas e simulações internas da IA.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  component:AiFinancePage,
});
const number=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:6});
const brl=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
function AiFinancePage(){
  const [filters,setFilters]=useState(initialFilter());
  const [companyId,setCompany]=useState(''); const [plan,setPlan]=useState('');
  const query=financeQuery({...filters,companyId:companyId||undefined,plan:plan?plan as 'starter'|'pro'|'business':undefined});
  const {data}=useSuspenseQuery(query); const client=useQueryClient();
  const add=useServerFn(addAiExpense),save=useServerFn(saveAiSettings),resume=useServerFn(resumeAiAccess);
  const [description,setDescription]=useState('');const [expense,setExpense]=useState('');
  const [cost,setCost]=useState('100');const [other,setOther]=useState('0');const [multiplier,setMultiplier]=useState('3');const [safety,setSafety]=useState('0');const [creditBrl,setCreditBrl]=useState('');
  const [busy,setBusy]=useState(false);
  const totals=financeTotals(data.usage);const delivered=data.charges.filter(r=>r.status==='delivered').length; const pending=data.charges.filter(r=>r.status==='reserved'||r.status==='pending').length;
  const paymentUnknown=data.payments.some(p=>p.amount_cents===null);
  const revenue=data.payments.reduce((s,p)=>s+(p.amount_cents??0),0)/100;
  const expenses=data.expenses.reduce((s,e)=>s+e.amount_cents,0)/100;
  const rate=data.settings?.credit_brl ?? null;
  const estimatedBrl=rate!==null && !totals.unpriced ? totals.estimated*rate:null;
  const simulated=(()=>{try{return simulatePrice(Number(cost),Number(other),Number(multiplier),Number(safety));}catch{return null;}})();
  const refresh=()=>client.invalidateQueries({queryKey:['master-ai-finance']});
  const task=async(work:()=>Promise<unknown>)=>{setBusy(true);try{await work();await refresh();toast.success('Salvo');}catch(error){toast.error(error instanceof Error?error.message:'Não foi possível salvar.');}finally{setBusy(false);}};
  const exportReport=()=>{
    const quote=(value:unknown)=>`"${String(value??'desconhecido').replaceAll('"','""')}"`;
    const rows=[['empresa','plano','modelo','finalidade','status','entrada','saída','créditos estimados','créditos confirmados','data'],...data.usage.map(r=>[data.companies.find(c=>c.id===r.company_id)?.nome,r.plan_slug,r.model,r.purpose,r.status,r.input_tokens,r.output_tokens,r.estimated_credits,r.confirmed_credits,r.created_at])];
    const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(quote).join(';')).join('\n')],{type:'text/csv;charset=utf-8'})); const a=document.createElement('a');a.href=url;a.download='flowa-financas-ia.csv';a.click();URL.revokeObjectURL(url);
  };
  return <div className="space-y-6">
    <header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Finanças da IA</h1><p className="text-sm text-muted-foreground">Master · {filters.from} — {filters.to}</p></div><div className="flex gap-2"><Button variant="outline" onClick={exportReport}><Download className="size-4 mr-2"/>Relatório</Button><Button variant="outline" size="icon" aria-label="Atualizar relatório" onClick={refresh}><RefreshCw className="size-4"/></Button></div></header>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Field label="De"><Input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></Field><Field label="Até"><Input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></Field>
      <Field label="Empresa"><select aria-label="Empresa" className="h-10 w-full border rounded-md bg-background px-2 text-sm" value={companyId} onChange={e=>setCompany(e.target.value)}><option value="">Todas</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
      <Field label="Plano"><select aria-label="Plano" className="h-10 w-full border rounded-md bg-background px-2 text-sm" value={plan} onChange={e=>setPlan(e.target.value)}><option value="">Todos</option><option value="starter">Starter</option><option value="pro">Pro</option><option value="business">Business</option></select></Field>
    </section>
    {data.partial&&<p className="text-destructive text-sm">Período com amostra parcial; reduza o intervalo antes de comparar totais.</p>}
    {data.access.filter(r=>r.paused).map(r=><div key={r.model} className="border border-destructive p-4 space-y-2"><p className="text-sm text-destructive">{r.model}: {r.reason}</p><Button variant="outline" disabled={busy} onClick={()=>{if(confirm('O acesso ao provedor foi regularizado? A liberação permite somente novas solicitações.'))void task(()=>resume({data:{model:r.model,accessRestored:true}}));}}>Liberar novas solicitações</Button></div>)}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[
      ['Chamadas',String(data.usage.length)],['Respostas entregues',String(delivered)],['Pendentes de entrega',String(pending)],['Créditos estimados',totals.unpriced?'Parcial · '+number(totals.estimated):number(totals.estimated)],
      ['Tokens de entrada',totals.unknown?'Parcial · '+number(totals.input):number(totals.input)],['Tokens de saída',totals.unknown?'Parcial · '+number(totals.output):number(totals.output)],['Recebimentos brutos registrados',paymentUnknown?'Parcial · '+brl(revenue):brl(revenue)],['Despesas registradas',brl(expenses)],
    ].map(([label,value])=><Card key={label} className="p-4 min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="font-bold text-lg break-words mt-1">{value}</div></Card>)}</div>
    <section className="border-y py-4 grid sm:grid-cols-3 gap-4 text-sm"><div>Créditos confirmados: <strong>{!data.usage.length || totals.unconfirmed?'Não conciliados':number(totals.confirmed)}</strong></div><div>Estimativa por 1.000 respostas: <strong>{delivered&&!totals.unpriced?number(totals.estimated/delivered*1000)+' créditos':'Indisponível'}</strong></div><div>Margem estimada: <strong>Indisponível até conciliar estornos</strong></div></section>
    <p className="text-sm text-muted-foreground">{totals.unknown} chamadas sem tokens completos · {totals.unpriced} sem tarifa · {totals.failures} falhas · {pending} reservas aguardando confirmação. Registro iniciado nesta versão, sem importação histórica; recebimentos brutos não incluem estornos conciliados. Valores estimados não são custos em dinheiro confirmados.</p>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Simulador de preço</h2><div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Field label="Custo IA (R$)"><Input type="number" min="0" value={cost} onChange={e=>setCost(e.target.value)}/></Field><Field label="Outras despesas (R$)"><Input type="number" min="0" value={other} onChange={e=>setOther(e.target.value)}/></Field><Field label="Multiplicador"><Input type="number" min="1" value={multiplier} onChange={e=>setMultiplier(e.target.value)}/></Field><Field label="Segurança (%)"><Input type="number" min="0" max="100" value={safety} onChange={e=>setSafety(e.target.value)}/></Field><Field label="R$/crédito — estimativa"><Input type="number" min="0" value={creditBrl} onChange={e=>setCreditBrl(e.target.value)} placeholder={rate===null?'Não definido':String(rate)}/></Field></div><div className="flex flex-wrap justify-between gap-3 items-center"><p className="text-sm">Preço simulado: <strong>{simulated?brl(simulated.recommended):'Valores inválidos'}</strong> · Margem simulada: {simulated?.margin===null||!simulated?'—':number(simulated.margin)+'%'}</p><Button disabled={busy||!simulated} onClick={()=>void task(()=>save({data:{creditBrl:creditBrl?Number(creditBrl):null,multiplier:Number(multiplier),safetyPct:Number(safety)}}))}><Save className="size-4 mr-2"/>Salvar parâmetros</Button></div></section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Registrar despesa</h2><div className="flex flex-wrap gap-3 items-end"><Field label="Descrição"><Input value={description} onChange={e=>setDescription(e.target.value)}/></Field><Field label="Valor (R$)"><Input type="number" min="0" value={expense} onChange={e=>setExpense(e.target.value)}/></Field><Button disabled={busy||description.trim().length<2||!expense} onClick={()=>void task(()=>add({data:{description,amountCents:Math.round(Number(expense)*100),date:filters.to,companyId:companyId||null}}))}><Plus className="size-4 mr-2"/>Registrar</Button></div></section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Uso por empresa e plano</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3 pr-4">Empresa</th><th className="pr-4">Plano</th><th className="pr-4">Chamadas</th><th>Créditos estimados</th></tr></thead><tbody>{data.companies.filter(c=>(!companyId||c.id===companyId)&&(!plan||c.selected_plan_slug===plan)).map(c=>{const rows=data.usage.filter(r=>r.company_id===c.id),t=financeTotals(rows);return <tr key={c.id} className="border-b"><td className="py-3 pr-4">{c.nome}</td><td className="pr-4">{c.selected_plan_slug||'Sem plano'}</td><td>{rows.length}</td><td>{t.unpriced?'Parcial · ':''}{number(t.estimated)}</td></tr>;})}</tbody></table></div></section>
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5 min-w-0"><Label className="text-xs">{label}</Label>{children}</div>;}