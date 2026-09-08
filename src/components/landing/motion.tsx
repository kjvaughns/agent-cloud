import { useEffect, useRef, useState } from "react";

/**
 * Motion helpers for the marketing page.
 *
 * ── The rule these were rewritten around ──
 *
 * Animation may never be the reason content is missing. The old versions
 * broke that rule twice on the live page: the hero dashboard sat at $0 because
 * the count-up never started, and several sections rendered as blank screens
 * because their reveal never fired. A visitor cannot tell a stuck animation
 * from an empty product.
 *
 * So both hooks below carry a timer that finishes the job regardless of
 * whether the observer ever fires: `useInView` reveals after 900ms even if no
 * intersection is reported, and `useCountUp` snaps to the final value once the
 * duration has elapsed. Worst case the animation is skipped. The value is
 * always on screen.
 *
 * The floating orbs and the scroll parallax that used to live here were
 * deleted — no page called them, and they were shipping in the bundle.
 */

/** True once the element has been seen, or after a short grace period. */
export function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      setInView(true);
    };

    // The safety net. If IntersectionObserver is unavailable, throttled, or
    // the element never crosses the threshold, the content still appears.
    const timer = window.setTimeout(show, 900);

    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return () => window.clearTimeout(timer);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            show();
            io.disconnect();
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);

    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [threshold]);

  return { ref, inView };
}

/**
 * The reduced-motion setting, safe to read during render.
 *
 * False on the first render so the server and client agree, then the real
 * answer from an effect.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * Counts up to `value` once `start` is true — and lands on `value` either way.
 *
 * Reduced motion, a missing rAF, a backgrounded tab: all of them end with the
 * real number rendered, because a marketing page that reports $0 production is
 * worse than one with no animation at all.
 */
export function useCountUp(value: number, duration = 1200, start = false) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!start) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof requestAnimationFrame === "undefined") {
      setN(value);
      return;
    }

    let raf = 0;
    let t0: number | null = null;
    const tick = (t: number) => {
      if (t0 === null) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      setN(value * (1 - Math.pow(1 - p, 3))); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Whatever happened to the frames, the figure is correct after this.
    const settle = window.setTimeout(() => setN(value), duration + 250);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [value, duration, start]);

  return n;
}
