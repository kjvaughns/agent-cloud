import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NovaRail } from "@/components/nova-rail";

export type AttentionItem = {
  label: string;
  meta?: string;
  tone?: "danger" | "warning" | "info";
  onClick?: () => void;
};

/**
 * Reusable right-hand context rail (340px, collapsible).
 * Stacks an optional Needs-attention card + the Nova assistant.
 * Pages opt in by rendering it inside a `.cgrid` layout.
 */
export function ContextRail({
  attention,
  novaInsight,
  novaActions,
  novaContext,
  children,
}: {
  attention?: AttentionItem[];
  novaInsight?: string;
  novaActions?: { label: string; onClick: () => void }[];
  novaContext?: string;
  children?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="flex justify-end">
        <button
          onClick={() => setCollapsed(false)}
          className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Show panel"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="col">
      <div className="flex items-center justify-end -mb-1">
        <button
          onClick={() => setCollapsed(true)}
          className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Hide panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {attention && attention.length > 0 && (
        <div className="rounded-[var(--radius)] border border-border bg-card p-pad">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">Needs Attention</span>
            <span className="ml-auto text-xs font-semibold tnum">{attention.length}</span>
          </div>
          <div className="space-y-1.5">
            {attention.map((a, i) => {
              const dot = a.tone === "danger" ? "bg-destructive" : a.tone === "info" ? "bg-info" : "bg-warning";
              return (
                <button
                  key={i}
                  onClick={a.onClick}
                  className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-2 hover:bg-surface-2 transition-colors"
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{a.label}</span>
                    {a.meta && <span className="block text-xs text-muted-foreground truncate">{a.meta}</span>}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <NovaRail insight={novaInsight} actions={novaActions} context={novaContext} />

      {children}
    </div>
  );
}
