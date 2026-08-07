import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminMoveAgent } from "@/lib/admin.functions";
import { getAllAgentsForHierarchy } from "@/lib/team.functions";

/**
 * Assign an agent to a manager.
 *
 * This was written, complete and working, and mounted nowhere. It sat in
 * routes/_authenticated/team.tsx with no reference to it anywhere in the file
 * — the only occurrence of the name was its own declaration.
 *
 * That is why the audit found "no UI anywhere to assign existing agents to a
 * manager", and it is the root of the rest of the Manager complaint: with
 * nobody assignable, downline_count stays 0, my_scopes() returns no team
 * scope, the scope switchers never render, and Team Command Center reads
 * "0 agents". One unmounted component, four symptoms.
 *
 * It lives here now so the agent drawer can render it, which is where somebody
 * looking at an agent would expect to change who that agent reports to.
 *
 * `adminMoveAgent` requires an admin role and refuses to create a cycle.
 */
export function MoveAgentSection({ agentId, currentUplineId }: { agentId: string; currentUplineId: string | null }) {
  const qc = useQueryClient();
  const allAgentsFn = useServerFn(getAllAgentsForHierarchy);
  const moveFn = useServerFn(adminMoveAgent);
  const [newUplineId, setNewUplineId] = useState("");

  const { data: allAgents = [] } = useQuery({
    queryKey: ["team", "allAgentsForHierarchy"],
    queryFn: () => allAgentsFn(),
  });

  const candidates = (allAgents as any[]).filter((a: any) => a.id !== agentId);
  const current = (allAgents as any[]).find((a: any) => a.id === currentUplineId);

  const move = useMutation({
    mutationFn: () => moveFn({ data: { agent_id: agentId, new_upline_id: newUplineId === "__none__" ? null : newUplineId } }),
    onSuccess: () => {
      toast.success("Upline updated");
      qc.invalidateQueries({ queryKey: ["team"] });
      setNewUplineId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Current upline: {current ? `${current.first_name} ${current.last_name}` : "None (root)"}
      </div>
      <Select value={newUplineId} onValueChange={setNewUplineId}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select new upline..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No upline (make root)</SelectItem>
          {candidates.map((a: any) => (
            <SelectItem key={a.id} value={a.id}>
              {a.first_name} {a.last_name} {a.email ? `(${a.email})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!newUplineId || move.isPending}
        onClick={() => move.mutate()}
      >
        {move.isPending ? "Moving..." : "Move Agent"}
      </Button>
    </div>
  );
}
