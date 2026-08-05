import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listTasks, createTask, updateTask, deleteTask, type Task,
} from "@/lib/tasks.functions";
import { listOrgMembers } from "@/lib/permissions.functions";
import { ScopeToggle } from "@/components/scope-toggle";
import { useScope } from "@/hooks/use-scope";
import { SCOPES, emptyScopeMessage, type Scope } from "@/lib/scope";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Agent Cloud" }] }),
  validateSearch: (s: Record<string, unknown>): { scope?: Scope } => ({
    scope: SCOPES.includes(s.scope as Scope) ? (s.scope as Scope) : undefined,
  }),
  component: TasksPage,
});

const PRIORITY_TONE: Record<string, string> = {
  urgent: "text-destructive",
  high: "text-warning",
  normal: "text-muted-foreground",
  low: "text-text-dim",
};

const today = () => new Date().toISOString().slice(0, 10);

function dueLabel(due: string | null) {
  if (!due) return null;
  const t = today();
  if (due < t) return { text: "Overdue", tone: "text-destructive" };
  if (due === t) return { text: "Due today", tone: "text-warning" };
  const d = new Date(due + "T00:00:00");
  return { text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), tone: "text-muted-foreground" };
}

function TasksPage() {
  const qc = useQueryClient();
  const { scope, ready: scopeReady, caps } = useScope();
  // Separate from scope: this asks whose task it is, not how wide to look.
  const [assignedByMe, setAssignedByMe] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const listFn = useServerFn(listTasks);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);

  const { data, isLoading } = useQuery({
    enabled: scopeReady,
    queryKey: ["tasks", scope, assignedByMe, showDone],
    queryFn: () => listFn({ data: { scope, assignedByMe, status: showDone ? "all" : "open" } }),
  });

  const tasks = (data?.tasks ?? []) as Task[];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const toggle = useMutation({
    mutationFn: (t: Task) => updateFn({ data: { id: t.id, status: t.status === "done" ? "open" : "done" } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update task"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Task deleted"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't delete task"),
  });

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const overdue = open.filter((t) => t.due_date && t.due_date < today()).length;
  const dueToday = open.filter((t) => t.due_date === today()).length;

  return (
    <PageShell>
      <div className="max-w-[1000px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Tasks"
          subtitle="Follow-ups, reminders, and work assigned across your team"
          actions={<NewTaskDialog onCreated={invalidate} />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--gap)]">
          <Panel><StatTile label="Open" value={String(open.length)} /></Panel>
          <Panel><StatTile label="Due Today" value={String(dueToday)} tone={dueToday > 0 ? "gold" : undefined} /></Panel>
          <Panel><StatTile label="Overdue" value={String(overdue)} tone={overdue > 0 ? "red" : undefined} /></Panel>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <ScopeToggle />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={assignedByMe} onCheckedChange={(v) => setAssignedByMe(!!v)} />
              Assigned by me
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={showDone} onCheckedChange={(v) => setShowDone(!!v)} />
            Show completed
          </label>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : tasks.length === 0 ? (
          <Panel>
            <div className="py-12 text-center space-y-2">
              <div className="font-medium">Nothing here yet.</div>
              <p className="text-sm text-muted-foreground">
                {assignedByMe
                  ? "Tasks you assign to other people will appear here."
                  : emptyScopeMessage(scope, caps, "tasks")}
              </p>
            </div>
          </Panel>
        ) : (
          <Panel pad={false} className="overflow-hidden">
            <ul className="divide-y divide-border-soft">
              {tasks.map((t) => {
                const due = dueLabel(t.due_date);
                const done = t.status === "done";
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
                    <Checkbox
                      className="mt-0.5"
                      checked={done}
                      onCheckedChange={() => toggle.mutate(t)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-sm font-medium", done && "line-through text-muted-foreground")}>
                        {t.title}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {due && !done && (
                          <span className={cn("text-[11px] font-medium", due.tone)}>{due.text}</span>
                        )}
                        {t.priority !== "normal" && (
                          <span className={cn("text-[11px] font-medium capitalize", PRIORITY_TONE[t.priority])}>
                            {t.priority}
                          </span>
                        )}
                        {scope !== "mine" && t.assignee_name && (
                          <Badge variant="secondary" className="text-[10px]">{t.assignee_name}</Badge>
                        )}
                        {t.related_type && (
                          <Badge variant="outline" className="text-[10px] capitalize">{t.related_type}</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => remove.mutate(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

function NewTaskDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string>("__self__");

  const createFn = useServerFn(createTask);
  const membersFn = useServerFn(listOrgMembers);

  // Only used to populate the assignee picker; failure just means self-assign.
  const { data: members } = useQuery({
    queryKey: ["org-members", "task-assign"],
    queryFn: () => membersFn(),
    enabled: open,
    retry: false,
  });

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("normal"); setDueDate(""); setAssignee("__self__");
  };

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          priority: priority as any,
          due_date: dueDate || null,
          assigned_to: assignee === "__self__" ? undefined : assignee,
        },
      }),
    onSuccess: () => {
      toast.success("Task created");
      setOpen(false);
      reset();
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't create task"),
  });

  const roster = ((members as any)?.members ?? []) as any[];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Task</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call back about the term quote" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Details (optional)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[70px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low", "normal", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Due date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {roster.length > 0 && (
            <div>
              <label className="text-xs font-medium mb-1 block">Assign to</label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__self__">Myself</SelectItem>
                  {roster.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
