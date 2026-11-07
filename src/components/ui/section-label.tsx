import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** Uppercase micro-label used as the premium card-header pattern. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "font-display text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground",
        className,
      )}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </h2>
  );
}

/** Card header row, Agency-settings style: title + optional one-line blurb, action on the right. */
export function SectionHeader({
  label,
  action,
  blurb,
  className,
}: {
  label: React.ReactNode;
  action?: React.ReactNode;
  blurb?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">{label}</h2>
        {blurb && <p className="mt-0.5 text-sm text-muted-foreground">{blurb}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

/** Gold text link with trailing arrow — the reference `linkBtn`. */
export function LinkAction({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    "inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-gold-bright transition-colors";
  const inner = (
    <>
      {children} <Icon name="arrow" size={12} />
    </>
  );
  if (href) return <a href={href} className={cls}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
