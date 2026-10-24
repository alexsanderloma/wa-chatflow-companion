import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

async function authorize(client: any, userId: string) {
  const { data, error } = await client.from('user_roles').select('id').eq('user_id', userId).eq('role', 'super_admin').maybeSingle();
  if (error || !data) throw new Error('Acesso negado.');
}
const filter = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), companyId: z.string().uuid().optional(), plan: z.enum(['starter','pro','business']).optional() }).refine(d => d.from <= d.to, 'Período inválido');
export const getAiFinance = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input => filter.parse(input)).handler(async ({data,context}) => {
  await authorize(context.supabase, context.userId);
  const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
  const from = `${data.from}T00:00:00Z`, end = new Date(`${data.to}T00:00:00Z`); end.setUTCDate(end.getUTCDate()+1);
  let usage = admin.from('ai_usage').select('*').gte('created_at',from).lt('created_at',end.toISOString()).order('created_at',{ascending:false}).limit(2000);
  let charges = admin.from('ai_response_charge').select('id,company_id,status,delivered_parts,created_at').gte('created_at',from).lt('created_at',end.toISOString()).limit(2000);
  let payments = admin.from('billing_payment_credit').select('*,plan:plan(slug)').gte('created_at',from).lt('created_at',end.toISOString()).limit(2000);
  let expenses = admin.from('ai_fin_expense').select('*').gte('incurred_on',data.from).lte('incurred_on',data.to).limit(2000);
  if(data.companyId) { usage=usage.eq('company_id',data.companyId); charges=charges.eq('company_id',data.companyId);payments=payments.eq('company_id',data.companyId);expenses=expenses.eq('company_id',data.companyId); }
  if(data.plan) usage=usage.eq('plan_slug',data.plan);
  const results = await Promise.all([usage,charges,payments,expenses,admin.from('company').select('id,nome,selected_plan_slug,creditos_saldo').order('nome'),admin.from('ai_fin_settings').select('*').order('created_at',{ascending:false}).limit(1),admin.from('ai_access_state').select('*')]);
  for(const result of results) if(result.error) throw new Error('Não foi possível carregar o relatório financeiro.');
  const companies = results[4].data ?? [];
  const selected = new Set(companies.filter(c=>!data.plan || c.selected_plan_slug===data.plan).map(c=>c.id));
  return {
    usage: results[0].data ?? [], charges: (results[1].data ?? []).filter(c=>selected.has(c.company_id)),
    payments: (results[2].data ?? []).filter(p=>!data.plan || (p.plan as any)?.slug===data.plan),
    expenses: (results[3].data ?? []).filter(e=>!data.plan || (e.company_id && selected.has(e.company_id))),
    companies, settings: results[5].data?.[0] ?? null, access: results[6].data ?? [],
    partial: results.slice(0,4).some(r=>r.data?.length===2000),
  };
});

export const addAiExpense = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({description:z.string().trim().min(2).max(160),amountCents:z.number().int().min(0).max(100000000),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),companyId:z.string().uuid().nullable()}).parse(input))
  .handler(async({data,context})=>{
    await authorize(context.supabase,context.userId);
    const {error}=await context.supabase.from('ai_fin_expense').insert({description:data.description,amount_cents:data.amountCents,incurred_on:data.date,company_id:data.companyId,created_by:context.userId});
    if(error) throw new Error('Despesa não salva.');
    return {ok:true};
  });
export const saveAiSettings = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({creditBrl:z.number().positive().max(10000).nullable(),multiplier:z.number().min(1).max(100),safetyPct:z.number().min(0).max(100)}).parse(input))
  .handler(async({data,context})=>{
    await authorize(context.supabase,context.userId);
    const {error}=await context.supabase.from('ai_fin_settings').insert({credit_brl:data.creditBrl,multiplier:data.multiplier,safety_pct:data.safetyPct,created_by:context.userId});
    if(error) throw new Error('Parâmetros não salvos.');
    return {ok:true};
  });
export const resumeAiAccess = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator(input=>z.object({model:z.string().min(3).max(120),accessRestored:z.literal(true)}).parse(input))
  .handler(async({data,context})=>{
    await authorize(context.supabase,context.userId);
    const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
    const {error}=await supabaseAdmin.from('ai_access_state').update({paused:false,reason:null,updated_at:new Date().toISOString()}).eq('model',data.model);
    if(error) throw new Error('Acesso não liberado.');
    return {ok:true};
  });