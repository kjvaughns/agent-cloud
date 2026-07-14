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

/** Card header row: section label on the left, optional action on the right. */
export function SectionHeader({
  label,
  action,
  className,
}: {
  label: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-center justify-between mb-3.5", className)}>
      <SectionLabel>{label}</SectionLabel>
      {action}
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
