import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type RangeOption = { value: string; label: string };

/**
 * Standard period control. Preset options + optional custom From/To range.
 *
 * The popover is rendered into document.body rather than next to the trigger.
 * It used to be absolutely positioned inside the trigger's wrapper, which meant
 * any ancestor with `overflow-hidden` clipped it — on the dashboard the hero
 * Panel does exactly that, and it cut off "Custom range" and the date inputs.
 * A portal cannot be clipped by an ancestor and competes for z-index at the
 * root, so the control works wherever it is placed.
 */
export function DateRangePicker({
  options,
  value,
  onChange,
  onCustom,
  align = "right",
}: {
  options: RangeOption[];
  value: string;
  onChange: (value: string) => void;
  onCustom?: (from: string, to: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const label = value === "__custom" ? "Custom" : selected?.label ?? "Select";

  // Position against the trigger, flipping above it when the panel would run
  // off the bottom of the viewport.
  const place = () => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const panelW = Math.max(196, r.width);
    const panelH = panelRef.current?.offsetHeight ?? 260;

    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < panelH + 16 && r.top > panelH + 16;

    let left = align === "right" ? r.right - panelW : r.left;
    // Keep it on screen on narrow viewports.
    left = Math.min(Math.max(8, left), window.innerWidth - panelW - 8);

    setPos({ top: above ? r.top - panelH - 6 : r.bottom + 6, left, width: panelW });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Re-place after the custom section expands and changes the height.
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, custom]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // `true` so this fires for scrolls inside any scrolling ancestor, not just
    // the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => { setOpen(false); setCustom(false); };

  const panel = (
    <>
      <div onClick={close} className="fixed inset-0 z-[80]" />
      <div
        ref={panelRef}
        className="fixed z-[81] rounded-[10px] border border-border bg-popover p-1.5"
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          minWidth: pos?.width ?? 196,
          boxShadow: "var(--shadow-pop)",
          // Hidden until measured, so it never flashes in the wrong spot.
          visibility: pos ? "visible" : "hidden",
        }}
        role="listbox"
      >
        {options.map((o) => (
          <button
            key={o.value}
            role="option"
            aria-selected={value === o.value}
            onClick={() => { onChange(o.value); close(); }}
            className={cn(
              "w-full text-left px-2.5 py-2 rounded-[7px] text-[12.5px] transition-colors",
              value === o.value
                ? "bg-gold-glow text-gold-bright font-semibold"
                : "text-foreground hover:bg-surface-2 font-medium",
            )}
          >
            {o.label}
          </button>
        ))}

        {onCustom && (
          <>
            <div className="h-px bg-border mx-1.5 my-1.5" />
            <button
              onClick={() => setCustom((c) => !c)}
              aria-expanded={custom}
              className={cn(
                "w-full text-left px-2.5 py-2 rounded-[7px] text-[12.5px] flex justify-between items-center transition-colors",
                custom || value === "__custom"
                  ? "bg-gold-glow text-gold-bright font-semibold"
                  : "text-foreground hover:bg-surface-2 font-medium",
              )}
            >
              Custom range <Icon name="chevron" size={13} />
            </button>

            {custom && (
              <div className="px-2 pt-2 pb-1 flex flex-col gap-1.5">
                {([["From", from, setFrom], ["To", to, setTo]] as const).map(([l, v, set]) => (
                  <label key={l} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="w-[30px]">{l}</span>
                    <input
                      type="date"
                      value={v}
                      onChange={(e) => set(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-surface-2 text-foreground text-[11.5px] px-1.5 py-1"
                    />
                  </label>
                ))}
                <button
                  disabled={!from || !to || from > to}
                  onClick={() => { onCustom(from, to); onChange("__custom"); close(); }}
                  className={cn(
                    "mt-0.5 py-1.5 rounded-[7px] text-[11.5px] font-bold text-gold-foreground",
                    "bg-[linear-gradient(180deg,var(--gold-bright),var(--gold))]",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                >
                  Apply range
                </button>
                {from && to && from > to && (
                  <p className="text-[10.5px] text-destructive">Start date must be before the end date.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
      >
        <Icon name="calendar" size={14} /> {label} <Icon name="chevron" size={13} />
      </button>
      {open && typeof document !== "undefined" && createPortal(panel, document.body)}
    </>
  );
}
