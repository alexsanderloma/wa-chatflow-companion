import { createClient, RealtimeClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types';
// Relative import intentionally bypasses the application alias to the managed client.
import { supabase as managedSupabase } from '../integrations/supabase/client';
import { brokeredPreviewStorage } from '../integrations/supabase/previewAuthStorage';
import { selectSupabaseUrl } from './supabase-proxy';

function connectedClient() {
  const directUrl = import.meta.env.VITE_SUPABASE_URL;
  // Lazy access: no browser globals at module evaluation or SSR rendering.
  if (typeof window === 'undefined') return managedSupabase;
  const url = selectSupabaseUrl(directUrl, import.meta.env.PROD, window.location.origin);
  if (url === directUrl) return managedSupabase;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const client = createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
        if (key.startsWith('sb_publishable_') && headers.get('authorization') === `Bearer ${key}`) headers.delete('authorization');
        headers.set('apikey', key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: {
      // Keep existing sessions across the URL change and OAuth callback handling.
      storageKey: `sb-${new URL(directUrl).hostname.split('.')[0]}-auth-token`,
      storage: brokeredPreviewStorage(), persistSession: true, autoRefreshToken: true,
    },
  });
  // Realtime isn't an HTTP proxy endpoint. Keep its public, independent transport
  // direct; connection failure cannot prevent Auth/REST requests via the proxy.
  const realtimeUrl = new URL('realtime/v1', directUrl.replace(/\/+$/, '') + '/');
  realtimeUrl.protocol = realtimeUrl.protocol.replace('http', 'ws');
  client.realtime = new RealtimeClient(realtimeUrl.href, {
    params: { apikey: key },
    accessToken: async () => (await client.auth.getSession()).data.session?.access_token ?? null,
  });
  return client;
}

let client: ReturnType<typeof connectedClient> | undefined;
export const supabase = new Proxy({} as ReturnType<typeof connectedClient>, {
  get(_, property, receiver) {
    client ??= connectedClient();
    return Reflect.get(client, property, receiver);
  },
});