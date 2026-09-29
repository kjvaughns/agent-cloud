import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { listWritingAgents, getWritingNumberFor } from "@/lib/post-deal.functions";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Who wrote this deal. Production and commissions follow this agent, and the
 * agent's writing number for the chosen carrier is shown so the poster can
 * confirm the business is filed under the right number.
 *
 * Hidden when the poster has no downline — there is nobody else to choose.
 */
export function WritingAgentPicker({
  value,
  onChange,
  carrierId,
  preferredAgentId,
}: {
  value: string;
  onChange: (id: string) => void;
  carrierId?: string;
  /** e.g. the client's owning agent; selected by default when postable. */
  preferredAgentId?: string | null;
}) {
  const listFn = useServerFn(listWritingAgents);
  const { data: agents = [] } = useQuery({
    queryKey: ["writing-agents"],
    queryFn: () => listFn(),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (value || agents.length === 0) return;
    const pref = preferredAgentId && agents.find((a) => a.id === preferredAgentId);
    onChange(pref ? pref.id : agents[0].id);
  }, [agents, preferredAgentId, value, onChange]);

  const wnFn = useServerFn(getWritingNumberFor);
  const { data: wn, isFetching } = useQuery({
    queryKey: ["writing-number", value, carrierId],
    queryFn: () => wnFn({ data: { agent_id: value, carrier_id: carrierId! } }),
    enabled: Boolean(value && carrierId),
  });

  if (agents.length <= 1) {
    return carrierId && value ? <WritingNumberLine wn={wn} loading={isFetching} /> : null;
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs">Writing agent</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Who wrote this deal?" /></SelectTrigger>
        <SelectContent>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Production and commissions go to this agent.</p>
      {carrierId && value && <WritingNumberLine wn={wn} loading={isFetching} />}
    </div>
  );
}

function WritingNumberLine({ wn, loading }: { wn?: { writing_number: string | null; status: string | null }; loading: boolean }) {
  if (loading && !wn) return <p className="text-xs text-muted-foreground">Checking writing number…</p>;
  if (!wn?.writing_number) {
    return <p className="text-xs text-warning">No writing number on file for this agent with this carrier.</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      Writing #: <span className="font-medium text-foreground">{wn.writing_number}</span>
      {wn.status && wn.status !== "active" ? ` (${wn.status})` : ""}
    </p>
  );
}
