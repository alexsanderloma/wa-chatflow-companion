import type { AiUsageContext } from './ai-usage.server';

export type GatewayMessage = { role: 'system' | 'user' | 'assistant'; content: string | Array<Record<string, unknown>> };
export function gatewayModel(model?: string) {
  const value = model?.trim() || 'google/gemini-2.5-flash';
  return value.startsWith('google/') ? value : `google/${value}`;
}
export class GatewayError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function gatewaySafeError(status: number, safeMessage?: string) {
  if (safeMessage) return safeMessage;
  if (status === 429) return 'Limite temporário da IA. Tente novamente mais tarde.';
  if (status === 402) return 'Créditos Lovable esgotados; o responsável precisa regularizar o saldo.';
  if (status === 401) return 'Chave de IA não autorizada. Verifique a configuração.';
  if (status === 403) return 'Acesso à IA negado. O responsável precisa regularizar a autorização.';
  return `Não foi possível obter uma resposta da IA (HTTP ${status}).`;
}

type Dependencies = {
  access(model: string): Promise<void>;
  pause(model: string, reason: string): Promise<void>;
  record(context: AiUsageContext, row: {provider: string; model: string; status: string; input?: number | null; output?: number | null; runId?: string | null}): Promise<void>;
};

/** Final-only feature; consume streaming upstream without timers or automatic replays. */
export async function gatewayChat(messages: GatewayMessage[], model?: string, context: AiUsageContext = {}, dependencies?: Dependencies): Promise<string> {
  const selected = gatewayModel(model);
  const key = process.env.LOVABLE_API_KEY?.trim();
  if (!key) throw new GatewayError('Chave de IA não configurada no servidor.', 401);
  const module = dependencies ? null : await import('./ai-usage.server');
  const deps = dependencies ?? (module ? { access: module.assertGatewayAccess, pause: module.pauseGatewayAccess, record: module.recordAiUsage } : undefined);
  if (!deps) throw new Error('Registro da IA não configurado.');
  await deps.access(selected);
  let input: number | null = null, output: number | null = null, runId: string | null = null, status = 'error';
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({ model: selected, messages, stream: true, stream_options: { include_usage: true } }),
    });
    runId = response.headers.get('X-Lovable-AIG-Run-ID');
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      // Gateway message is a safe message, not the provider's raw body.
      const message = typeof body?.message === 'string' ? body.message : typeof body?.error?.message === 'string' ? body.error.message : undefined;
      const safe = gatewaySafeError(response.status, message);
      if (response.status === 402 || response.status === 403) await deps.pause(selected, safe);
      throw new GatewayError(safe, response.status);
    }
    if (!response.body) throw new GatewayError('A IA retornou uma resposta vazia.', 502);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', answer = '', finished = false;
    const frame = async (data: string) => {
      if (data === '[DONE]') { finished = true; return; }
      const chunk = JSON.parse(data);
      if (chunk.error) {
        const code = Number(chunk.error.status || chunk.status || 502);
        const message = gatewaySafeError(code, typeof chunk.error.message === 'string' ? chunk.error.message : undefined);
        if (code === 402 || code === 403) await deps.pause(selected, message);
        throw new GatewayError(message, code);
      }
      if (chunk.usage) {
        input = typeof chunk.usage.prompt_tokens === 'number' ? chunk.usage.prompt_tokens : input;
        output = typeof chunk.usage.completion_tokens === 'number' ? chunk.usage.completion_tokens : output;
      }
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason === 'content_filter' || choice?.finish_reason === 'refusal' || choice?.delta?.refusal) {
        throw new GatewayError('A IA não pôde responder a esta solicitação.', 200);
      }
      if (typeof choice?.delta?.content === 'string') answer += choice.delta.content;
    };
    try {
      for (;;) {
        const result = await reader.read();
        buffer += decoder.decode(result.value, { stream: !result.done }).replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (data) await frame(data);
          boundary = buffer.indexOf('\n\n');
        }
        if (result.done) break;
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (!finished || !answer.trim()) throw new GatewayError('A IA retornou uma resposta vazia ou interrompida.', 502);
    status = 'success';
    return answer.trim();
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError('Não foi possível conectar ou ler a resposta da IA.', 502);
  } finally {
    await deps.record(context, { provider: 'lovable', model: selected, status, input, output, runId });
  }
}