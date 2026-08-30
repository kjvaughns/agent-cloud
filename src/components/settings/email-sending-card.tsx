import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MailWarning } from "lucide-react";
import { toast } from "sonner";
import { getOrgEmailSettings, updateOrgEmailSettings } from "@/lib/email/org-settings.functions";
import { CONFIGURABLE_CATEGORIES, CATEGORY_LABELS } from "@/lib/email/categories";

/**
 * The switch that decides whether this agency emails anybody at all, plus the
 * per-category opt-ins beneath it.
 *
 * It defaults to off and had no control anywhere, so announcements, task
 * assignments and contracting updates were all being written to the send log
 * as suppressed. Password resets and invitations were never affected — those
 * are exempt categories — which is why nothing looked broken until somebody
 * asked why announcement emails never arrived.
 */
export function EmailSendingCard() {
  const qc = useQueryClient();
  const save = useServerFn(updateOrgEmailSettings);

  const q = useQuery({
    queryKey: ["org-email-settings"],
    queryFn: () => getOrgEmailSettings(),
  });

  const s = q.data;
  const disabled = !s?.canEdit || q.isFetching;

  async function patch(payload: { emailsEnabled?: boolean; categories?: Record<string, boolean> }) {
    try {
      await save({ data: payload });
      await qc.invalidateQueries({ queryKey: ["org-email-settings"] });
      toast.success("Email settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save that");
    }
  }

  if (!s?.available) return null;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Send email notifications</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When this is off, your agency sends no notification email at all. Account
              and security messages — password resets and invitations — always send.
            </p>
          </div>
          <Switch
            checked={s.emailsEnabled}
            disabled={disabled}
            onCheckedChange={(v) => patch({ emailsEnabled: v })}
            aria-label="Send email notifications"
          />
        </div>

        {!s.emailsEnabled && (
          <Alert>
            <MailWarning className="h-4 w-4" />
            <AlertDescription>
              Email is off, so announcements and other notifications reach your team in
              the app only.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3 border-t pt-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            What your agency emails about
          </p>
          {CONFIGURABLE_CATEGORIES.map((c) => (
            <div key={c} className="flex items-center justify-between gap-4">
              <Label htmlFor={`email-cat-${c}`} className="text-sm font-normal">
                {CATEGORY_LABELS[c]}
              </Label>
              <Switch
                id={`email-cat-${c}`}
                checked={s.categories[c] !== false}
                // Each category is still gated by the master switch above, and
                // by every recipient's own notification preferences.
                disabled={disabled || !s.emailsEnabled}
                onCheckedChange={(v) => patch({ categories: { [c]: v } })}
              />
            </div>
          ))}
        </div>

        {!s.canEdit && (
          <p className="text-xs text-muted-foreground">
            Only the agency owner can change these.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
