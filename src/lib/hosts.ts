/**
 * Marketing pages live on useagentcloud.com; the signed-in product (and
 * every account flow: login, signup builder, invites) lives on
 * app.useagentcloud.com. Sessions are per-host, so account creation must
 * happen on the app host too.
 */
export const MARKETING_HOST = "useagentcloud.com";
export const APP_HOST = "app.useagentcloud.com";
export const MARKETING_ORIGIN = `https://${MARKETING_HOST}`;
/** Absolute origin for links in emails (they point into the product). */
export const APP_ORIGIN = `https://${APP_HOST}`;

const PRODUCTION_HOSTS = new Set([MARKETING_HOST, `www.${MARKETING_HOST}`, APP_HOST]);

const MARKETING_PATHS = ["/", "/tools", "/privacy", "/terms", "/cookies", "/demo"];
const MARKETING_PREFIXES = ["/agent/", "/myagent/", "/email/"];

export function isMarketingPath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return MARKETING_PATHS.includes(p) || MARKETING_PREFIXES.some((x) => p.startsWith(x));
}

/** Returns the absolute URL to move to, or null to stay. Only acts on production hosts. */
export function hostRedirectTarget(host: string, pathname: string, rest: string): string | null {
  if (!PRODUCTION_HOSTS.has(host)) return null;
  const onApp = host === APP_HOST;
  if (onApp) {
    if (pathname === "/" || pathname === "") return `${APP_ORIGIN}/dashboard`;
    if (isMarketingPath(pathname)) return `${MARKETING_ORIGIN}${pathname}${rest}`;
    return null;
  }
  if (isMarketingPath(pathname)) return null;
  return `${APP_ORIGIN}${pathname}${rest}`;
}
