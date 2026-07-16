import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Panel } from "@/components/page-shell";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageSquare, Cake, CalendarHeart, Users, PhoneCall, AlertTriangle, Plus, Trash2, Info } from "lucide-react";
import { toast } from "sonner";
import {
  getNovaSettings, updateNovaSettings, listAutomations, createAutomation,
  updateAutomation, deleteAutomation, type NovaSettings, type NovaAutomation,
} from "@/lib/nova.functions";

const TRIGGER_LABEL: Record<NovaAutomation["trigger_type"], string> = {
  birthday: "Client birthday",
  policy_anniversary: "Policy anniversary",
  beneficiary_checkin: "Beneficiary check-in",
  lapse_follow_up: "Lapse follow-up",
  custom_date: "Custom date",
};

function ToggleRow({
  icon: IconCmp, title, desc, checked, onChange, disabled, badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border-soft last:border-0">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 grid place-items-center">
        <IconCmp className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">{title}{badge}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function NovaAutomationsPanel() {
  const qc = useQueryClient();
  const getSettingsFn = useServerFn(getNovaSettings);
  const updateSettingsFn = useServerFn(updateNovaSettings);
  const listFn = useServerFn(listAutomations);
  const createFn = useServerFn(createAutomation);
  const updateFn = useServerFn(updateAutomation);
  const deleteFn = useServerFn(deleteAutomation);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["nova", "settings"],
    queryFn: () => getSettingsFn(),
  });
  const { data: automations, isLoading: autoLoading } = useQuery({
    queryKey: ["nova", "automations"],
    queryFn: () => listFn(),
  });

  const patch = useMutation({
    mutationFn: (p: Partial<NovaSettings>) => updateSettingsFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nova", "settings"] }),
    onError: (e: any) => {
      toast.error(e?.message ?? "Couldn't save setting");
      qc.invalidateQueries({ queryKey: ["nova", "settings"] });
    },
  });
  const set = (key: keyof NovaSettings) => (v: boolean) => {
    // optimistic flip
    qc.setQueryData(["nova", "settings"], (old: any) => ({ ...(old ?? {}), [key]: v }));
    patch.mutate({ [key]: v });
  };

  const toggleAutomation = useMutation({
    mutationFn: (a: { id: string; enabled: boolean }) => updateFn({ data: a }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nova", "automations"] }),
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update automation"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Automation deleted"); qc.invalidateQueries({ queryKey: ["nova", "automations"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't delete"),
  });

  const smsOff = !settings?.sms_notifications_enabled;

  if (settingsLoading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  }

  return (
    <div className="space-y-[var(--gap)]">
      {/* Honest stub notice */}
      <div className="flex items-start gap-2.5 rounded-[var(--radius)] border border-warning/30 bg-warning/10 p-3 text-sm">
        <Info className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <span className="text-muted-foreground">
          Your preferences save now and take effect when automated sending activates for your agency.
          Nothing is sent to clients yet — automations show <em>Scheduled — activation pending</em> until then.
        </span>
      </div>

      <Panel title="Notification Channels">
        <ToggleRow
          icon={Mail}
          title="Email notifications"
          desc="Allow Nova to send automated emails to your clients on your behalf"
          checked={!!settings?.email_notifications_enabled}
          onChange={set("email_notifications_enabled")}
        />
        <ToggleRow
          icon={MessageSquare}
          title="SMS notifications"
          desc="Allow Nova to send automated text messages to your clients"
          checked={!!settings?.sms_notifications_enabled}
          onChange={set("sms_notifications_enabled")}
          badge={<Badge variant="warning" className="text-[10px]">requires phone provider</Badge>}
        />
      </Panel>

      <Panel title="Retention Automations">
        <ToggleRow
          icon={Cake}
          title="Birthday cards"
          desc="Send a personalized birthday message to every client automatically"
          checked={!!settings?.birthday_messages_enabled}
          onChange={set("birthday_messages_enabled")}
        />
        <ToggleRow
          icon={CalendarHeart}
          title="Policy anniversary"
          desc="Celebrate each policy anniversary — a natural review + referral touchpoint"
          checked={!!settings?.anniversary_messages_enabled}
          onChange={set("anniversary_messages_enabled")}
        />
        <ToggleRow
          icon={Users}
          title="Beneficiary check-in"
          desc="Periodic reminders to clients to keep beneficiaries up to date"
          checked={!!settings?.beneficiary_engagement_enabled}
          onChange={set("beneficiary_engagement_enabled")}
        />
        <ToggleRow
          icon={AlertTriangle}
          title="Lapse follow-up"
          desc="Reach out automatically when a policy goes lapse-pending"
          checked={!!settings?.lapse_followup_enabled}
          onChange={set("lapse_followup_enabled")}
        />
        <ToggleRow
          icon={PhoneCall}
          title="Policy recovery outreach"
          desc="Nova drafts recovery outreach for lapsed policies for your review"
          checked={!!settings?.policy_recovery_enabled}
          onChange={set("policy_recovery_enabled")}
        />
      </Panel>

      <Panel
        title="Custom Automations"
        action={<CreateAutomationDialog onCreate={(payload) => createFn({ data: payload }).then(() => { toast.success("Automation created"); qc.invalidateQueries({ queryKey: ["nova", "automations"] }); }).catch((e: any) => toast.error(e?.message ?? "Couldn't create"))} smsOff={smsOff} />}
      >
        {autoLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : (automations?.rows.length ?? 0) === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No custom automations yet. Create one to send your own message on birthdays, anniversaries, or any date you choose.
          </div>
        ) : (
          <div className="space-y-2">
            {automations!.rows.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-[10px] border border-border-soft bg-surface-2 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    {a.name}
                    <Badge variant="outline" className="text-[10px]">{TRIGGER_LABEL[a.trigger_type]}{a.trigger_type === "custom_date" && a.custom_date ? ` · ${a.custom_date}` : ""}</Badge>
                    <Badge variant={a.channel === "sms" ? "warning" : "gold"} className="text-[10px] uppercase">{a.channel}</Badge>
                    {a.enabled && <Badge variant="info" className="text-[10px]">Scheduled — activation pending</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{a.message_template}</div>
                </div>
                <Switch
                  checked={a.enabled}
                  onCheckedChange={(v) => toggleAutomation.mutate({ id: a.id, enabled: v })}
                />
                <Button size="icon" variant="ghost" className="text-destructive h-8 w-8" onClick={() => remove.mutate(a.id)} aria-label="Delete automation">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function CreateAutomationDialog({ onCreate, smsOff }: { onCreate: (p: any) => void; smsOff: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<NovaAutomation["trigger_type"]>("birthday");
  const [channel, setChannel] = useState<NovaAutomation["channel"]>("email");
  const [template, setTemplate] = useState("Happy birthday, {{client_name}}! Wishing you a wonderful year ahead. — {{agent_name}}");
  const [customDate, setCustomDate] = useState("");

  const canSave = name.trim().length > 0 && template.trim().length > 0 && (trigger !== "custom_date" || !!customDate);

  const submit = () => {
    onCreate({
      name: name.trim(),
      trigger_type: trigger,
      channel,
      message_template: template.trim(),
      custom_date: trigger === "custom_date" ? customDate : null,
      enabled: true,
    });
    setOpen(false);
    setName("");
    setTemplate("Happy birthday, {{client_name}}! Wishing you a wonderful year ahead. — {{agent_name}}");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create automation</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create automation</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Birthday card, Annual review invite" maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Trigger</Label>
              <Select value={trigger} onValueChange={(v) => setTrigger(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="birthday">Client birthday</SelectItem>
                  <SelectItem value="policy_anniversary">Policy anniversary</SelectItem>
                  <SelectItem value="beneficiary_checkin">Beneficiary check-in</SelectItem>
                  <SelectItem value="lapse_follow_up">Lapse follow-up</SelectItem>
                  <SelectItem value="custom_date">Custom date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS{smsOff ? " (channel off)" : ""}</SelectItem>
                  <SelectItem value="both">Email + SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {trigger === "custom_date" && (
            <div>
              <Label>Send on</Label>
              <Input type="date" className="mt-1" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Message</Label>
            <Textarea
              className="mt-1 min-h-[110px]"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Variables: <code className="text-primary">{"{{client_name}}"}</code>, <code className="text-primary">{"{{agent_name}}"}</code>, <code className="text-primary">{"{{policy_number}}"}</code>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSave}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
