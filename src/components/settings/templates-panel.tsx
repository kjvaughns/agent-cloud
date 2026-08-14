import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  deleteTemplate, listTemplates, saveEmailTemplate, saveSpreadsheetTemplate,
} from "@/lib/contracting-templates.functions";
import { listOrgCarriers } from "@/lib/contracting-ops.functions";
import { PACKET_KEYS } from "@/lib/contracting-ops/packet";
import { EmptyState } from "@/components/contracting/shared";
import { cn } from "@/lib/utils";


const KEY_ENTRIES = Object.entries(PACKET_KEYS) as [string, string][];

/**
 * Per-carrier submission templates — the email bodies and spreadsheet layouts
 * a packet is generated from. Mounted by Settings ▸ Submission Templates.
 */
export function TemplatesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const carriersFn = useServerFn(listOrgCarriers);
  const saveSheetFn = useServerFn(saveSpreadsheetTemplate);
  const saveEmailFn = useServerFn(saveEmailTemplate);
  const deleteFn = useServerFn(deleteTemplate);

  const [tab, setTab] = useState<"spreadsheet" | "email">("spreadsheet");
  const [editingSheet, setEditingSheet] = useState<any | null>(null);
  const [editingEmail, setEditingEmail] = useState<any | null>(null);
  const [addingSheet, setAddingSheet] = useState(false);
  const [addingEmail, setAddingEmail] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "templates"], queryFn: () => listFn(),
  });
  const { data: carrierData } = useQuery({
    queryKey: ["contracting-ops", "carriers"], queryFn: () => carriersFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["contracting-ops"] });

  const saveSheet = useMutation({
    mutationFn: (p: any) => saveSheetFn({ data: p }),
    onSuccess: () => { toast.success("Template saved"); setAddingSheet(false); setEditingSheet(null); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });
  const saveEmail = useMutation({
    mutationFn: (p: any) => saveEmailFn({ data: p }),
    onSuccess: () => { toast.success("Template saved"); setAddingEmail(false); setEditingEmail(null); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });
  const remove = useMutation({
    mutationFn: (p: any) => deleteFn({ data: p }),
    onSuccess: () => { toast.success("Template removed"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  const canManage = data?.canManage;
  const sheets = (data?.spreadsheets ?? []) as any[];
  const emails = (data?.emails ?? []) as any[];

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["spreadsheet", Table2, "Spreadsheet"], ["email", Mail, "Email"]] as const).map(([v, Icon, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              tab === v ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
        {canManage && (
          <Button size="sm" className="ml-auto"
                  onClick={() => tab === "spreadsheet" ? setAddingSheet(true) : setAddingEmail(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New template
          </Button>
        )}
      </div>

      {tab === "spreadsheet" ? (
        sheets.length === 0 ? (
          <EmptyState
            title="No spreadsheet templates"
            body="Some carriers take contracting on their own spreadsheet. Define the columns that sheet expects and map each one to an Agent Cloud field — then a request exports as a ready row instead of being retyped."
            action={canManage ? <Button size="sm" onClick={() => setAddingSheet(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Create one</Button> : undefined}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sheets.map((s) => (
              <Panel key={s.id} className="p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-foreground">{s.name}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {s.carrier_name} · {s.mappings.length} column{s.mappings.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManage && (
                    <span className="flex gap-1">
                      <button onClick={() => setEditingSheet(s)}
                              className="text-[11px] text-muted-foreground hover:text-foreground">Edit</button>
                      <button
                        onClick={() => confirm(`Remove "${s.name}"?`) && remove.mutate({ id: s.id, kind: "spreadsheet" })}
                        aria-label="Remove" className="text-text-dim hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                {s.mappings.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {s.mappings.slice(0, 12).map((m: any) => (
                      <span key={m.id ?? m.column_header}
                            className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {m.column_header}
                        {m.required && <span className="ml-0.5 text-destructive">*</span>}
                      </span>
                    ))}
                    {s.mappings.length > 12 && (
                      <span className="text-[10px] text-text-dim">+{s.mappings.length - 12} more</span>
                    )}
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )
      ) : (
        emails.length === 0 ? (
          <EmptyState
            title="No email templates"
            body="For carriers that take contracting by email, write the message once with {{variables}} and Agent Cloud fills it from the request. Nothing sends automatically — you preview, edit and send it yourself."
            action={canManage ? <Button size="sm" onClick={() => setAddingEmail(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Create one</Button> : undefined}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {emails.map((e) => (
              <Panel key={e.id} className="p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-foreground">{e.name}</h3>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {e.carrier_name}{e.to_email ? ` · ${e.to_email}` : ""}
                    </p>
                  </div>
                  {canManage && (
                    <span className="flex gap-1">
                      <button onClick={() => setEditingEmail(e)}
                              className="text-[11px] text-muted-foreground hover:text-foreground">Edit</button>
                      <button
                        onClick={() => confirm(`Remove "${e.name}"?`) && remove.mutate({ id: e.id, kind: "email" })}
                        aria-label="Remove" className="text-text-dim hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                <p className="mt-2 truncate text-xs text-foreground">{e.subject}</p>
                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{e.body}</p>
              </Panel>
            ))}
          </div>
        )
      )}

      <SpreadsheetDialog
        open={addingSheet || Boolean(editingSheet)}
        record={editingSheet}
        carriers={(carrierData?.carriers ?? []) as any[]}
        pending={saveSheet.isPending}
        onClose={() => { setAddingSheet(false); setEditingSheet(null); }}
        onSave={(p) => saveSheet.mutate(p)}
      />
      <EmailDialog
        open={addingEmail || Boolean(editingEmail)}
        record={editingEmail}
        carriers={(carrierData?.carriers ?? []) as any[]}
        pending={saveEmail.isPending}
        onClose={() => { setAddingEmail(false); setEditingEmail(null); }}
        onSave={(p) => saveEmail.mutate(p)}
      />
    </div>
  );
}

/**
 * Column mapping.
 *
 * The carrier's headers are typed in the order they appear on their sheet, and
 * each is bound to a packet field. Pasting a header row is supported because
 * that is how a carrier's template actually arrives — as a spreadsheet
 * somebody copies from.
 */
function SpreadsheetDialog({
  open, record, carriers, pending, onClose, onSave,
}: {
  open: boolean; record: any | null; carriers: any[]; pending: boolean;
  onClose: () => void; onSave: (p: any) => void;
}) {
  const [name, setName] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [paste, setPaste] = useState("");

  const key = record?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setName(record?.name ?? "");
    setCarrierId(record?.org_carrier_id ?? "");
    setRows((record?.mappings ?? []).map((m: any) => ({
      column_header: m.column_header, source_key: m.source_key,
      static_value: m.static_value ?? "", transform: m.transform ?? "", required: m.required ?? false,
    })));
    setPaste("");
  }

  const addFromPaste = () => {
    const headers = paste.split(/[\t\n,]+/).map((h) => h.trim()).filter(Boolean);
    if (!headers.length) return;
    setRows((prev) => [
      ...prev,
      ...headers.map((h) => ({ column_header: h, source_key: "literal", static_value: "", transform: "", required: false })),
    ]);
    setPaste("");
  };

  const update = (i: number, patch: any) =>
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? `Edit ${record.name}` : "New spreadsheet template"}</DialogTitle>
          <DialogDescription>
            Map the carrier's columns to Agent Cloud fields. The original file is never modified —
            exports are generated as new files.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="st-name">Template name</Label>
            <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="Mutual of Omaha bulk sheet" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="st-carrier">Carrier</Label>
            <select id="st-carrier" value={carrierId} onChange={(e) => setCarrierId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
              <option value="">Any carrier</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-2">
          <Label htmlFor="st-paste">Paste the carrier's header row</Label>
          <div className="mt-1 flex gap-2">
            <Input id="st-paste" value={paste} onChange={(e) => setPaste(e.target.value)}
                   placeholder="Agent Name, NPN, Email, Upline NPN…" />
            <Button variant="outline" size="sm" onClick={addFromPaste} disabled={!paste.trim()}>Add</Button>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No columns yet. Paste the carrier's header row above, or add them one at a time.
            </p>
          )}
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-2 py-1.5">
              <span className="tnum w-6 shrink-0 text-[10px] text-text-dim">{i + 1}</span>
              <Input value={r.column_header} onChange={(e) => update(i, { column_header: e.target.value })}
                     placeholder="Column header" className="h-8 w-40 shrink-0 text-xs" />
              <span className="text-text-dim">←</span>
              <select value={r.source_key} onChange={(e) => update(i, { source_key: e.target.value })}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs">
                <option value="literal">Fixed text…</option>
                {KEY_ENTRIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              {r.source_key === "literal" && (
                <Input value={r.static_value} onChange={(e) => update(i, { static_value: e.target.value })}
                       placeholder="Value" className="h-8 w-28 shrink-0 text-xs" />
              )}
              <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <input type="checkbox" checked={r.required} onChange={(e) => update(i, { required: e.target.checked })}
                       className="h-3 w-3 accent-[var(--gold)]" />
                Required
              </label>
              <button onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove column" className="shrink-0 text-text-dim hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm"
                  onClick={() => setRows((p) => [...p, { column_header: "", source_key: "literal", static_value: "", transform: "", required: false }])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add a column
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || !name.trim() || rows.some((r) => !r.column_header.trim())}
                  onClick={() => onSave({
                    id: record?.id,
                    name: name.trim(),
                    org_carrier_id: carrierId || null,
                    header_row: 1,
                    active: true,
                    mappings: rows.map((r) => ({
                      column_header: r.column_header.trim(),
                      source_key: r.source_key,
                      static_value: r.source_key === "literal" ? (r.static_value || null) : null,
                      transform: r.transform || null,
                      required: Boolean(r.required),
                    })),
                  })}>
            {pending ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmailDialog({
  open, record, carriers, pending, onClose, onSave,
}: {
  open: boolean; record: any | null; carriers: any[]; pending: boolean;
  onClose: () => void; onSave: (p: any) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const key = record?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setForm({
      name: record?.name ?? "",
      org_carrier_id: record?.org_carrier_id ?? "",
      to_email: record?.to_email ?? "",
      subject: record?.subject ?? "Contracting request — {{agent_full_name}} ({{agent_npn}})",
      body: record?.body ??
        "Hello,\n\nPlease set up contracting for the producer below.\n\n" +
        "Name: {{agent_full_name}}\nNPN: {{agent_npn}}\nEmail: {{agent_email}}\n" +
        "Phone: {{agent_phone}}\nResident state: {{agent_resident_state}}\n" +
        "Requested states: {{requested_states}}\nRequested level: {{requested_comp_level}}\n\n" +
        "Upline: {{upline_name}} (NPN {{upline_npn}}, writing number {{upline_writing_number}})\n" +
        "Agency: {{agency_name}} — writing number {{agency_writing_number}}\n\n" +
        "Thank you,\n{{agency_name}}",
    });
  }
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const insert = (k: string) => set("body", `${form.body ?? ""}{{${k}}}`);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? `Edit ${record.name}` : "New email template"}</DialogTitle>
          <DialogDescription>
            Use {"{{variables}}"} for anything that comes from the request. Nothing is sent
            automatically and no document is attached without an explicit action.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="et-name">Template name</Label>
            <Input id="et-name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="et-carrier">Carrier</Label>
            <select id="et-carrier" value={form.org_carrier_id ?? ""} onChange={(e) => set("org_carrier_id", e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
              <option value="">Any carrier</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="et-to">Send to</Label>
            <Input id="et-to" value={form.to_email ?? ""} onChange={(e) => set("to_email", e.target.value)}
                   placeholder="Falls back to the carrier's contracting email" className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="et-subject">Subject</Label>
            <Input id="et-subject" value={form.subject ?? ""} onChange={(e) => set("subject", e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="et-body">Body</Label>
            <textarea id="et-body" rows={12} value={form.body ?? ""} onChange={(e) => set("body", e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs leading-relaxed" />
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Insert a variable</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {KEY_ENTRIES.map(([k, label]) => (
              <button key={k} onClick={() => insert(k)} title={label}
                      className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground">
                {k}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || !form.name?.trim() || !form.subject?.trim() || !form.body?.trim()}
                  onClick={() => onSave({
                    id: record?.id,
                    name: form.name.trim(),
                    org_carrier_id: form.org_carrier_id || null,
                    to_email: form.to_email?.trim() || null,
                    subject: form.subject.trim(),
                    body: form.body.trim(),
                    applies_to: [],
                    suggested_attachments: [],
                    active: true,
                    is_default: false,
                  })}>
            {pending ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
