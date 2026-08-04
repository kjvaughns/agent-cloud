import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  addProducerNote, deleteProducerNote, listProducerActivity,
} from "@/lib/contracting-notes.functions";
import { cn } from "@/lib/utils";

/**
 * What has happened with this agent, in one column.
 *
 * Two sources, deliberately interleaved rather than tabbed: what somebody
 * wrote down and what the system recorded are the same story, and splitting
 * them makes the reader merge two timelines by eye. A note about a carrier
 * call means more sitting directly above the status change it explains.
 *
 * Notes default to internal. Marking one visible to the agent is a decision,
 * so it is a checkbox that has to be ticked rather than the other way round.
 */
export function ProducerNotesPanel({ agentId }: { agentId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProducerActivity);
  const addFn = useServerFn(addProducerNote);
  const deleteFn = useServerFn(deleteProducerNote);

  const [body, setBody] = useState("");
  const [shareWithAgent, setShareWithAgent] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["producer-activity", agentId],
    queryFn: () => listFn({ data: { agent_id: agentId } }),
    retry: false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["producer-activity", agentId] });

  const add = useMutation({
    mutationFn: (p: any) => addFn({ data: p }),
    onSuccess: () => { setBody(""); setShareWithAgent(false); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the note"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Could not remove the note"),
  });

  if (isLoading) return <Skeleton className="h-56 rounded-xl" />;

  const d = data as any;
  const notes = (d?.notes ?? []) as any[];
  const activity = (d?.activity ?? []) as any[];

  // One list, newest first. Notes and audit rows both carry created_at, which
  // is the only ordering either of them can honestly claim.
  const timeline = [
    ...notes.map((n) => ({ kind: "note" as const, at: n.created_at, row: n })),
    ...activity.map((a) => ({ kind: "event" as const, at: a.created_at, row: a })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return (
    <Panel title="Notes and activity">
      {d?.canWrite === false ? (
        <p className="text-[11px] text-text-dim">
          Notes are not available yet — this agency's database is still being updated.
          Everything below is the system's own record.
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Called Transamerica — rep says approval by Friday."
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={shareWithAgent}
                onChange={(e) => setShareWithAgent(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--gold)]"
              />
              The agent can see this
            </label>
            <Button
              size="sm"
              className="ml-auto"
              disabled={add.isPending || body.trim().length === 0}
              onClick={() => add.mutate({
                agent_id: agentId,
                body,
                visibility: shareWithAgent ? "agent_visible" : "internal",
              })}
            >
              {add.isPending ? "Saving…" : "Add note"}
            </Button>
          </div>
          <p className="text-[10px] text-text-dim">
            Notes are kept as written — they can be removed by whoever wrote them, but never edited.
          </p>
        </div>
      )}

      {timeline.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing recorded yet. The first note or status change appears here.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {timeline.slice(0, 60).map((t) => (
            <li
              key={`${t.kind}-${t.row.id}`}
              className={cn(
                "rounded-lg border px-3 py-2",
                t.kind === "note" ? "border-border bg-surface-2/40" : "border-border-soft",
              )}
            >
              {t.kind === "note" ? (
                <>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{t.row.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-text-dim">
                    <span>{t.row.author_name}</span>
                    <span>·</span>
                    <span>{new Date(t.row.created_at).toLocaleString()}</span>
                    {t.row.visibility === "agent_visible" && (
                      <span className="rounded-full border border-border px-1.5 py-px text-[9px] text-muted-foreground">
                        Agent can see this
                      </span>
                    )}
                    {t.row.mine && (
                      <button
                        onClick={() => remove.mutate(t.row.id)}
                        disabled={remove.isPending}
                        className="ml-auto inline-flex items-center gap-1 rounded p-0.5 transition-colors hover:text-destructive"
                        aria-label="Remove this note"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Bot className="h-3 w-3 shrink-0 text-text-dim" />
                  <span className="min-w-0 flex-1 truncate">
                    {String(t.row.action).replace(/[._]/g, " ")} — {t.row.actor_name}
                  </span>
                  <span className="shrink-0 text-[10px] text-text-dim">
                    {new Date(t.row.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
