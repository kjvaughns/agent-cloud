import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import DOMPurify from "isomorphic-dompurify";
import { format } from "date-fns";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listAnnouncements, canPostAnnouncements, createAnnouncement,
} from "@/lib/announcements.functions";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({ meta: [{ title: "Announcements — Agent Cloud" }] }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const list = useServerFn(listAnnouncements);
  const canPost = useServerFn(canPostAnnouncements);

  const { data: items, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => list(),
  });
  const { data: perm } = useQuery({
    queryKey: ["announcements-perm"],
    queryFn: () => canPost(),
  });

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto">
        <HeroBand
          title={<span className="flex items-center gap-2"><Megaphone className="h-6 w-6" /> Announcements</span>}
          subtitle="Updates from your agency"
          actions={perm?.canPost ? <NewAnnouncementDialog /> : undefined}
        >
          {isLoading ? (
            <div className="space-y-3 mt-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : !items?.length ? (
            <div className="text-center py-20 rounded-[var(--radius)] border border-border bg-card mt-2">
              <Megaphone className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="mt-4 text-lg font-medium">No announcements yet.</p>
              <p className="text-sm text-muted-foreground">Check back for updates from your agency.</p>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              {items.map((a: any) => <AnnouncementCard key={a.id} a={a} />)}
            </div>
          )}
        </HeroBand>
      </div>
    </PageShell>
  );
}

function AnnouncementCard({ a }: { a: any }) {
  const [expanded, setExpanded] = useState(false);
  const author = a.profiles ? `${a.profiles.first_name ?? ""} ${a.profiles.last_name ?? ""}`.trim() : "Admin";
  const clean = DOMPurify.sanitize(a.body_html ?? "", { USE_PROFILES: { html: true } });
  const isLong = (a.body_html?.length ?? 0) > 400;
  return (
    <Panel>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-gold-bright" />
            {a.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Posted by {author || "Admin"}
          </p>
        </div>
        <div className="text-xs text-muted-foreground shrink-0 tnum">
          {format(new Date(a.created_at), "MMM d, yyyy")}
        </div>
      </div>
      <div
        className={isLong && !expanded ? "prose prose-sm dark:prose-invert max-w-none line-clamp-3" : "prose prose-sm dark:prose-invert max-w-none"}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {isLong && (
        <Button variant="link" size="sm" className="px-0 mt-2" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "Read more"}
        </Button>
      )}
    </Panel>
  );
}

function NewAnnouncementDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const create = useServerFn(createAnnouncement);
  const qc = useQueryClient();

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[160px] focus:outline-none border rounded-md p-3",
      },
    },
  });

  const mut = useMutation({
    mutationFn: () =>
      create({ data: { title: title.trim(), bodyHtml: editor?.getHTML() ?? "" } }),
    onSuccess: () => {
      toast.success("Announcement published");
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setOpen(false);
      setTitle("");
      editor?.commands.clearContent();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> New Announcement</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Announcement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" />
          </div>
          <div>
            <Label className="mb-2 block">Body</Label>
            <div className="flex gap-1 mb-2">
              <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBold().run()}><b>B</b></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                const url = prompt("URL");
                if (url) editor?.chain().focus().setLink({ href: url }).run();
              }}>Link</Button>
            </div>
            <EditorContent editor={editor} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={!title.trim() || mut.isPending}>
            {mut.isPending ? "Publishing..." : "Publish Announcement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
