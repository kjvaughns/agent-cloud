import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, animate } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Path = "agent" | "agency";

/** Slow drifting gold light behind every scene. */
export function Atmosphere() {
  const reduce = useReducedMotion();
  const orbs = [
    { s: 520, x: "-10%", y: "-15%", d: 18 },
    { s: 420, x: "70%", y: "10%", d: 22 },
    { s: 360, x: "30%", y: "70%", d: 26 },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {orbs.map((o, i) => (
        <motion.div key={i} className="absolute rounded-full bg-gold/20 blur-3xl"
          style={{ width: o.s, height: o.s, left: o.x, top: o.y }}
          animate={reduce ? undefined : { x: [0, 60, -40, 0], y: [0, -40, 30, 0], scale: [1, 1.1, 0.95, 1] }}
          transition={{ duration: o.d, repeat: Infinity, ease: "easeInOut" }} />
      ))}
      <Sparks />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--background)_100%)]" />
    </div>
  );
}

function Sparks() {
  const reduce = useReducedMotion();
  const [pts, setPts] = useState<{ x: number; y: number; d: number; s: number }[]>([]);
  useEffect(() => {
    setPts(Array.from({ length: 22 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, d: 6 + Math.random() * 8, s: 2 + Math.random() * 3 })));
  }, []);
  if (reduce) return null;
  return (
    <>
      {pts.map((p, i) => (
        <motion.span key={i} className="absolute rounded-full bg-gold"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s }}
          animate={{ y: [0, -80], opacity: [0, 0.8, 0] }}
          transition={{ duration: p.d, repeat: Infinity, delay: i * 0.4, ease: "easeOut" }} />
      ))}
    </>
  );
}

/** Staggered word-by-word headline reveal. */
export function RevealTitle({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <h1 className={cn("font-display font-semibold tracking-tight", className)} aria-label={text}>
      {words.map((w, i) => (
        <motion.span key={i + w} aria-hidden className="inline-block pr-[0.25em]"
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 0.06 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>{w}</motion.span>
      ))}
    </h1>
  );
}

/** Connected dots that light up as steps finish. */
export function Constellation({ steps, index }: { steps: string[]; index: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <motion.div className={cn("relative h-2.5 w-2.5 rounded-full", i <= index ? "bg-gold" : "bg-border")}
            animate={i === index ? { scale: [1, 1.5, 1] } : { scale: 1 }} transition={{ duration: 1.6, repeat: i === index ? Infinity : 0 }}>
            {i < index && <span className="absolute inset-0 rounded-full bg-gold/50 blur-[3px]" />}
          </motion.div>
          {i < steps.length - 1 && (
            <div className="h-px w-5 overflow-hidden bg-border sm:w-8">
              <motion.div className="h-full bg-gold" initial={false} animate={{ width: i < index ? "100%" : "0%" }} transition={{ duration: 0.6 }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Agent scene: policy cards stacking into a book. */
export function AgentScene({ active }: { active: boolean }) {
  const cards = ["Term Life · $82/mo", "Final Expense · $64/mo", "IUL · $210/mo", "Mortgage Protection · $96/mo"];
  return (
    <div className="relative mx-auto h-44 w-60">
      {cards.map((c, i) => (
        <motion.div key={c} className="absolute inset-x-0 rounded-xl border border-border bg-card px-4 py-3 text-left text-xs shadow-lg"
          style={{ top: i * 26 }}
          animate={active ? { opacity: [0, 1, 1, 0], y: [30, 0, 0, -10] } : { opacity: 1 - i * 0.2, y: 0 }}
          transition={active ? { duration: 4, repeat: Infinity, delay: i * 0.5, times: [0, 0.2, 0.85, 1] } : { duration: 0.4 }}>
          <div className="flex items-center justify-between"><span className="font-medium">{c}</span><Check className="h-3.5 w-3.5 text-gold" /></div>
        </motion.div>
      ))}
    </div>
  );
}

/** Agency scene: an org chart growing outward. */
export function AgencyScene({ active }: { active: boolean }) {
  const nodes = [
    { x: 50, y: 12, r: 18 },
    { x: 22, y: 50, r: 13 }, { x: 50, y: 50, r: 13 }, { x: 78, y: 50, r: 13 },
    { x: 10, y: 86, r: 9 }, { x: 30, y: 86, r: 9 }, { x: 50, y: 86, r: 9 }, { x: 70, y: 86, r: 9 }, { x: 90, y: 86, r: 9 },
  ];
  const links = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 6], [3, 7], [3, 8]];
  return (
    <svg viewBox="0 0 100 100" className="mx-auto h-44 w-60 overflow-visible">
      {links.map(([a, b], i) => (
        <motion.line key={i} x1={nodes[a]!.x} y1={nodes[a]!.y} x2={nodes[b]!.x} y2={nodes[b]!.y}
          className="stroke-gold" strokeWidth={0.6}
          initial={{ pathLength: 0 }} animate={{ pathLength: active ? [0, 1, 1] : 1 }}
          transition={{ duration: 3, delay: 0.2 * i, repeat: active ? Infinity : 0, repeatDelay: 1 }} />
      ))}
      {nodes.map((n, i) => (
        <motion.circle key={i} cx={n.x} cy={n.y} r={n.r / 2.2} className={i === 0 ? "fill-gold" : "fill-card stroke-gold"} strokeWidth={0.6}
          initial={{ scale: 0 }} animate={{ scale: active ? [0, 1, 1] : 1 }} style={{ transformOrigin: `${n.x}px ${n.y}px` }}
          transition={{ duration: 3, delay: 0.15 * i, repeat: active ? Infinity : 0, repeatDelay: 1 }} />
      ))}
    </svg>
  );
}

export function CountUp({ to, prefix = "", duration = 1.6 }: { to: number; prefix?: string; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, to, { duration, ease: "easeOut", onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to, duration]);
  return <>{prefix}{v.toLocaleString()}</>;
}

/** Full-screen sequenced build with an orbiting core. */
export function BuildScene({ name, color, lines }: { name: string; color: string; lines: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, lines.length)), 1100);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="relative mb-12 h-40 w-40">
        {[0, 1, 2].map((r) => (
          <motion.div key={r} className="absolute rounded-full border border-gold/40"
            style={{ inset: r * 18 }} animate={{ rotate: r % 2 ? -360 : 360 }} transition={{ duration: 6 + r * 3, repeat: Infinity, ease: "linear" }}>
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-gold shadow-[0_0_12px_var(--gold)]" />
          </motion.div>
        ))}
        <motion.div className="absolute inset-[54px] rounded-full" style={{ background: color }}
          animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.8, repeat: Infinity }} />
      </div>
      <RevealTitle text={`Building ${name}`} className="mb-8 text-center text-3xl md:text-4xl" />
      <ul className="w-full max-w-sm space-y-3">
        <AnimatePresence>
          {lines.slice(0, i + 1).map((l, n) => (
            <motion.li key={l} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 text-sm">
              {n < i ? <Check className="h-4 w-4 text-gold" /> : <motion.span className="h-2 w-2 rounded-full bg-gold" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />}
              <span className={n < i ? "text-muted-foreground" : ""}>{l}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
