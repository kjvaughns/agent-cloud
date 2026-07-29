import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";

const supabaseAdmin = _admin as any;

/**
 * Rate limiting for the unauthenticated api/public/* endpoints.
 *
 * The counter lives in Postgres, not process memory: the app runs serverless,
 * so instances are short-lived and numerous and an in-memory limiter would
 * reset constantly without ever bounding anything.
 */

/** Best-effort client IP from the usual proxy headers. */
export function clientIp(request: Request): string {
  const h = request.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "unknown";
}

export type RateLimitOptions = {
  /** Logical name, e.g. "waitlist-signup". Combined with the identifier. */
  name: string;
  /** Usually the client IP, optionally narrowed further (e.g. by email). */
  identifier: string;
  max: number;
  windowSeconds: number;
};

/**
 * Returns true when the call is allowed.
 *
 * Fails **open** on an infrastructure error. A limiter that cannot reach the
 * database should not take down lead capture — the honeypot and zod validation
 * still apply, and an outage is the wrong moment to start rejecting real
 * customers.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: `${opts.name}:${opts.identifier}`,
      _max: opts.max,
      _window_seconds: opts.windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

export function tooManyRequests(extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again in a few minutes." }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "300", ...extraHeaders },
    },
  );
}

/**
 * Guard for a public write endpoint. Applies both a per-IP limit and a
 * global per-endpoint ceiling, so a distributed flood is bounded too.
 *
 * Returns a 429 Response when the caller should be rejected, else null.
 */
export async function guardPublicEndpoint(
  request: Request,
  name: string,
  opts: { perIp?: number; perIpWindow?: number; global?: number; globalWindow?: number; headers?: Record<string, string> } = {},
): Promise<Response | null> {
  const {
    perIp = 10,
    perIpWindow = 300,      // 10 per 5 minutes from one address
    global = 500,
    globalWindow = 300,     // 500 per 5 minutes across all callers
    headers = {},
  } = opts;

  const ip = clientIp(request);

  const [ipOk, globalOk] = await Promise.all([
    checkRateLimit({ name, identifier: ip, max: perIp, windowSeconds: perIpWindow }),
    checkRateLimit({ name, identifier: "__global__", max: global, windowSeconds: globalWindow }),
  ]);

  if (!ipOk || !globalOk) return tooManyRequests(headers);
  return null;
}
