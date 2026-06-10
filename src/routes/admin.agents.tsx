import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListAllAgents, adminSetAgentRole, adminMoveAgent, adminSyncAgentByNpn } from "@/lib/admin.functions";
import { checkAgentSyncStatus } from "@/lib/agentsync.functions";
import { CompLevelEditor } from "@/components/admin/comp-level-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, RefreshCw, Search, User, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/agents")({
  component: AdminAgents,
  head: () => ({ meta: [{ title: "Agents — Agent Cloud Admin" }] }),
});

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600",
  inactive: "bg-slate-500/15 text-slate-500",
  terminated: "bg-red-500/15 text-red-600",
  pending: "bg-yellow-500/15 text-yellow-600",
  imported: "bg-[#C9A227]/15 text-[#C9A227]",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-600",
  manager: "bg-blue-500/15 text-blue-600",
  agent: "bg-slate-500/15 text-slate-500",
};

function AdminAgents() {
  const [agents, setAgents] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [pendingRole, setPendingRole] = useState<string>("");
  const [pendingUpline, setPendingUpline] = useState<string>("none");
  const [savingUpline, setSavingUpline] = useState(false);
  const moveAgentFn = useServerFn(adminMoveAgent);
  const checkStatusFn = useServerFn(checkAgentSyncStatus);
  const syncAgentFn = useServerFn(adminSyncAgentByNpn);

  const { data: asStatus } = useQuery({
    queryKey: ["agentsync-status"],
    queryFn: () => checkStatusFn(),
    staleTime: 60 * 60 * 1000,
  });
  const agentSyncAvailable = asStatus?.available ?? false;

  async function load() {
    setLoading(true);
    const res = await adminListAllAgents();
    setAgents(res.agents);
    setContracts(res.contracts);
    setRoles(res.roles);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function getRole(agentId: string): string {
    const row = roles.find((r) => r.user_id === agentId);
    return row?.role ?? "agent";
  }

  function getContractCount(agentId: string): number {
    return contracts.filter((c) => c.agent_id === agentId && c.status === "active").length;
  }

  const filtered = agents.filter((a) => {
    const name = `${a.first_name} ${a.last_name}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || (a.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const matchRole = roleFilter === "all" || getRole(a.id) === roleFilter;
    return matchSearch && matchStatus && matchRole;
  });

  async function saveUpline() {
    if (!selected) return;
    setSavingUpline(true);
    try {
      await moveAgentFn({ data: {
        agent_id: selected.id,
        new_upline_id: pendingUpline === "none" ? null : pendingUpline,
      }});
      toast.success("Upline updated");
      const newUplineId = pendingUpline === "none" ? null : pendingUpline;
      setAgents((prev) => prev.map((a) => a.id === selected.id ? { ...a, upline_id: newUplineId } : a));
      setSelected((prev: any) => prev ? { ...prev, upline_id: newUplineId } : null);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingUpline(false);
  }

  async function saveRole() {
    if (!selected || !pendingRole) return;
    setSavingRole(true);
    try {
      await adminSetAgentRole({ data: { target_user_id: selected.id, role: pendingRole as any } });
      toast.success("Role updated");
      setRoles((prev) => {
        const next = prev.filter((r) => r.user_id !== selected.id);
        if (pendingRole !== "agent") next.push({ user_id: selected.id, role: pendingRole });
        return next;
      });
    } catch (e: any) {
      toast.error(e.message);
    }
    setSavingRole(false);
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">{agents.length} total agents</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
            <SelectItem value="imported">Imported (Not Joined)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(() => {
        const importedCount = agents.filter((a) => a.status === "imported").length;
        if (importedCount === 0 || statusFilter === "imported") return null;
        return (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 text-sm">
            <UserCheck className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="flex-1 text-blue-700">{importedCount} imported agent{importedCount !== 1 ? "s" : ""} haven't joined yet.</span>
            <button
              className="text-xs font-medium text-blue-700 underline hover:no-underline"
              onClick={() => setStatusFilter("imported")}
            >
              View
            </button>
          </div>
        );
      })()}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Active Contracts</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Last Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No agents found</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{a.first_name} {a.last_name}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{a.email}</td>
                  <td className="px-4 py-3">
                    <Badge className={cn("text-xs", STATUS_COLORS[a.status] ?? "bg-slate-500/15 text-slate-500")}>{a.status ?? "unknown"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn("text-xs", ROLE_COLORS[getRole(a.id)])}>{getRole(a.id)}</Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">{getContractCount(a.id)}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell">
                    {a.last_active_at ? formatDistanceToNow(new Date(a.last_active_at), { addSuffix: true }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setSelected(a);
                        setPendingRole(getRole(a.id));
                        setPendingUpline(a.upline_id ?? "none");
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:w-[420px] sm:max-w-[420px]">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {selected.first_name} {selected.last_name}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs">Email</p><p className="font-medium truncate">{selected.email}</p></div>
                  <div><p className="text-muted-foreground text-xs">Phone</p><p className="font-medium">{selected.phone || "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">NPN</p><p className="font-medium">{selected.npn_number || "—"}</p></div>
                  <div><p className="text-muted-foreground text-xs">Status</p>
                    <Badge className={cn("text-xs mt-0.5", STATUS_COLORS[selected.status] ?? "")}>{selected.status ?? "unknown"}</Badge>
                  </div>
                  <div><p className="text-muted-foreground text-xs">Active Contracts</p><p className="font-medium">{getContractCount(selected.id)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Joined</p><p className="font-medium">{new Date(selected.created_at).toLocaleDateString()}</p></div>
                </div>

                {agentSyncAvailable && selected?.npn_number && (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={async () => {
                        try {
                          const res: any = await syncAgentFn({ data: { target_agent_id: selected.id, npn: selected.npn_number } });
                          toast.success(`Synced ${res.licenses_imported} licenses for ${selected.first_name}`);
                        } catch (e: any) {
                          toast.error(e.message ?? "Sync failed");
                        }
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Sync via AgentSync
                    </Button>
                  </div>
                )}

                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium mb-2">Role Assignment</p>
                  <div className="flex gap-2">
                    <Select value={pendingRole} onValueChange={setPendingRole}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={saveRole} disabled={savingRole || pendingRole === getRole(selected.id)} size="sm">
                      {savingRole ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium mb-2">Upline (Hierarchy)</p>
                  <div className="flex gap-2">
                    <Select value={pendingUpline} onValueChange={setPendingUpline}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— No upline (root) —</SelectItem>
                        {agents
                          .filter((a) => a.id !== selected.id)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.first_name} {a.last_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={saveUpline}
                      disabled={savingUpline || pendingUpline === (selected.upline_id ?? "none")}
                      size="sm"
                    >
                      {savingUpline ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <CompLevelEditor
                    agentId={selected.id}
                    agentName={`${selected.first_name} ${selected.last_name}`}
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
