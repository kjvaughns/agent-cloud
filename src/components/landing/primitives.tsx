import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { track, type LandingEvent } from "@/lib/landing-analytics";

export const display = { fontFamily: "var(--font-display)" } as const;

/** Section wrapper that fires a view event the first time it scrolls in. */
export function LandingSection({
  id, event, className, children,
}: {
  id?: string;
  event?: LandingEvent;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!event || !ref.current || fired.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !fired.current) {
            fired.current = true;
            track(event);
            io.disconnect();
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [event]);

  return (
    <section id={id} ref={ref} className={cn("py-20 md:py-24", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function SectionHead({
  eyebrow, title, copy, align = "center",
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" ? "mx-auto text-center" : "")}>
      {eyebrow && (
        <p className="text-xs uppercase tracking-[0.24em] text-primary font-semibold">{eyebrow}</p>
      )}
      <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight text-foreground" style={display}>
        {title}
      </h2>
      {copy && <p className="mt-4 text-muted-foreground leading-relaxed">{copy}</p>}
    </div>
  );
}

/** Availability label. The status is data, never decoration. */
export function StatusPill({ status }: { status: "available" | "beta" | "soon" }) {
  const map = {
    available: { label: "Available", cls: "bg-success/15 text-success border-success/30" },
    beta: { label: "Beta", cls: "bg-warning/15 text-warning border-warning/30" },
    soon: { label: "Coming soon", cls: "bg-muted text-muted-foreground border-border" },
  } as const;
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", s.cls)}>
      {s.label}
    </span>
  );
}

/** Reveal-on-scroll. Respects prefers-reduced-motion. */
export function FadeUp({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("transition-all duration-700 ease-out", className)}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(14px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
