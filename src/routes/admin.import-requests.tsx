import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Play, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { adminListScrapeRequests, adminUpdateScrapeRequest } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/import-requests")({
  head: () => ({ meta: [{ title: "Import Requests — Admin" }] }),
  component: ImportRequestsPage,
});

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function ImportRequestsPage() {
  const listFn = useServerFn(adminListScrapeRequests);
  const updateFn = useServerFn(adminUpdateScrapeRequest);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-scrape-requests"],
    queryFn: () => listFn(),
  });

  const updateMut = useMutation({
    mutationFn: (args: { id: string; status: any; admin_notes?: string }) =>
      updateFn({ data: args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-scrape-requests"] });
      toast.success("Request updated");
    },
    onError: (e: any) => toast.error(e?.message),
  });

  const [notes, setNotes] = useState<Record<string, string>>({});
  const requests = data?.requests ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Download className="h-6 w-6" /> Import Requests
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agents who requested a full AgentLink credential import. Review and complete each request manually.
        </p>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
          No import requests yet.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AL Username</TableHead>
                <TableHead className="min-w-[200px]">Admin Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req: any) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <div className="font-medium text-sm">
                      {req.profiles?.first_name} {req.profiles?.last_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{req.profiles?.email}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(req.submitted_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS[req.status] ?? ""}`}>
                      {req.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {req.agentlink_username}
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={notes[req.id] ?? req.admin_notes ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                      placeholder="Add notes…"
                      rows={2}
                      className="text-xs min-h-0"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col gap-1 items-end">
                      {req.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          disabled={updateMut.isPending}
                          onClick={() =>
                            updateMut.mutate({
                              id: req.id,
                              status: "in_progress",
                              admin_notes: notes[req.id] ?? req.admin_notes,
                            })
                          }
                        >
                          <Play className="h-3 w-3 mr-1" /> In Progress
                        </Button>
                      )}
                      {req.status !== "completed" && req.status !== "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 text-emerald-700 hover:text-emerald-700"
                          disabled={updateMut.isPending}
                          onClick={() =>
                            updateMut.mutate({
                              id: req.id,
                              status: "completed",
                              admin_notes: notes[req.id] ?? req.admin_notes,
                            })
                          }
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                        </Button>
                      )}
                      {req.status !== "failed" && req.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 text-destructive hover:text-destructive"
                          disabled={updateMut.isPending}
                          onClick={() =>
                            updateMut.mutate({
                              id: req.id,
                              status: "failed",
                              admin_notes: notes[req.id] ?? req.admin_notes,
                            })
                          }
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Failed
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
