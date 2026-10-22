// Shared HTTP helpers for Stuora Edge Functions. Folders starting with "_"
// are never deployed as functions by the Supabase CLI.
//
// Security rules every function follows:
//  * Identity comes ONLY from Auth.getUser(<bearer token>), never from the body.
//  * Browsers may call only from configured origins (STUORA_ALLOWED_WEB_ORIGINS,
//    comma-separated exact origins). Requests without an Origin header (native
//    apps, server-to-server) are allowed because they still need a valid JWT.
//  * Error bodies never echo tokens, user ids, provider keys or raw provider errors.

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function allowedOrigins(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map(v => v.trim())
    .filter(v => /^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/.test(v) || /^http:\/\/(localhost|127\.0\.0\.1):[0-9]{2,5}$/.test(v)));
}

export function corsHeaders(origin: string | null, allowed: Set<string>, methods = "POST, OPTIONS"): Record<string, string> {
  const headers: Record<string, string> = { "Vary": "Origin" };
  if (origin && allowed.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    headers["Access-Control-Allow-Methods"] = methods;
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

/** Returns a response for OPTIONS / forbidden origins, or null to continue. */
export function preflight(req: Request, allowed: Set<string>, methods = "POST, OPTIONS"): Response | null {
  const origin = req.headers.get("Origin");
  if (origin && !allowed.has(origin)) return json(403, { code: "ORIGIN", error: "Unapproved origin" }, { "Vary": "Origin" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, allowed, methods) });
  return null;
}

export function bearer(req: Request): string {
  const match = /^Bearer (\S{20,8192})$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) throw new HttpError(401, "AUTH", "Authentication required");
  return match[1];
}

/** Reads a JSON body of at most `limit` bytes. */
export async function readJson(req: Request, limit = 4096): Promise<Record<string, unknown>> {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) throw new HttpError(415, "BODY", "JSON body required");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > limit) throw new HttpError(413, "BODY", "Request too large");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > limit) throw new HttpError(413, "BODY", "Request too large");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "BODY", "Invalid JSON body");
  }
}

/** fetch with a hard timeout; never throws provider bodies upward. */
export async function fetchWithTimeout(fetcher: typeof fetch, url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetcher(url, { ...init, signal: controller.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
}

/** Plain text from untrusted provider strings: no tags, no control chars, bounded. */
export function cleanText(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, m => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" } as Record<string, string>)[m] ?? " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Only absolute https URLs survive; optional host allow-list. */
export function safeUrl(value: unknown, hosts?: RegExp): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (hosts && !hosts.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
