import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, Loader2, BookOpen, Copy, Search, Eye, EyeOff,
  GraduationCap, ArrowRight, Layers, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell, Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@/hooks/use-server-fn";
import { cn } from "@/lib/utils";
import {
  listManagedResources, saveResource, deleteResource, forkResource,
} from "@/lib/resources-admin.functions";
import { RichText } from "@/components/resources/rich-text";
import { CourseBuilder } from "@/components/resources/course-builder";


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
 *
 * A course is not edited in this form. Its title and category are, but the
 * course itself is a curriculum, and that has its own page — the row is a way
 * in rather than the thing being edited.
 */

type Kind = "handbook_sections" | "scripts" | "academy_courses";

type FieldType = "text" | "textarea" | "rich" | "select" | "switch" | "number" | "color";

type Field = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
  /** Filled in from the title when creating, never rewritten afterwards. */
  slugFrom?: string;
  full?: boolean;
};

/** The `script_category` enum, with the labels the Scripts page already shows agents. */
const SCRIPT_CATEGORIES = [
  { value: "basic", label: "Opening" },
  { value: "needs_analysis", label: "Needs Analysis" },
  { value: "objection_handling", label: "Objections" },
  { value: "mortgage_protection", label: "Mortgage" },
  { value: "beneficiary", label: "Beneficiary" },
  { value: "check_in", label: "Follow-Up" },
];

const FIELDS: Record<Kind, Field[]> = {
  handbook_sections: [
    { key: "title", label: "Title", type: "text", required: true },
    {
      key: "slug", label: "Slug", type: "text", required: true, slugFrom: "title",
      hint: "Used in the link to this section. Unique within your agency.",
    },
    { key: "sort_order", label: "Order", type: "number" },
    {
      key: "content_html", label: "Section", type: "rich", full: true,
      hint: "What agents read. Existing sections open as HTML because they contain tables and layout the toolbar can't rebuild.",
    },
  ],
  scripts: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "category", label: "Category", type: "select", required: true, options: SCRIPT_CATEGORIES },
    { key: "sort_order", label: "Order", type: "number" },
    {
      key: "accent_color", label: "Accent", type: "color",
      hint: "The colour of the card on the Scripts page.",
    },
    {
      key: "short_description", label: "One-line description", type: "text", full: true,
      hint: "Shown on the card. One sentence on when to reach for this.",
    },
    {
      key: "content_html", label: "Script", type: "rich", full: true,
      hint: "What the agent reads out. This is the version the Scripts page shows.",
    },
    {
      key: "content_markdown", label: "Plain text version", type: "textarea", full: true,
      hint: "Optional. Used by anything that needs the script without markup — copy to clipboard, exports.",
    },
  ],
  academy_courses: [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "slug", label: "Slug", type: "text", required: true, slugFrom: "title" },
    { key: "category", label: "Category", type: "text", required: true },
    { key: "instructor_name", label: "Instructor", type: "text" },
    { key: "description", label: "Description", type: "textarea", full: true },
    { key: "published", label: "Published", type: "switch" },
  ],
};

const TAB_LABEL: Record<Kind, string> = {
  handbook_sections: "Handbook",
  scripts: "Scripts",
  academy_courses: "Agent Academy",
};

const NOUN: Record<Kind, string> = {
  handbook_sections: "section",
  scripts: "script",
  academy_courses: "course",
};

export function ResourcesPage() {
  const listFn = useServerFn(listManagedResources);
  const { data, isLoading } = useQuery({
    queryKey: ["managed-resources"],
    queryFn: () => listFn(),
  });

  /** Set while a course's curriculum is open. The list is behind it, not gone. */
  const [courseId, setCourseId] = useState<string | null>(null);

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

  if (courseId) {
    return (
      <PageShell>
        <CourseBuilder courseId={courseId} onBack={() => setCourseId(null)} />
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
              <ResourceList kind={k} rows={lists[k]} onOpenCourse={setCourseId} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </PageShell>
  );
}

function ResourceList({ kind, rows, onOpenCourse }: {
  kind: Kind; rows: any[]; onOpenCourse: (id: string) => void;
}) {
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.title, r.slug, r.category, r.short_description, r.description, r.instructor_name]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(needle)));
  }, [rows, q]);

  if (editing || creating) {
    return (
      <ResourceEditor
        kind={kind}
        row={editing}
        onDone={() => { setEditing(null); setCreating(false); }}
        onOpenCourse={onOpenCourse}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add {NOUN[kind]}
        </Button>
        {rows.length > 4 && (
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${TAB_LABEL[kind].toLowerCase()}`}
              className="h-9 pl-8"
            />
          </div>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tnum">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <div className="py-10 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-text-dim" />
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? "Nothing here yet." : "Nothing matches that."}
            </p>
          </div>
        </Panel>
      ) : (
        <Panel pad={false} className="overflow-hidden">
          <ul className="divide-y divide-border-soft">
            {filtered.map((r) => (
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
                    {kind === "academy_courses" && r.published === false && (
                      <Badge variant="warning" className="gap-1 text-[10px]">
                        <EyeOff className="h-2.5 w-2.5" /> Unpublished
                      </Badge>
                    )}
                    {kind === "scripts" && r.category && (
                      <span className="text-[11px] text-muted-foreground">
                        {SCRIPT_CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}
                      </span>
                    )}
                    {kind === "academy_courses" && (
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground tnum">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {r.module_count ?? 0} lesson{(r.module_count ?? 0) === 1 ? "" : "s"}
                        </span>
                        {(r.duration_minutes ?? 0) > 0 && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {r.duration_minutes} min</span>
                        )}
                      </span>
                    )}
                  </div>
                  {(r.short_description || r.description || r.slug) && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {r.short_description || r.description || r.slug}
                    </p>
                  )}
                  {kind === "academy_courses" && (r.module_count ?? 0) === 0 && r.organization_id && !r.url && (
                    <p className="mt-1 text-[11px] text-warning">
                      No lessons — agents open this and find an empty page.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {kind === "academy_courses" && (
                    <OpenCurriculum row={r} onOpenCourse={onOpenCourse} />
                  )}
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

/**
 * The way into a course's curriculum.
 *
 * A platform default has to be copied first — its lessons belong to Agent
 * Cloud and editing them would change what every other agency reads. Rather
 * than opening the builder read-only and refusing every save, this forks on
 * the click and opens the copy, which is what "build this course" meant.
 */
function OpenCurriculum({ row, onOpenCourse }: { row: any; onOpenCourse: (id: string) => void }) {
  const qc = useQueryClient();
  const forkFn = useServerFn(forkResource);

  const fork = useMutation({
    mutationFn: () => forkFn({ data: { table: "academy_courses", id: row.id } }),
    onSuccess: async (r: any) => {
      if (r.created) toast.success("Your agency's copy created — the original is untouched");
      await qc.invalidateQueries({ queryKey: ["managed-resources"] });
      onOpenCourse(r.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't copy that course"),
  });

  if (row.organization_id) {
    return (
      <Button size="sm" variant="outline" onClick={() => onOpenCourse(row.id)}>
        <GraduationCap className="mr-1 h-3.5 w-3.5" /> Curriculum
        <ArrowRight className="ml-1 h-3 w-3" />
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" disabled={fork.isPending} onClick={() => fork.mutate()}>
      {fork.isPending
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <><GraduationCap className="mr-1 h-3.5 w-3.5" /> Build ours</>}
    </Button>
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

function ResourceEditor({ kind, row, onDone, onOpenCourse }: {
  kind: Kind; row: any | null; onDone: () => void; onOpenCourse: (id: string) => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveResource);
  const fields = FIELDS[kind];

  const [form, setForm] = useState<Record<string, any>>(() =>
    Object.fromEntries(fields.map((f) => {
      const v = row?.[f.key];
      if (f.type === "switch") return [f.key, v === undefined ? true : Boolean(v)];
      if (f.type === "number") return [f.key, v ?? 0];
      if (f.type === "select") return [f.key, v ?? f.options?.[0]?.value ?? ""];
      return [f.key, v ?? ""];
    })),
  );

  const set = (k: string, v: any) => setForm((s) => ({ ...s, [k]: v }));

  const missing = fields
    .filter((f) => f.required && !String(form[f.key] ?? "").trim())
    .map((f) => f.label);

  const mut = useMutation({
    mutationFn: () => saveFn({ data: { table: kind, id: row?.id, patch: form } }),
    onSuccess: (r: any) => {
      const forked = row && !row.organization_id;
      toast.success(forked ? "Your agency's version created" : "Saved");
      qc.invalidateQueries({ queryKey: ["managed-resources"] });
      if (r?.id) qc.invalidateQueries({ queryKey: ["course-edit", r.id] });
      qc.invalidateQueries({ queryKey: ["academy"] });
      // A course somebody just created has no lessons, and the lessons are the
      // course. Land them where the work is rather than back on a list.
      if (kind === "academy_courses" && !row && r?.id) { onOpenCourse(r.id); return; }
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

        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className={cn("space-y-1", f.full && "md:col-span-2")}>
              {f.type !== "switch" && <Label>{f.label}{f.required && " *"}</Label>}

              {f.type === "rich" ? (
                <RichText value={form[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
              ) : f.type === "textarea" ? (
                <Textarea
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="min-h-[120px]"
                />
              ) : f.type === "select" ? (
                <Select value={form[f.key]} onValueChange={(v) => set(f.key, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {f.options!.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "switch" ? (
                <div className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {form[f.key] ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {f.label}
                  </div>
                  <Switch checked={Boolean(form[f.key])} onCheckedChange={(v) => set(f.key, v)} />
                </div>
              ) : f.type === "number" ? (
                <Input
                  type="number"
                  value={form[f.key] ?? 0}
                  onChange={(e) => set(f.key, Number(e.target.value) || 0)}
                />
              ) : f.type === "color" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={f.label}
                    value={/^#[0-9a-f]{6}$/i.test(form[f.key] ?? "") ? form[f.key] : "#c9a84c"}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <Input value={form[f.key] ?? ""} placeholder="#C9A84C"
                    onChange={(e) => set(f.key, e.target.value)} />
                </div>
              ) : (
                <Input
                  value={form[f.key] ?? ""}
                  onChange={(e) => {
                    set(f.key, e.target.value);
                    // Slugs fill in from the title only while creating. Changing
                    // a slug that already exists changes a link somebody saved.
                    const slugField = fields.find((x) => x.slugFrom === f.key);
                    if (slugField && !row && !form[slugField.key]) {
                      set(slugField.key,
                        e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }
                  }}
                />
              )}

              {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => mut.mutate()} disabled={missing.length > 0 || mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          {kind === "academy_courses" && row?.organization_id && (
            <Button variant="outline" onClick={() => onOpenCourse(row.id)}>
              <GraduationCap className="mr-1 h-4 w-4" /> Curriculum
            </Button>
          )}
          {missing.length > 0 && (
            <span className="text-xs text-muted-foreground">Needs {missing.join(", ")}</span>
          )}
        </div>
      </div>
    </Panel>
  );
}
