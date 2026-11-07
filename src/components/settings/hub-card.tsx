/** Shared Agency-settings hub layout, matching Identity: card + saved indicator + sticky preview + Advanced drawer. */
import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved";

export function SavedIndicator({ status }: { status: SaveStatus }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      {status === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Saving</>}
      {status === "saved" && <><Check className="h-3 w-3 text-success" /> Saved</>}
    </span>
  );
}

export function HubCard({ title, blurb, status = "idle", action, children }: {
  title: string; blurb?: string; status?: SaveStatus; action?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {blurb && <p className="mt-0.5 text-sm text-muted-foreground">{blurb}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{action}<SavedIndicator status={status} /></div>
      </div>
      {children}
    </div>
  );
}

export function HubLayout({ preview, children }: { preview?: ReactNode; children: ReactNode }) {
  if (!preview) return <div className="min-w-0 space-y-6">{children}</div>;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">{children}</div>
      <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live preview</p>
        {preview}
      </div>
    </div>
  );
}

export function PreviewCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>{children}</div>;
}

export function AdvancedDrawer({ label, open: openProp, onOpenChange, children }: {
  label: string; open?: boolean; onOpenChange?: (v: boolean) => void; children: ReactNode;
}) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const set = onOpenChange ?? setInner;
  return (
    <div className="rounded-2xl border border-dashed border-border">
      <button type="button" aria-expanded={open} onClick={() => set(!open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm font-medium text-muted-foreground hover:text-foreground">
        <span>Advanced <span className="font-normal">· {label}</span></span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-6 border-t border-border p-4 sm:p-5">{children}</div>}
    </div>
  );
}

export function ChoiceCards<T extends string | number>({ value, options, onChange, disabled, cols = 2 }: {
  value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void; disabled?: boolean; cols?: 2 | 3 | 4;
}) {
  return (
    <div className={cn("grid gap-2", cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" disabled={disabled} aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
          <span className="flex items-center justify-between gap-2 text-sm font-medium">
            {o.label}{value === o.value && <Check className="h-4 w-4 text-primary" />}
          </span>
          {o.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}
