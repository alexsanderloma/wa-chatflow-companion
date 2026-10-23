import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProxyPath, proxyTarget, proxyHeaders, selectSupabaseUrl } from './supabase-proxy.ts';
import { handleSupabaseProxy } from './supabase-proxy.server.ts';

test('only Auth REST storage and functions v1 paths are allowed', () => {
  for (const service of ['auth', 'rest', 'storage', 'functions']) assert.equal(canonicalProxyPath(`/${service}/v1/test`), `/${service}/v1/test`);
  for (const path of ['/realtime/v1/test', '/admin/test', '/auth/v2/test', '/rest/v1evil/test']) assert.throws(() => canonicalProxyPath(path));
});

test('blocks SSRF, full URLs, traversal and ambiguous encodings', () => {
  for (const path of ['https://evil.test/auth/v1/test', '//evil.test/auth/v1/test', '/auth/v1/../admin', '/auth/v1/./health', '/auth/v1/%2e%2e/admin', '/auth/v1/%252e%252e/admin', '/auth/v1/%2fadmin', '/auth/v1/%5cadmin', '/auth/v1/\\admin', '/auth/v1/%00', '/auth/v1/%zz', '/auth/v1//admin']) assert.throws(() => canonicalProxyPath(path), path);
  assert.throws(() => proxyTarget('https://flowa.store/api/supabase-proxy/auth/v1/../admin', 'https://backend.test'));
});

test('preserves canonical path and exact query; upstream is never selected by query', () => {
  const query = '?select=id&name=eq.a%20b&redirect_to=https%3A%2F%2Fevil.test';
  assert.equal(proxyTarget(`https://flowa.store/api/supabase-proxy/rest/v1/items${query}`, 'https://backend.test').href, `https://backend.test/rest/v1/items${query}`);
  assert.throws(() => proxyTarget('https://flowa.store/api/supabase-proxy/auth/v1/health', 'https://user:pass@backend.test'));
});

test('production live browser uses proxy; preview, development and SSR stay direct', () => {
  const direct = 'https://backend.test';
  assert.equal(selectSupabaseUrl(direct, true, 'https://flowa.store'), 'https://flowa.store/api/supabase-proxy');
  assert.equal(selectSupabaseUrl(direct, true, 'https://www.flowa.store'), 'https://www.flowa.store/api/supabase-proxy');
  for (const origin of ['https://id-preview--123.lovable.app', 'http://localhost:8080', 'https://flowa.store.evil.test']) assert.equal(selectSupabaseUrl(direct, true, origin), direct);
  assert.equal(selectSupabaseUrl(direct, false, 'https://flowa.store'), direct);
  assert.equal(selectSupabaseUrl(direct, true), direct);
});

test('preserves caller credentials and RLS headers but never cookies or hop headers', () => {
  const headers = proxyHeaders(new Headers({ apikey: 'public-test', authorization: 'Bearer user-test', cookie: 'internal=test', connection: 'Prefer', prefer: 'return=representation', range: '0-9', 'content-profile': 'public', 'x-secret': 'private', 'content-type': 'application/json' }));
  assert.equal(headers.get('apikey'), 'public-test');
  assert.equal(headers.get('authorization'), 'Bearer user-test');
  assert.equal(headers.get('range'), '0-9');
  assert.equal(headers.get('content-profile'), 'public');
  for (const name of ['cookie', 'connection', 'prefer', 'x-secret']) assert.equal(headers.get(name), null);
  const response = proxyHeaders(new Headers({ 'set-cookie': 'private', 'content-range': '0-9/10', 'content-encoding': 'gzip' }), true);
  assert.equal(response.get('content-range'), '0-9/10');
  assert.equal(response.get('set-cookie'), null);
  assert.equal(response.get('content-encoding'), null);
  assert.equal(response.get('cache-control'), 'no-store');
});

test('handler forwards method/body/query without privileged injection and preserves denial', async () => {
  const prior = process.env.SUPABASE_URL;
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://backend.test';
  try {
    globalThis.fetch = async (target, init) => {
      assert.equal(target.href, 'https://backend.test/rest/v1/items?select=id');
      assert.equal(init.method, 'PATCH');
      assert.equal(await new Response(init.body).text(), '{}');
      assert.equal(init.headers.get('authorization'), 'Bearer user-test');
      assert.equal(init.headers.get('cookie'), null);
      assert.equal(init.redirect, 'manual');
      return new Response('{"error":"denied"}', { status: 403 });
    };
    const response = await handleSupabaseProxy(new Request('https://flowa.store/api/supabase-proxy/rest/v1/items?select=id', { method: 'PATCH', body: '{}', headers: { authorization: 'Bearer user-test', cookie: 'internal=test' } }));
    assert.equal(response.status, 403);
    assert.equal(await response.text(), '{"error":"denied"}');
    globalThis.fetch = async () => { throw new Error('must not fetch'); };
    assert.equal((await handleSupabaseProxy(new Request('https://flowa.store/api/supabase-proxy/auth/v1/health', { method: 'OPTIONS' }))).status, 204);
    assert.equal((await handleSupabaseProxy(new Request('https://flowa.store/api/supabase-proxy/realtime/v1/websocket'))).status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (prior === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prior;
  }
});