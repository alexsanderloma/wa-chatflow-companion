import { createFileRoute } from '@tanstack/react-router';

async function handle({ request }: { request: Request }) {
  const { handleSupabaseProxy } = await import('@/lib/supabase-proxy.server');
  return handleSupabaseProxy(request);
}

export const Route = createFileRoute('/api/supabase-proxy/$')({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle, OPTIONS: handle } },
});