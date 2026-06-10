import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bold, Italic, List, ListOrdered, X, Plus, Heart, Pencil, Check } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "isomorphic-dompurify";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { logContact, upsertClientHealth } from "@/lib/pipeline.functions";
import { toast } from "sonner";

type Category = "medical" | "height" | "weight" | "physician" | "tobacco";

const CHIPS: { key: Category; label: string; activeCls: string }[] = [
  { key: "medical",   label: "Medical",   activeCls: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900" },
  { key: "height",    label: "Height",    activeCls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" },
  { key: "weight",    label: "Weight",    activeCls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" },
  { key: "physician", label: "Physician", activeCls: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900" },
  { key: "tobacco",   label: "Tobacco",   activeCls: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900" },
];

const CHIP_BASE = "px-2.5 py-1 rounded-full border text-[11px] font-medium transition select-none";
const CHIP_INACTIVE = "bg-card text-muted-foreground hover:bg-muted";

/** Try to parse the body into a structured value for the given category. */
function parseStructured(category: Category, body: string): Record<string, unknown> | null {
  const text = body.replace(/<[^>]+>/g, " ").trim(); // strip HTML
  if (!text) return null;
  switch (category) {
    case "height": {
      // 5'7", 5 ft 7, 5-7
      const m = text.match(/(\d+)\s*['ft\s\-]+(\d{1,2})/i);
      if (m) return { height_ft: Number(m[1]), height_in: Math.min(11, Number(m[2])) };
      return null;
    }
    case "weight": {
      const m = text.match(/(\d{2,3})/);
      return m ? { weight_lbs: Number(m[1]) } : null;
    }
    case "tobacco": {
      const yes = /\b(yes|y|smoker|tobacco|chew|vape|use)\b/i.test(text);
      const no = /\b(no|n|non[\s-]?smoker|none|never|quit)\b/i.test(text);
      if (yes && !no) return { tobacco_use: true };
      if (no && !yes) return { tobacco_use: false };
      return null;
    }
    case "physician": {
      // Grab first line as name; rest as notes/phone
      const phoneMatch = text.match(/(\d{3}[\s\-.)]*\d{3}[\s\-.]*\d{4})/);
      const firstLine = text.split(/\n|,/)[0]?.trim();
      const out: Record<string, unknown> = {};
      if (firstLine) out.primary_physician = firstLine.slice(0, 200);
      if (phoneMatch) out.primary_physician_phone = phoneMatch[1];
      return Object.keys(out).length ? out : null;
    }
    case "medical":
      return { medical_notes: text.slice(0, 5000) };
  }
}

function categoriesOf(entry: any): Set<Category> {
  // Encoded into contact_type as comma-separated; "medical_note" treated as medical.
  const raw = entry?.contact_type ?? "";
  const out = new Set<Category>();
  if (raw === "medical_note") out.add("medical");
  // Imported notes that came from the Medical Notes column get medical styling.
  if (raw === "imported_note" && /^\s*Medical\s*:/i.test(String(entry?.note ?? ""))) out.add("medical");
  for (const part of String(raw).split(/[,|]/)) {
    const k = part.trim().replace(/^cat:/, "");
    if (["medical", "height", "weight", "physician", "tobacco"].includes(k)) out.add(k as Category);
  }
  return out;
}

function isImported(entry: any): boolean {
  return entry?.contact_type === "imported_note"
    || (typeof entry?.note === "string" && entry.note.startsWith("[Imported from AgentLink]"));
}

function stripImportPrefix(note: string): string {
  return (note ?? "").replace(/^\[Imported from AgentLink\]\s*/, "");
}


export function NotesTab({ clientId, entries }: { clientId: string; entries: any[] }) {
  const qc = useQueryClient();
  const logFn = useServerFn(logContact);
  const healthFn = useServerFn(upsertClientHealth);
  const [active, setActive] = useState<Set<Category>>(new Set());
  const [hasContent, setHasContent] = useState(false);

  const isMedical = active.has("medical");

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    onUpdate: ({ editor: e }) => setHasContent(!e.isEmpty),
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none min-h-32 p-3 focus:outline-none transition-colors",
        ),
      },
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const html = editor?.getHTML() ?? "";
      const cats = Array.from(active);
      // Encode category in contact_type field (no migration required).
      const contactType =
        cats.length === 0 ? "note"
        : cats.length === 1 && cats[0] === "medical" ? "medical_note"
        : `cat:${cats.join(",")}`;

      // 1) save the note
      await logFn({ data: { client_id: clientId, contact_type: contactType, note: html } });

      // 2) for structured chips, also update client_health
      const patch: Record<string, unknown> = {};
      for (const c of cats) {
        const v = parseStructured(c, html);
        if (v) Object.assign(patch, v);
      }
      if (Object.keys(patch).length) {
        try {
          await healthFn({ data: { client_id: clientId, ...patch } as any });
        } catch (e) {
          console.warn("[notes] health upsert failed", (e as Error).message);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", clientId] });
      editor?.commands.clearContent();
      setHasContent(false);
      setActive(new Set());
      toast.success("Note added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  if (!editor) return null;

  const btn = "h-7 w-7 grid place-items-center rounded hover:bg-muted";
  return (
    <div className="space-y-3">
      {/* Composer */}
      <div className={cn("border rounded-md transition-colors", isMedical && "border-red-400 ring-1 ring-red-300 dark:border-red-700 dark:ring-red-900")}>
        <div className="flex items-center gap-1 border-b p-1">
          <button type="button" className={cn(btn, editor.isActive("bold") && "bg-muted")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></button>
          <button type="button" className={cn(btn, editor.isActive("italic") && "bg-muted")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></button>
          <button type="button" className={cn(btn, editor.isActive("bulletList") && "bg-muted")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></button>
          <button type="button" className={cn(btn, editor.isActive("orderedList") && "bg-muted")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></button>
          <button type="button" className={btn} onClick={() => { editor.commands.clearContent(); setActive(new Set()); }}><X className="h-3.5 w-3.5" /></button>
        </div>
        <EditorContent editor={editor} />
      </div>

      {/* Category chips — toggling tags the draft, doesn't save it */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground mr-1">Tag:</span>
        {CHIPS.map((c) => {
          const isOn = active.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() =>
                setActive((prev) => {
                  const n = new Set(prev);
                  n.has(c.key) ? n.delete(c.key) : n.add(c.key);
                  return n;
                })
              }
              className={cn(CHIP_BASE, isOn ? c.activeCls : CHIP_INACTIVE)}
            >
              {isOn && <Check className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
              {c.key === "medical" && <Heart className={cn("inline h-3 w-3 mr-0.5 -mt-0.5", isOn && "fill-current")} />}
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Save */}
      <div className="flex gap-2">
        <Button onClick={() => saveMut.mutate()} disabled={!hasContent || saveMut.isPending}>
          <Plus className="h-4 w-4" /> Add Note
        </Button>
        <span className="text-[11px] text-muted-foreground self-center">
          Only this button saves. Tag chips just label the draft.
        </span>
      </div>

      {/* Saved notes */}
      <div className="space-y-2 pt-2">
        {entries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No notes yet.</div>
        ) : entries.map((n: any) => (
          <SavedNote key={n.id} entry={n} clientId={clientId} />
        ))}
      </div>
    </div>
  );
}

function SavedNote({ entry, clientId }: { entry: any; clientId: string }) {
  const qc = useQueryClient();
  const logFn = useServerFn(logContact);
  const cats = useMemo(() => categoriesOf(entry), [entry]);
  const medical = cats.has("medical");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(() => (entry.note ?? "").replace(/<[^>]+>/g, ""));

  const saveMut = useMutation({
    mutationFn: async (newHtml: string) => {
      // No dedicated update endpoint — log as edit + supersede; cheapest path is direct supabase update,
      // but contact_history table has RLS scoped to agent. We re-insert and the UI shows the latest.
      await logFn({ data: { client_id: clientId, contact_type: entry.contact_type ?? "note", note: newHtml } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", clientId] });
      toast.success("Note updated");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className={cn(
      "border rounded-md p-3 text-sm",
      medical && "border-red-400 bg-red-50 dark:border-red-900 dark:bg-red-950/20",
    )}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-xs font-semibold flex flex-wrap items-center gap-1">
          {isImported(entry) && (
            <span className="px-1.5 py-0.5 rounded-full border text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
              AgentLink Import
            </span>
          )}
          {Array.from(cats).map((c) => (
            <span key={c} className={cn(
              "px-1.5 py-0.5 rounded-full border text-[10px] uppercase tracking-wide",
              c === "medical" && "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
              c !== "medical" && "bg-muted text-muted-foreground",
            )}>{c}</span>
          ))}
          <span className="text-muted-foreground font-normal">
            {new Date(entry.created_at).toLocaleString()}
          </span>
        </div>
        <button
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? "Cancel" : "Edit"}
        >
          {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" disabled={saveMut.isPending} onClick={() => saveMut.mutate(draft)}>Save</Button>
          </div>
        </div>
      ) : (
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(stripImportPrefix(entry.note ?? "")) }}
        />
      )}
    </div>
  );
}
