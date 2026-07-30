/**
 * Landing page analytics.
 *
 * No provider is wired yet, so this is a single funnel-through point rather
 * than calls scattered across twenty components. When a provider is chosen,
 * it is implemented once, here.
 *
 * Deliberately takes no PII — event name and coarse properties only.
 */

export type LandingEvent =
  | "hero_cta_clicked"
  | "nav_cta_clicked"
  | "pricing_viewed"
  | "plan_selected"
  | "nova_viewed"
  | "demo_form_started"
  | "demo_form_submitted"
  | "signup_started"
  | "faq_opened"
  | "integration_clicked"
  | "screenshot_viewed"
  | "role_tab_viewed"
  | "lifecycle_viewed"
  | "tour_viewed"
  | "tour_screen_viewed";

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Record<string, string | number | boolean> }) => void;
    posthog?: { capture: (event: string, props?: Record<string, unknown>) => void };
  }
}

export function track(event: LandingEvent, props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  try {
    // Whichever provider is present picks it up; absent both, this is a no-op
    // rather than an error in the console on every click.
    window.plausible?.(event, props ? { props } : undefined);
    window.posthog?.capture(event, props);
  } catch {
    // Analytics must never break the page.
  }
}

/** Fire once when a section first scrolls into view. */
export function useTrackOnView(event: LandingEvent, ref: React.RefObject<HTMLElement | null>) {
  if (typeof window === "undefined") return;
  // Implemented by the caller's useEffect; kept here so the event list stays
  // in one file. See LandingSection for the observer.
  void event; void ref;
}
