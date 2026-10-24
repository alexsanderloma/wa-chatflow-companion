import { estimateGatewayCredits } from './ai-accounting';

export type AiUsageContext = { companyId?: string; chargeId?: string; planSlug?: string; purpose?: 'chat' | 'image' | 'audio' | 'agent-config' };
export async function recordAiUsage(context: AiUsageContext, row: { provider: string; model: string; status: string; input?: number | null; output?: number | null; runId?: string | null }) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const priced = row.provider === 'lovable' && row.model === 'google/gemini-2.5-flash';
  const { error } = await supabaseAdmin.from('ai_usage').insert({
    company_id: context.companyId ?? null, charge_id: context.chargeId ?? null, plan_slug: context.planSlug ?? null,
    purpose: context.purpose ?? 'chat', provider: row.provider, model: row.model, status: row.status,
    input_tokens: row.input ?? null, output_tokens: row.output ?? null,
    estimated_credits: priced ? estimateGatewayCredits(row.input ?? null, row.output ?? null, context.purpose === 'audio') : null,
    rate_version: priced ? 'gateway-catalog-2026-10-24' : null, gateway_run_id: row.runId ?? null,
  });
  if (error) throw new Error('Falha ao registrar o consumo de IA.');
}

export async function assertGatewayAccess(model: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('ai_access_state').select('paused,reason').eq('model', model).maybeSingle();
  if (error) throw new Error('Não foi possível verificar o acesso à IA.');
  if (data?.paused) throw new Error(data.reason || 'Acesso à IA pausado; requer regularização e liberação do Master.');
}
export async function pauseGatewayAccess(model: string, reason: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('ai_access_state').upsert({ model, paused: true, reason, updated_at: new Date().toISOString() });
  if (error) throw new Error('Falha ao persistir a pausa da IA.');
}