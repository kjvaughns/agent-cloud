import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bold, Italic, List, ListOrdered, X, Plus, Heart } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logContact } from "@/lib/pipeline.functions";
import { toast } from "sonner";

export function NotesTab({ clientId, entries }: { clientId: string; entries: any[] }) {
  const qc = useQueryClient();
  const fn = useServerFn(logContact);
  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: { attributes: { class: "prose prose-sm dark:prose-invert max-w-none min-h-32 p-3 focus:outline-none" } },
  });

  const saveMut = useMutation({
    mutationFn: (isMedical: boolean) =>
      fn({ data: { client_id: clientId, contact_type: isMedical ? "medical_note" : "note", note: editor?.getHTML() ?? "" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline", "detail", clientId] });
      editor?.commands.clearContent();
      toast.success("Note added");
    },
  });

  if (!editor) return null;

  const btn = "h-7 w-7 grid place-items-center rounded hover:bg-muted";
  return (
    <div className="space-y-3">
      <div className="border rounded-md">
        <div className="flex items-center gap-1 border-b p-1">
          <button type="button" className={cn(btn, editor.isActive("bold") && "bg-muted")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></button>
          <button type="button" className={cn(btn, editor.isActive("italic") && "bg-muted")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></button>
          <button type="button" className={cn(btn, editor.isActive("bulletList") && "bg-muted")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></button>
          <button type="button" className={cn(btn, editor.isActive("orderedList") && "bg-muted")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></button>
          <button type="button" className={btn} onClick={() => editor.commands.clearContent()}><X className="h-3.5 w-3.5" /></button>
        </div>
        <EditorContent editor={editor} />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => saveMut.mutate(false)} disabled={editor.isEmpty}><Plus className="h-4 w-4" /> Add Note</Button>
        <Button variant="outline" onClick={() => saveMut.mutate(true)} disabled={editor.isEmpty}><Heart className="h-4 w-4 text-blue-500" /> Medical Note</Button>
      </div>

      <div className="space-y-2 pt-2">
        {entries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No notes yet.</div>
        ) : entries.map((n: any) => {
          const medical = n.contact_type === "medical_note";
          return (
            <div key={n.id} className={cn("border rounded-md p-3 text-sm", medical && "border-blue-300 bg-blue-50 dark:bg-blue-950/20")}>
              <div className="text-xs font-semibold mb-1">
                {medical && <span className="text-blue-600 mr-1">💙 MEDICAL NOTE —</span>}
                {new Date(n.created_at).toLocaleDateString()}
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(n.note ?? "") }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
