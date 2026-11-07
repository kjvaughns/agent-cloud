// Browser-safe setup wizard rules, shared by the wizard UI and server.
export const SETUP_STEPS = [
  { key: "agency", title: "Your agency" },
  { key: "carriers", title: "Carriers & book" },
  { key: "team", title: "Your team" },
  { key: "suite", title: "Agency Suite" },
] as const;

export function partnerCodeFor(slug: string): string {
  const base = slug.replace(/-[a-z0-9]{6}$/, "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12);
  return base || "AGENCY";
}

export function suiteLinks(code: string) {
  return {
    partnerCode: code,
    recruitLink: `https://getlicensed.useagentcloud.com/?partner=${encodeURIComponent(code)}`,
    academy: "https://academy.useagentcloud.com",
    bankdocs: "https://bankdocs.useagentcloud.com",
    releaseCenter: "https://release.useagentcloud.com",
  };
}

/** Owners who haven't finished setup get sent to it, except on pages they need to get there. */
export function shouldRedirectToSetup(needsSetup: boolean, pathname: string): boolean {
  if (!needsSetup) return false;
  return !["/setup", "/settings/billing", "/import", "/carrier-sync", "/team"].some((p) => pathname.startsWith(p));
}

/** Help video key for a page, or null. */
export function helpVideoKey(pathname: string): string | null {
  const map: [string, string][] = [
    ["/post-deal", "post-deal"], ["/pipeline", "pipeline"], ["/book-of-business", "book"],
    ["/carrier-sync", "carrier-sync"], ["/settings/levels", "hierarchy"], ["/agency", "hierarchy"],
    ["/contracting", "contracting"], ["/leaderboard", "trophy-case"],
  ];
  return map.find(([p]) => pathname.startsWith(p))?.[1] ?? null;
}
