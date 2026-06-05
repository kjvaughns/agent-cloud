import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProspects, getRecruitingStats } from "@/lib/recruiting.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Sparkles } from "lucide-react";
import { NurtureDialog } from "@/components/ai/nurture-dialog";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/back-office/recruiting-tracker")({
  component: RecruitingTrackerPage,
});

const STAGE_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-slate-500" },
  callback: { label: "Callback", color: "bg-sky-500" },
  in_course: { label: "In Course", color: "bg-amber-500" },
  getting_licensed: { label: "Getting Licensed", color: "bg-violet-500" },
  onboarded: { label: "Onboarded", color: "bg-emerald-500" },
};
const STAGES = ["new", "callback", "in_course", "getting_licensed", "onboarded"] as const;

function initials(first?: string | null, last?: string | null) {
  return `${(first?.[0] ?? "").toUpperCase()}${(last?.[0] ?? "").toUpperCase()}` || "?";
}

function RecruitingTrackerPage() {
  const listFn = useServerFn(listProspects);
  const statsFn = useServerFn(getRecruitingStats);
  const stats = useQuery({ queryKey: ["recruiting-stats"], queryFn: () => statsFn() });
  const prospects = useQuery({ queryKey: ["recruiting-prospects"], queryFn: () => listFn() });

  const [nurtureFor, setNurtureFor] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STAGES.map((s) => (
          <Card key={s}>
            <CardContent className="p-4">
              <div className={`h-1 w-12 rounded-full ${STAGE_META[s].color} mb-3`} />
              <div className="text-3xl font-bold">{stats.data?.counts?.[s] ?? 0}</div>
              <div className="text-sm text-muted-foreground">{STAGE_META[s].label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
        <CardContent className="p-0">
          {prospects.isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !prospects.data?.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No prospects yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recruit</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">AI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.data.map((r: any) => {
                  const name = `${r.first_name} ${r.last_name}`;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{initials(r.first_name, r.last_name)}</AvatarFallback></Avatar>
                          <span className="font-medium">{name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.source ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{STAGE_META[r.stage]?.label ?? r.stage}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setNurtureFor({ id: r.id, name })}>
                          <Sparkles className="h-3 w-3 mr-1" /> Nurture
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {nurtureFor && (
        <NurtureDialog
          prospectId={nurtureFor.id}
          prospectName={nurtureFor.name}
          open={!!nurtureFor}
          onOpenChange={(o) => !o && setNurtureFor(null)}
        />
      )}
    </div>
  );
}
