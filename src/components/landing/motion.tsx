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
 * The same answer, safe to read during render.
 *
 * Calling `prefersReducedMotion()` directly in a component body is a hydration
 * bug: the server has no matchMedia and returns false, so it renders the
 * animated `style` prop, while a client that prefers reduced motion renders no
 * style at all. React logs a mismatch and — worse — keeps whichever tree it
 * decided on, so the setting can end up ignored on the very machines that
 * asked for it.
 *
 * So: false on the first render, matching the server exactly, then the real
 * answer from an effect. One frame of the animated start state is the cost,
 * and since these components also start hidden until they scroll into view,
 * that frame is not visible anyway.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    // Someone can flip the OS setting with the page open.
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
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

/*
 * `useDrawPath` lived here — an SVG stroke-dashoffset reveal — and nothing
 * ever called it. The obvious home was the lifecycle's connecting line, but
 * that line is not a scroll reveal: it fills to chase the active stage, which
 * is the claim the section is making. Drawing it once on entry would replace a
 * meaningful animation with a decorative one. Deleted rather than given a use
 * it does not have.
 */
