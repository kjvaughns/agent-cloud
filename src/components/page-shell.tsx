import * as React from "react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/ui/section-label";

/**
 * Standard page wrapper: container (for @container breakpoints), max width,
 * padding driven by the density token. Replaces ad-hoc `p-4 md:p-6 space-y-6`.
 */
export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("content-container fadeup", className)} style={{ padding: "var(--gap)" }}>
      <div className="max-w-[1600px] mx-auto">{children}</div>
    </div>
  );
}

/**
 * Premium surface card with an optional section-label header + action.
 * Mirrors the reference `Card`.
 */
export function Panel({
  title,
  action,
  children,
  className,
  pad = true,
  style,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={cn("flex flex-col min-w-0 rounded-[var(--radius)] border border-border bg-card", className)}
      style={{ padding: pad ? "var(--pad)" : 0, ...style }}
    >
      {title && <SectionHeader label={title} action={action} />}
      {children}
    </section>
  );
}

/**
 * Hero band: title + subtitle on the left, actions (period picker, CTAs)
 * on the right. Content (metrics/chart) passed as children below.
 */
export function HeroBand({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {title && (
              <h1 className="font-display font-bold tracking-tight text-2xl" style={{ fontFamily: "var(--font-display)" }}>
                {title}
              </h1>
            )}
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
