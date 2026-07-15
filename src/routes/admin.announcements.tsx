import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listAnnouncements } from "@/lib/announcements.functions";
import {
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/admin/announcements")({
  component: AdminAnnouncements,
  head: () => ({ meta: [{ title: "Announcements — Agent Cloud Admin" }] }),
});

function AdminAnnouncements() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const data = await listAnnouncements();
    setItems(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!dialog?.title || !dialog?.body_html) return;
    setSaving(true);
    try {
      if (dialog.id) {
        await adminUpdateAnnouncement({ data: { id: dialog.id, title: dialog.title, body_html: dialog.body_html } });
      } else {
        await adminCreateAnnouncement({ data: { title: dialog.title, body_html: dialog.body_html } });
      }
      toast.success(dialog.id ? "Announcement updated" : "Announcement created");
      setDialog(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await adminDeleteAnnouncement({ data: { id: deleteTarget.id } });
      toast.success("Deleted");
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <PageShell>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage platform-wide announcements</p>
        </div>
        <Button onClick={() => setDialog({ title: "", body_html: "" })}>
          <Plus className="h-4 w-4 mr-1.5" />New Announcement
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No announcements yet</div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="border border-border rounded-lg p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: a.body_html?.replace(/<[^>]+>/g, " ").slice(0, 160) + "..." }} />
                <p className="text-xs text-muted-foreground mt-2">
                  {a.profiles ? `By ${a.profiles.first_name} ${a.profiles.last_name} · ` : ""}
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDialog({ ...a })}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(a)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.id ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                <Input value={dialog.title} onChange={(e) => setDialog({ ...dialog, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Body *</label>
                <Textarea
                  value={dialog.body_html}
                  onChange={(e) => setDialog({ ...dialog, body_html: e.target.value })}
                  placeholder="Announcement content (HTML supported)"
                  className="min-h-[140px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !dialog?.title || !dialog?.body_html}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
              {dialog?.id ? "Update" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove "{deleteTarget?.title}" for all agents.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PageShell>
  );
}
