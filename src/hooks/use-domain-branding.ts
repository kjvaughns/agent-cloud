import { useEffect, useState } from "react";

export type DomainBranding = {
  name: string | null;
  logo_url: string | null;
  accent_color: string | null;
  tagline: string | null;
};

/**
 * White-label branding for the current hostname.
 *
 * Sign-in and signup run before any session exists, so the hostname is the
 * only signal available. Returns null on the canonical domain, on an unknown
 * domain, and on any failure — callers fall back to Agent Cloud branding.
 */
export function useDomainBranding(): DomainBranding | null {
  const [brand, setBrand] = useState<DomainBranding | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DomainBranding | null) => {
        if (cancelled || !d) return;
        // The endpoint returns an all-null shape for hosts with no white-label
        // org; treat that as "no branding" rather than an empty agency.
        if (d.name || d.logo_url) setBrand(d);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return brand;
}
