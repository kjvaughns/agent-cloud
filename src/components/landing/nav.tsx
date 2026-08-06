import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing-analytics";
import { display } from "./primitives";

/**
 * Four, and every one of them lands somewhere.
 *
 * Two of the six pointed at sections that no longer exist — `#platform` at the
 * module map and `#roles` at the role tabs — and `#tour` at the screen gallery
 * that the feature bands replaced. A nav link that scrolls nowhere is worse
 * than a missing one: the visitor concludes the page is broken, on the one
 * click they chose to spend.
 */
const LINKS = [
  { label: "Product", href: "#features" },
  { label: "Live demo", href: "#demo" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function AnnouncementBar() {
  const [hidden, setHidden] = useState(true);

  // Read the dismissal before first paint of the bar, so it does not flash in
  // and then disappear for someone who already closed it.
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("ac-announce-dismissed") === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  return (
    <div className="relative border-b border-border/60 bg-primary/[0.07]">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-10 py-2 text-center text-xs sm:text-sm">
        <span className="text-muted-foreground">
          Agent Cloud is now accepting founding agencies.
        </span>
        <a href="#features" className="font-semibold text-primary hover:underline whitespace-nowrap">
          See the product →
        </a>
      </div>
      <button
        onClick={() => {
          setHidden(true);
          try { localStorage.setItem("ac-announce-dismissed", "1"); } catch { /* private mode */ }
        }}
        aria-label="Dismiss announcement"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function LandingNav({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  const [open, setOpen] = useState(false);

  // Lock the page behind the drawer, and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cta = (
    <Link to={ctaHref} onClick={() => track("nav_cta_clicked", { label: ctaLabel })}>
      <Button size="sm">
        {ctaLabel} <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    </Link>
  );

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Agent Cloud home">
          <BrandLogo size={34} />
          <div className="flex flex-col leading-none">
            <span className="text-lg sm:text-xl font-bold tracking-[0.14em] text-foreground" style={display}>
              AGENT CLOUD
            </span>
            <span className="hidden sm:block text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Insurance OS
            </span>
          </div>
        </a>

        <nav className="hidden lg:flex items-center gap-7 text-sm text-muted-foreground">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2"
          >
            Sign in
          </Link>
          <div className="hidden sm:block">{cta}</div>

          {/* Mobile: the previous nav was hidden below md with no drawer, so
              every section link was unreachable on a phone. */}
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>

    {/* Rendered as a sibling of <header>, never inside it.
        The header sets backdrop-blur, and a backdrop-filter creates a
        containing block for fixed-position descendants — so inside it,
        `fixed inset-0` sized to the 64px header instead of the viewport,
        leaving the menu unpainted below that strip. It also formed a
        stacking context that trapped this z-index below the sticky CTA. */}
    {open && (
      <div
        className="lg:hidden fixed inset-0 z-[60] overflow-y-auto bg-background"
        role="dialog" aria-modal="true" aria-label="Menu"
      >
          <div className="sticky top-0 flex h-16 items-center justify-between border-b border-border/60 bg-background px-4">
            <span className="font-bold tracking-[0.14em]" style={display}>MENU</span>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col p-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "border-b border-border-soft py-4 text-lg font-medium text-foreground",
                  "hover:text-primary transition-colors",
                )}
              >
                {l.label}
              </a>
            ))}
            <Link to="/login" onClick={() => setOpen(false)} className="py-4 text-lg font-medium text-muted-foreground">
              Sign in
            </Link>
            <Link to={ctaHref} onClick={() => { setOpen(false); track("nav_cta_clicked", { label: ctaLabel, surface: "mobile" }); }} className="mt-4">
              <Button className="w-full h-12 text-base">{ctaLabel}</Button>
            </Link>
          </nav>
      </div>
    )}
    </>
  );
}

/** Appears once the hero scrolls away, so the primary action is never lost. */
export function StickyMobileCta({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur p-3",
        "transition-transform duration-300",
        show ? "translate-y-0" : "translate-y-full",
      )}
    >
      <Link to={ctaHref} onClick={() => track("hero_cta_clicked", { surface: "sticky" })}>
        <Button className="w-full h-12 text-base">{ctaLabel}</Button>
      </Link>
    </div>
  );
}
