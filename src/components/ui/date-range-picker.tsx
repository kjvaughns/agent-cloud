import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type RangeOption = { value: string; label: string };

/**
 * Standard period control (ported from the dashboard reference DatePicker).
 * Preset options + optional custom From/To range.
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
  const selected = options.find((o) => o.value === value);
  const label = value === "__custom" ? "Custom" : selected?.label ?? "Select";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
      >
        <Icon name="calendar" size={14} /> {label} <Icon name="chevron" size={13} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40" />
          <div
            className={cn(
              "absolute top-[38px] z-41 min-w-[176px] rounded-[10px] border border-border bg-popover p-1.5",
              align === "right" ? "right-0" : "left-0",
            )}
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setCustom(false); setOpen(false); }}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-[7px] text-[12.5px] transition-colors",
                  value === o.value ? "bg-gold-glow text-gold-bright font-semibold" : "text-foreground hover:bg-surface-2 font-medium",
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
                  className={cn(
                    "w-full text-left px-2.5 py-2 rounded-[7px] text-[12.5px] flex justify-between items-center transition-colors",
                    custom ? "bg-gold-glow text-gold-bright font-semibold" : "text-foreground hover:bg-surface-2 font-medium",
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
                      onClick={() => { if (from && to) { onCustom(from, to); } onChange("__custom"); setOpen(false); }}
                      className="mt-0.5 py-1.5 rounded-[7px] text-[11.5px] font-bold text-gold-foreground bg-[linear-gradient(180deg,var(--gold-bright),var(--gold))]"
                    >
                      Apply range
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
