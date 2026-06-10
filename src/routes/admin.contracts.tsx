import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminListAllContracts, adminUpdateContract } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/contracts")({
  component: AdminContracts,
  head: () => ({ meta: [{ title: "Contracts — Agent Cloud Admin" }] }),
});

const STATUSES = ["all", "requested", "submitted", "in_review", "active", "issue", "declined"];

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-yellow-500/15 text-yellow-600",
  submitted: "bg-[#C9A227]/15 text-[#C9A227]",
  in_review: "bg-purple-500/15 text-purple-600",
  active: "bg-emerald-500/15 text-emerald-600",
  issue: "bg-red-500/15 text-red-600",
  declined: "bg-slate-500/15 text-slate-500",
};

function AdminContracts() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [writingEdits, setWritingEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const res = await adminListAllContracts();
    setRows(res.rows);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = tab === "all" ? rows : rows.filter((r) => r.status === tab);

  async function update(id: string, patch: Record<string, any>) {
    setSaving((p) => ({ ...p, [id]: true }));
    try {
      await adminUpdateContract({ data: { id, ...patch } });
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
      toast.success("Updated");
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving((p) => ({ ...p, [id]: false }));
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Contracts</h1>
        <p className="text-sm text-muted-foreground mt-1">{rows.length} total contracts</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md capitalize transition-colors",
              tab === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Carrier</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Writing #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Requested</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No contracts found</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.profiles?.first_name} {c.profiles?.last_name}</p>
                    <p className="text-xs text-muted-foreground">{c.profiles?.email}</p>
                  </td>
                  <td className="px-4 py-3">{c.carriers?.name}</td>
                  <td className="px-4 py-3">
                    <Select value={c.status} onValueChange={(val) => update(c.id, { status: val })}>
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.filter((s) => s !== "all").map((s) => (
                          <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 text-xs w-32"
                        placeholder="Writing #"
                        value={writingEdits[c.id] ?? c.writing_number ?? ""}
                        onChange={(e) => setWritingEdits((p) => ({ ...p, [c.id]: e.target.value }))}
                        onBlur={() => {
                          const val = writingEdits[c.id];
                          if (val !== undefined && val !== (c.writing_number ?? "")) {
                            update(c.id, { writing_number: val });
                          }
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {c.requested_at ? formatDistanceToNow(new Date(c.requested_at), { addSuffix: true }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-emerald-600 hover:text-emerald-600 hover:bg-emerald-500/10"
                        disabled={saving[c.id] || c.status === "active"}
                        onClick={() => update(c.id, { status: "active" })}
                      >
                        {saving[c.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-amber-600 hover:text-amber-600 hover:bg-amber-500/10"
                        disabled={saving[c.id] || c.status === "issue"}
                        onClick={() => update(c.id, { status: "issue" })}
                      >
                        <AlertTriangle className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-600 hover:text-red-600 hover:bg-red-500/10"
                        disabled={saving[c.id] || c.status === "declined"}
                        onClick={() => update(c.id, { status: "declined" })}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
