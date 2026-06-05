import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

const AL_URL = "https://agentlink.insuracloud.ai";

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
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const requests = data?.requests ?? [];

  const toggleReveal = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const decodePassword = (encoded: string | null | undefined): string => {
    if (!encoded) return "—";
    try { return atob(encoded); } catch { return encoded; }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Download className="h-6 w-6" /> Import Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agents who requested a full AgentLink credential import. Review and complete each request manually.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={AL_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open AgentLink
          </a>
        </Button>
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
                <TableHead>Password</TableHead>
                <TableHead className="min-w-[200px]">Admin Notes</TableHead>
                <TableHead className="text-right">Update Status</TableHead>
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-muted-foreground">
                        {revealed.has(req.id)
                          ? decodePassword(req.agentlink_password_encrypted)
                          : "••••••••"}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleReveal(req.id)}
                        className="text-muted-foreground hover:text-foreground"
                        title={revealed.has(req.id) ? "Hide password" : "Reveal password"}
                      >
                        {revealed.has(req.id)
                          ? <EyeOff className="h-3.5 w-3.5" />
                          : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
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
                    <Select
                      value={req.status}
                      onValueChange={(val) =>
                        updateMut.mutate({
                          id: req.id,
                          status: val,
                          admin_notes: notes[req.id] ?? req.admin_notes,
                        })
                      }
                      disabled={updateMut.isPending}
                    >
                      <SelectTrigger className="h-8 text-xs w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
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
