/**
 * The celebration.
 *
 * Shown once, to the person who just took a record. Deliberately not a modal:
 * it steals no focus and swallows no clicks, because it arrives unannounced and
 * the person may well be mid-task.
 *
 * `prefers-reduced-motion` gets the same banner without the particles — the
 * information is the record, not the confetti.
 */

import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RecordBurstItem = { title: string; premium: number };

const PARTICLES = Array.from({ length: 18 }, (_, i) => i);

export function RecordBurst({
  items,
  onDone,
}: {
  items: RecordBurstItem[];
  onDone: () => void;
}) {
  const [reduced, setReduced] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setReduced(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    );
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const out = setTimeout(() => setLeaving(true), 6000);
    const done = setTimeout(onDone, 6600);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, [items.length, onDone]);

  if (!items.length) return null;

  return (
    <div
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "pointer-events-auto relative overflow-hidden rounded-2xl border border-primary/50 bg-card shadow-xl",
          "px-5 py-4 max-w-md w-full",
          leaving ? "animate-fade-out" : "animate-scale-in",
        )}
      >
        {!reduced && (
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            {PARTICLES.map((i) => (
              <span
                key={i}
                className="absolute block h-1.5 w-1.5 rounded-full bg-primary/80"
                style={{
                  left: `${(i * 37) % 100}%`,
                  top: "50%",
                  animation: `record-spark 1.6s ease-out ${(i % 6) * 0.12}s infinite`,
                }}
              />
            ))}
          </div>
        )}
        <div className="relative flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-gold-glow grid place-items-center text-gold-bright">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              New record
            </div>
            {items.map((item) => (
              <div key={item.title} className="mt-0.5">
                <span
                  className="tnum font-bold text-gold-bright"
                  style={{ fontFamily: "var(--font-display)", fontSize: "clamp(20px,3vw,26px)" }}
                >
                  {money(item.premium)}
                </span>
                <span className="ml-2 text-sm text-foreground capitalize">{item.title}</span>
              </div>
            ))}
            <p className="mt-1 text-xs text-muted-foreground">
              Your agency has been notified.
            </p>
          </div>
          <button
            onClick={onDone}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
