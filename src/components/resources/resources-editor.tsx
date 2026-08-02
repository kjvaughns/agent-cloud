
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2, BookOpen, Copy } from "lucide-react";
import { toast } from "sonner";
import { PageShell, Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  listManagedResources, saveResource, deleteResource,
} from "@/lib/resources-admin.functions";


/**
 * The agency's handbook, scripts and courses.
 *
 * Until now these were one set of rows shared by every agency, seeded in a
 * migration, with no way to edit them from anywhere in the app. So a new
 * agency's handbook was somebody else's handbook and stayed that way.
 *
 * The list mixes the platform's defaults with the agency's own. Editing a
 * default takes a copy first — nothing here can change what another agency
 * reads — and the badge says which is which so that is not a surprise.
 */

type Kind = "handbook_sections" | "scripts" | "academy_courses";

const FIELDS: Record<Kind, { key: string; label: string; long?: boolean; required?: boolean }[]> = {
  handbook_sections: [
    { key: "title", label: "Title", required: true },
    { key: "slug", label: "Slug", required: true },
    { key: "content_html", label: "Content", long: true },
  ],
  scripts: [
    { key: "title", label: "Title", required: true },
    { key: "short_description", label: "One-line description" },
    { key: "content_markdown", label: "Script", long: true },
  ],
  academy_courses: [
    { key: "title", label: "Title", required: true },
    { key: "slug", label: "Slug", required: true },
    { key: "category", label: "Category", required: true },
    { key: "description", label: "Description", long: true },
  ],
};

const TAB_LABEL: Record<Kind, string> = {
  handbook_sections: "Handbook",
  scripts: "Scripts",
  academy_courses: "Academy",
};

export function ResourcesPage() {
  const listFn = useServerFn(listManagedResources);
  const { data, isLoading } = useQuery({
    queryKey: ["managed-resources"],
    queryFn: () => listFn(),
  });

  if (isLoading) {
    return (
      <PageShell>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </PageShell>
    );
  }

  if (data?.pendingSetup) {
    return (
      <PageShell>
        <Panel>
          <p className="text-sm text-muted-foreground">
            This page is waiting on a workspace update. Nothing is wrong with your account — the
            database changes it needs haven't been applied yet.
          </p>
        </Panel>
      </PageShell>
    );
  }

  if (!data?.canManage) {
    return (
      <PageShell>
        <Panel>
          <p className="text-sm text-muted-foreground">
            Editing your agency's handbook, scripts and courses is available to the agency owner,
            and to managers and staff granted “Manage resources” on the Roles page.
          </p>
        </Panel>
      </PageShell>
    );
  }

  const lists: Record<Kind, any[]> = {
    handbook_sections: data.handbook,
    scripts: data.scripts,
    academy_courses: data.courses,
  };

  return (
    <PageShell>
      <div className="space-y-4">
        <Panel>
          <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Resources
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What your agents read. Items marked <em>Platform default</em> are Agent Cloud's —
            editing one makes your agency's own version, and the original stays untouched for
            everyone else.
          </p>
        </Panel>

        <Tabs defaultValue="handbook_sections">
          <TabsList>
            {(Object.keys(TAB_LABEL) as Kind[]).map((k) => (
              <TabsTrigger key={k} value={k}>{TAB_LABEL[k]}</TabsTrigger>
            ))}
          </TabsList>
          {(Object.keys(TAB_LABEL) as Kind[]).map((k) => (
            <TabsContent key={k} value={k} className="mt-4">
              <ResourceList kind={k} rows={lists[k]} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </PageShell>
  );
}

function ResourceList({ kind, rows }: { kind: Kind; rows: any[] }) {
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  if (editing || creating) {
    return (
      <ResourceEditor
        kind={kind}
        row={editing}
        onDone={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setCreating(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add {TAB_LABEL[kind].replace(/s$/, "").toLowerCase()}
      </Button>

      {rows.length === 0 ? (
        <Panel>
          <div className="py-10 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-text-dim" />
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          </div>
        </Panel>
      ) : (
        <Panel pad={false} className="overflow-hidden">
          <ul className="divide-y divide-border-soft">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{r.title}</span>
                    {r.organization_id ? (
                      r.forked_from
                        ? <Badge variant="outline" className="text-[10px]">Your version</Badge>
                        : <Badge variant="outline" className="text-[10px]">Yours</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Platform default</Badge>
                    )}
                    {kind === "academy_courses" && (
                      <span className="text-[11px] text-muted-foreground">
                        {r.module_count ?? 0} lesson{(r.module_count ?? 0) === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {(r.short_description || r.description || r.slug) && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {r.short_description || r.description || r.slug}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                    {r.organization_id
                      ? <><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</>
                      : <><Copy className="mr-1 h-3.5 w-3.5" /> Make ours</>}
                  </Button>
                  {r.organization_id && <DeleteButton kind={kind} id={r.id} />}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function DeleteButton({ kind, id }: { kind: Kind; id: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(deleteResource);
  const [armed, setArmed] = useState(false);
  const mut = useMutation({
    mutationFn: () => fn({ data: { table: kind, id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["managed-resources"] });
    },
    onError: (e: any) => { setArmed(false); toast.error(e?.message ?? "Couldn't delete"); },
  });

  return (
    <Button
      size="sm"
      variant="ghost"
      className={armed ? "text-destructive" : ""}
      disabled={mut.isPending}
      onClick={() => (armed ? mut.mutate() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {mut.isPending
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : armed ? "Really?" : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  );
}

function ResourceEditor({ kind, row, onDone }: { kind: Kind; row: any | null; onDone: () => void }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveResource);
  const fields = FIELDS[kind];

  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, row?.[f.key] ?? ""])),
  );

  const missing = fields.filter((f) => f.required && !form[f.key]?.trim()).map((f) => f.label);

  const mut = useMutation({
    mutationFn: () => saveFn({ data: { table: kind, id: row?.id, patch: form } }),
    onSuccess: () => {
      toast.success(row && !row.organization_id ? "Your agency's version created" : "Saved");
      qc.invalidateQueries({ queryKey: ["managed-resources"] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save"),
  });

  return (
    <Panel>
      <div className="space-y-4">
        {row && !row.organization_id && (
          <p className="rounded-[var(--radius)] border border-primary/40 bg-gold-glow p-3 text-sm">
            This is a platform default. Saving makes your agency's own copy — the original stays
            as it is for everyone else.
          </p>
        )}

        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label>{f.label}{f.required && " *"}</Label>
            {f.long ? (
              <Textarea
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="min-h-[180px] font-mono text-xs"
              />
            ) : (
              <Input
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            )}
          </div>
        ))}

        <div className="flex items-center gap-2">
          <Button onClick={() => mut.mutate()} disabled={missing.length > 0 || mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          {missing.length > 0 && (
            <span className="text-xs text-muted-foreground">Needs {missing.join(", ")}</span>
          )}
        </div>
      </div>
    </Panel>
  );
}
