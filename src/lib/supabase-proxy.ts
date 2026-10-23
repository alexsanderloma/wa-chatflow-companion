export const PROXY_PREFIX = '/api/supabase-proxy';
const PATH_ALLOWLIST = /^\/(auth|rest|storage|functions)\/v1\/[^?#]*$/;

/** Reject ambiguous encodings before URL normalization can conceal traversal. */
export function canonicalProxyPath(path: string): string {
  if (!path.startsWith('/') || path.includes('//') || /[\\\u0000-\u0020?#]/.test(path)) throw new Error('Invalid proxy path');
  if (/%(?![0-9a-f]{2})/i.test(path) || /%(?:2e|2f|5c|25|00|0[ad])/i.test(path)) throw new Error('Invalid proxy encoding');
  const decoded = decodeURIComponent(path);
  if (decoded.split('/').some(segment => segment === '.' || segment === '..') || /[\\\u0000-\u0020]/.test(decoded)) throw new Error('Invalid proxy path');
  if (!PATH_ALLOWLIST.test(path)) throw new Error('Path not allowed');
  return path;
}

export function proxyTarget(requestUrl: string, upstream: string): URL {
  // Examine the raw path first (new URL otherwise removes dot segments).
  const rawPath = requestUrl.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, '').split('?')[0];
  if (!rawPath.startsWith(`${PROXY_PREFIX}/`)) throw new Error('Invalid proxy path');
  const path = canonicalProxyPath(rawPath.slice(PROXY_PREFIX.length));
  const base = new URL(upstream);
  // The host is configuration-owned, never supplied by the caller. Local HTTP
  // is permitted only for the platform's sandbox-local backend.
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', 'supabase-kong'].includes(base.hostname)))) throw new Error('Invalid upstream');
  return new URL(base.origin + path + new URL(requestUrl).search);
}

export function selectSupabaseUrl(original: string, production: boolean, browserOrigin?: string): string {
  if (!production || !browserOrigin) return original;
  const origin = new URL(browserOrigin);
  // Explicit live host allowlist: production builds are also used for previews.
  return origin.protocol === 'https:' && ['flowa.store', 'www.flowa.store', 'wa-chatflow-companion.lovable.app'].includes(origin.hostname)
    ? origin.origin + PROXY_PREFIX : original;
}

const REQUEST_HEADERS = ['apikey', 'authorization', 'content-type', 'accept', 'range', 'range-unit', 'prefer', 'accept-profile', 'content-profile', 'x-client-info', 'x-supabase-api-version', 'if-match', 'if-none-match', 'if-modified-since', 'x-upsert'];
const RESPONSE_HEADERS = ['content-type', 'content-range', 'range-unit', 'accept-ranges', 'etag', 'last-modified', 'preference-applied', 'retry-after', 'www-authenticate', 'content-disposition'];

export function proxyHeaders(source: Headers, response = false): Headers {
  const headers = new Headers();
  const blocked = new Set((source.get('connection') ?? '').toLowerCase().split(',').map(s => s.trim()));
  for (const name of response ? RESPONSE_HEADERS : REQUEST_HEADERS) {
    const value = source.get(name);
    if (value !== null && !blocked.has(name)) headers.set(name, value);
  }
  if (response) headers.set('cache-control', 'no-store');
  return headers;
}