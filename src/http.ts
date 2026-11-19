/**
 * Shared HTTP layer for every CMU source: one generic User-Agent, a 25 s timeout,
 * one retry, at most two requests in flight per host, and in-memory TTL caches.
 * Nothing fetched is ever written to disk.
 */

export const USER_AGENT = "Mozilla/5.0 (compatible; cmu-soc-mcp/1.0)";
const TIMEOUT_MS = 25_000;
const MAX_PER_HOST = 2;

/** Minimal in-memory cache with per-entry expiry. The clock is injectable for tests. */
export class TtlCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  constructor(private now: () => number = Date.now) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expires) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.entries.set(key, { value, expires: this.now() + ttlMs });
  }
}

/** Per-host semaphore so a burst of tool calls never puts more than two requests on CMU at once. */
const inFlight = new Map<string, number>();
const waiters = new Map<string, (() => void)[]>();

async function acquire(host: string): Promise<void> {
  if ((inFlight.get(host) ?? 0) < MAX_PER_HOST) {
    inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
    return;
  }
  await new Promise<void>((resolve) => {
    const queue = waiters.get(host) ?? [];
    queue.push(resolve);
    waiters.set(host, queue);
  });
}

function release(host: string): void {
  const next = waiters.get(host)?.shift();
  if (next) next(); // hand the slot straight to the next waiter
  else inFlight.set(host, Math.max(0, (inFlight.get(host) ?? 1) - 1));
}

export interface FetchOptions {
  method?: "GET" | "POST";
  /** Form fields, sent as application/x-www-form-urlencoded (implies POST). */
  form?: Record<string, string>;
  /** Cache the response for this long. Omit to skip caching. */
  ttlMs?: number;
  /** Retry once on network errors and 5xx. Default true. */
  retry?: boolean;
}

export interface FetchResult {
  status: number;
  body: string;
}

const textCache = new TtlCache<FetchResult>();
const bytesCache = new TtlCache<Uint8Array>();

async function request(url: URL, init: RequestInit, retry: boolean): Promise<Response> {
  let lastError: unknown;
  const attempts = retry ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    await acquire(url.host);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status >= 500 && attempt < attempts - 1) {
        lastError = new Error(`HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => undefined);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
      release(url.host);
    }
  }
  throw new Error(`Could not reach ${url.host}${url.pathname}: ${String(lastError)}`);
}

/**
 * Fetch a page as text. Non-2xx responses are returned (not thrown) so callers
 * can turn a status into a meaningful message; network failures throw.
 */
export async function fetchText(url: string | URL, opts: FetchOptions = {}): Promise<FetchResult> {
  const u = new URL(url);
  const body = opts.form ? new URLSearchParams(opts.form).toString() : undefined;
  const method = opts.form ? "POST" : (opts.method ?? "GET");
  const key = `${method} ${u.href} ${body ?? ""}`;
  if (opts.ttlMs) {
    const hit = textCache.get(key);
    if (hit) return hit;
  }
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  const res = await request(u, { method, headers, body }, opts.retry ?? true);
  const result = { status: res.status, body: await res.text() };
  if (opts.ttlMs && res.ok) textCache.set(key, result, opts.ttlMs);
  return result;
}

/** Fetch a binary document (the final-exam PDFs). Throws on non-2xx. */
export async function fetchBytes(url: string, ttlMs: number): Promise<Uint8Array> {
  const hit = bytesCache.get(url);
  if (hit) return hit;
  const res = await request(new URL(url), { headers: { "User-Agent": USER_AGENT } }, true);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  bytesCache.set(url, bytes, ttlMs);
  return bytes;
}

export const HOUR = 60 * 60 * 1000;
