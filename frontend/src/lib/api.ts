/**
 * Thin fetch wrapper for the Meme'd API.
 *
 * - Auth lives in HttpOnly cookies; this code never sees or stores tokens.
 * - Unsafe requests carry the double-submit CSRF token (memed_csrf cookie).
 * - An expired access token triggers ONE shared refresh, then the request is retried.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field-level messages from a 422, keyed by dotted path. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as { path?: string; message?: string }[]) {
        if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
      }
    }
    return out;
  }
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const NO_REFRESH = ["/auth/login", "/auth/signup", "/auth/refresh", "/auth/csrf", "/auth/session"];

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;
async function csrfToken(): Promise<string> {
  const existing = readCookie("memed_csrf");
  if (existing) return existing;
  csrfPromise ??= fetch(`${API_BASE}/auth/csrf`, { credentials: "include" })
    .then((r) => r.json() as Promise<ApiEnvelope<{ csrfToken: string }>>)
    .then((b) => b.data.csrfToken)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

let refreshPromise: Promise<boolean> | null = null;
/** Single-flight refresh so parallel 401s don't each rotate the refresh token. */
export function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const token = await csrfToken();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": token },
        });
        if (res.ok) return true;
        // Another tab rotated the token a moment ago; its new cookie is already ours.
        if (res.status === 409) {
          await new Promise((r) => setTimeout(r, 300));
          return true;
        }
        if (res.status !== 429) return false;
      }
      return false;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();
  return refreshPromise;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return `${API_BASE}${path}${s ? `?${s}` : ""}`;
}

async function send<T>(path: string, opts: RequestOptions, retried: boolean): Promise<ApiEnvelope<T>> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (UNSAFE.has(method)) headers["X-CSRF-Token"] = await csrfToken();

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: "include",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach Meme'd right now. Check your connection and try again.");
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (res.ok) return body as ApiEnvelope<T>;

  const err = (body as { error?: { code?: string; message?: string; details?: unknown }; requestId?: string } | null) ?? {};
  const code = err.error?.code ?? "HTTP_ERROR";

  if (res.status === 401 && !retried && !NO_REFRESH.some((p) => path.startsWith(p))) {
    if (await refreshSession()) return send<T>(path, opts, true);
  }
  if (res.status === 403 && code === "CSRF_TOKEN_INVALID" && !retried) {
    // Cookie may have rotated in another tab; fetch a fresh one and retry once.
    document.cookie = "memed_csrf=; Max-Age=0; path=/";
    return send<T>(path, opts, true);
  }

  throw new ApiError(
    res.status,
    code,
    err.error?.message ?? (res.status >= 500 ? "Something went wrong on our side. Please try again." : "The request could not be completed."),
    err.error?.details,
    err.requestId,
  );
}

export function api<T>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  return send<T>(path, opts, false);
}

/** Convenience: returns only `data`. */
export async function apiData<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await api<T>(path, opts)).data;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
