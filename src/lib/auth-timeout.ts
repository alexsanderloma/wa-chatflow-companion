export const AUTH_TIMEOUT_MS = 12_000;

export class AuthTimeoutError extends Error {
  constructor() { super("auth_timeout"); this.name = "AuthTimeoutError"; }
}

/** Rejects with AuthTimeoutError if the operation does not settle within `ms`. */
export function withTimeout<T>(op: PromiseLike<T>, ms: number = AUTH_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AuthTimeoutError()), ms); });
  return Promise.race([Promise.resolve(op), timeout]).finally(() => clearTimeout(timer));
}

export interface PostAuthLookup {
  isSuperAdmin(): Promise<boolean>;
  hasCompany(): Promise<boolean>;
}

/** Destination after a confirmed login; lookup failures/timeouts fall back to the dashboard. */
export async function resolvePostAuthDestination(plano: string | undefined, lookup: PostAuthLookup, ms: number = AUTH_TIMEOUT_MS): Promise<string> {
  if (plano) return `/app/checkout?plano=${encodeURIComponent(plano)}`;
  try {
    if (await withTimeout(lookup.isSuperAdmin(), ms)) return "/master/painel";
    return (await withTimeout(lookup.hasCompany(), ms)) ? "/app/dashboard" : "/app/checkout";
  } catch {
    return "/app/dashboard";
  }
}
