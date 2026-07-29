import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSetupChecklist, dismissSetupStep } from "@/lib/setup-checklist.functions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Agency setup checklist, shown on the dashboard until the agency finishes it
 * or dismisses it. Steps are derived server-side from real data; the MFA step
 * is the one exception, resolved here because factor state lives in the auth
 * session rather than the database.
 */
export function SetupChecklist() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSetupChecklist);
  const dismissFn = useServerFn(dismissSetupStep);

  const { data } = useQuery({ queryKey: ["setup-checklist"], queryFn: () => getFn() });

  const { data: mfaOn } = useQuery({
    queryKey: ["mfa", "has-verified"],
    queryFn: async () => {
      const { data: f } = await supabase.auth.mfa.listFactors();
      return (f?.totp ?? []).some((x: any) => x.status === "verified");
    },
    staleTime: 60_000,
  });

  const dismiss = useMutation({
    mutationFn: (vars: { step?: string; dismissAll?: boolean }) => dismissFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup-checklist"] }),
  });

  if (!data || data.dismissed || !data.isOwner || data.total === 0) return null;

  const steps = data.steps.map((s) =>
    s.key === "security" ? { ...s, done: Boolean(mfaOn) } : s,
  );
  const complete = steps.filter((s) => s.done).length;
  if (complete === steps.length) return null;

  const pct = Math.round((complete / steps.length) * 100);
  const next = steps.filter((s) => !s.done);

  return (
    <Panel
      title="Finish setting up your agency"
      action={
        <button
          onClick={() => dismiss.mutate({ dismissAll: true })}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss checklist"
        >
          <X className="h-4 w-4" />
        </button>
      }
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tnum text-muted-foreground shrink-0">
          {complete} of {steps.length}
        </span>
      </div>

      <ul className="space-y-1">
        {next.slice(0, 4).map((s) => (
          <li key={s.key}>
            <Link
              to={s.href}
              className="flex items-start gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-surface-2 transition-colors group"
            >
              <span className="mt-0.5 h-4 w-4 rounded-full border border-border shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="block text-xs text-muted-foreground">{s.description}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 mt-0.5" />
            </Link>
          </li>
        ))}
      </ul>

      {complete > 0 && (
        <div className="mt-3 pt-3 border-t border-border-soft">
          <ul className="space-y-1">
            {steps.filter((s) => s.done).map((s) => (
              <li key={s.key} className="flex items-center gap-3 px-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="line-through">{s.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
