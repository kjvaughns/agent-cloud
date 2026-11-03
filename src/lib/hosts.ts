/**
 * Host split: useagentcloud.com / www = public marketing site,
 * app.useagentcloud.com = signed-in portal.
 *
 * Turn APP_SUBDOMAIN_ENABLED on only once app.useagentcloud.com shows Active
 * in Project Settings → Domains; before that, forwarding would break sign-in.
 */
export const APP_SUBDOMAIN_ENABLED = false;
export const APP_HOST = "app.useagentcloud.com";
export const APP_ORIGIN = `https://${APP_HOST}`;
const MARKETING_HOSTS = new Set(["useagentcloud.com", "www.useagentcloud.com"]);

const stripPort = (h: string) => h.toLowerCase().split(":")[0];
export const isMarketingHost = (h: string) => MARKETING_HOSTS.has(stripPort(h));
export const isAppHost = (h: string) => stripPort(h) === APP_HOST;

/** Paths that stay on the marketing host; everything else belongs to the portal. */
export function isMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (/\.[a-z0-9]+$/i.test(pathname)) return true; // static files
  const exact = ["/privacy", "/terms", "/cookies", "/demo"];
  if (exact.includes(pathname)) return true;
  const prefixes = ["/api/", "/lovable/", "/email/", "/_serverFn", "/assets/", "/myagent/", "/agent/", "/join/", "/@"];
  return prefixes.some((p) => pathname.startsWith(p));
}

/** Where a request should be forwarded, or null to serve it as-is. */
export function hostRedirectTarget(url: URL, enabled = APP_SUBDOMAIN_ENABLED): string | null {
  if (!enabled) return null;
  if (isMarketingHost(url.host) && !isMarketingPath(url.pathname)) {
    return `${APP_ORIGIN}${url.pathname}${url.search}`;
  }
  if (isAppHost(url.host) && url.pathname === "/") {
    return `${APP_ORIGIN}/dashboard${url.search}`;
  }
  return null;
}

/** Absolute link to a portal page (sign-in, invites). */
export function appUrl(path: string, enabled = APP_SUBDOMAIN_ENABLED): string {
  if (enabled) return `${APP_ORIGIN}${path}`;
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}
