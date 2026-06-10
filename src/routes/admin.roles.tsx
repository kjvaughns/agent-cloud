import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminListAllAgents, adminSetAgentRole } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/roles")({
  component: AdminRoles,
  head: () => ({ meta: [{ title: "Roles — Agent Cloud Admin" }] }),
});

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-600",
  manager: "bg-[#C9A227]/15 text-[#C9A227]",
  agent: "bg-slate-500/15 text-slate-500",
};

function AdminRoles() {
  const [agents, setAgents] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [demoteWarn, setDemoteWarn] = useState<{ agentId: string; name: string; newRole: string } | null>(null);

  async function load() {
    setLoading(true);
    const res = await adminListAllAgents();
    setAgents(res.agents);
    setRoles(res.roles);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function getRole(agentId: string): string {
    const row = roles.find((r) => r.user_id === agentId);
    return row?.role ?? "agent";
  }

  function handleRoleChange(agent: any, newRole: string) {
    const currentRole = getRole(agent.id);
    if (currentRole === "admin" && newRole !== "admin") {
      setDemoteWarn({ agentId: agent.id, name: `${agent.first_name} ${agent.last_name}`, newRole });
    } else {
      setPendingChanges((p) => ({ ...p, [agent.id]: newRole }));
    }
  }

  async function saveRole(agentId: string, newRole: string) {
    setSaving((p) => ({ ...p, [agentId]: true }));
    try {
      await adminSetAgentRole({ data: { target_user_id: agentId, role: newRole as any } });
      setRoles((prev) => {
        const next = prev.filter((r) => r.user_id !== agentId);
        if (newRole !== "agent") next.push({ user_id: agentId, role: newRole });
        return next;
      });
      setPendingChanges((p) => { const n = { ...p }; delete n[agentId]; return n; });
      toast.success("Role updated");
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving((p) => ({ ...p, [agentId]: false }));
  }

  const filtered = agents.filter((a) => {
    if (!search) return true;
    return `${a.first_name} ${a.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      (a.email ?? "").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-[#C9A227]" />
        <div>
          <h1 className="text-2xl font-bold">Role Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Assign admin and manager roles to agents</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search agents..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Current Role</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">No agents found</td></tr>
              ) : filtered.map((a) => {
                const currentRole = getRole(a.id);
                const pending = pendingChanges[a.id];
                const displayRole = pending ?? currentRole;
                return (
                  <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{a.first_name} {a.last_name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{a.email}</td>
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs", ROLE_COLORS[currentRole])}>{currentRole}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Select value={displayRole} onValueChange={(v) => handleRoleChange(a, v)}>
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agent">Agent</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        {pending && pending !== currentRole && (
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={saving[a.id]}
                            onClick={() => saveRole(a.id, pending)}
                          >
                            {saving[a.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!demoteWarn} onOpenChange={(o) => !o && setDemoteWarn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove admin access?</AlertDialogTitle>
            <AlertDialogDescription>
              Removing admin from <strong>{demoteWarn?.name}</strong> means they can no longer access the Admin Portal.
              Are you sure you want to change their role to <strong>{demoteWarn?.newRole}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDemoteWarn(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (demoteWarn) {
                  setPendingChanges((p) => ({ ...p, [demoteWarn.agentId]: demoteWarn.newRole }));
                  setDemoteWarn(null);
                }
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
