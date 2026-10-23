import { proxyHeaders, proxyTarget } from './supabase-proxy';

/** Transparent transport only: upstream Auth and RLS remain authoritative. */
export async function handleSupabaseProxy(request: Request): Promise<Response> {
  const upstream = process.env['SUPABASE_URL'];
  if (!upstream) return Response.json({ error: 'Serviço de conexão indisponível.' }, { status: 503 });
  let target: URL;
  try { target = proxyTarget(request.url, upstream); }
  catch { return Response.json({ error: 'Caminho não permitido.' }, { status: 400 }); }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Cache-Control': 'no-store' } });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const onAbort = () => controller.abort();
  const cleanup = () => { clearTimeout(timer); request.signal.removeEventListener('abort', onAbort); };
  request.signal.addEventListener('abort', onAbort, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    const headers = proxyHeaders(request.headers);
    // No privileged client, server cookies, secret injection, or redirect following.
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method, headers, redirect: 'manual', signal: controller.signal,
    };
    if (request.method !== 'GET' && request.body) { init.body = request.body; init.duplex = 'half'; }
    const result = await fetch(target, init);
    if (result.status >= 300 && result.status < 400) {
      cleanup();
      await result.body?.cancel();
      return Response.json({ error: 'Redirecionamento de conexão não permitido.' }, { status: 502 });
    }
    // Keep the deadline active through consumption, not just response headers.
    const body = result.body;
    if (!body) { cleanup(); return new Response(null, { status: result.status, headers: proxyHeaders(result.headers, true) }); }
    const reader = body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async pull(out) {
        try {
          const chunk = await reader.read();
          if (chunk.done) { cleanup(); out.close(); }
          else out.enqueue(chunk.value);
        } catch { cleanup(); out.error(new Error('Conexão interrompida.')); }
      },
      cancel() { cleanup(); controller.abort(); return reader.cancel(); },
    });
    return new Response(stream, { status: result.status, headers: proxyHeaders(result.headers, true) });
  } catch {
    cleanup();
    return Response.json({ error: 'Não foi possível conectar ao serviço. Tente novamente.' }, { status: controller.signal.aborted ? 504 : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}