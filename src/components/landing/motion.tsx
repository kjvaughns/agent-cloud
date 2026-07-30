import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** True once the element has been on screen. Used to start animations. */
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, inView };
}

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Counts up to `value` once visible.
 *
 * Eases out so the number decelerates into place instead of ticking linearly,
 * and snaps straight to the final value when the visitor prefers reduced
 * motion — a counting number is decoration, not information.
 */
export function useCountUp(value: number, duration = 1200, start = false) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion()) { setN(value); return; }

    let raf = 0;
    let t0: number | null = null;
    const tick = (t: number) => {
      if (t0 === null) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      // easeOutCubic
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, start]);

  return n;
}

/**
 * Ambient floating orbs behind a section.
 *
 * Purely decorative, so it is aria-hidden, pointer-events-none, and disabled
 * entirely under reduced-motion.
 */
export function FloatingOrbs({ className }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(!prefersReducedMotion()); }, []);
  if (!on) return null;

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      <span className="ac-orb ac-orb-1" />
      <span className="ac-orb ac-orb-2" />
      <span className="ac-orb ac-orb-3" />
    </div>
  );
}

/** Subtle parallax on scroll. Skipped under reduced motion. */
export function Parallax({
  children, strength = 18, className,
}: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        // -1 .. 1 across the viewport
        const p = (r.top + r.height / 2 - vh / 2) / vh;
        setOffset(Math.max(-1, Math.min(1, p)) * strength);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [strength]);

  return (
    <div ref={ref} className={className} style={{ transform: `translate3d(0, ${offset}px, 0)` }}>
      {children}
    </div>
  );
}

/** Draws an SVG path on first view. */
export function useDrawPath(inView: boolean, duration = 1400) {
  const ref = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = String(len);

    if (!inView) { el.style.strokeDashoffset = String(len); return; }
    if (prefersReducedMotion()) { el.style.strokeDashoffset = "0"; return; }

    el.style.strokeDashoffset = String(len);
    el.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.22,.61,.36,1)`;
    // Next frame, so the transition has a from-value to animate from.
    const id = requestAnimationFrame(() => { el.style.strokeDashoffset = "0"; });
    return () => cancelAnimationFrame(id);
  }, [inView, duration]);

  return ref;
}
