import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import DOMPurify from "isomorphic-dompurify";
import { format } from "date-fns";
import { Megaphone, Plus, Mail, Users, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MENTIONS, MENTION_LABELS, type PostMention } from "@/lib/discord/mention";
import { getOrgEmailSettings } from "@/lib/email/org-settings.functions";
import {
  listAnnouncements, canPostAnnouncements, createAnnouncement,
} from "@/lib/announcements.functions";
import {
  AUDIENCE_LABELS, CHANNEL_LABELS, type Audience, type Channel,
} from "@/lib/announcements/audience";
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
          actions={perm?.canPost
            ? <NewAnnouncementDialog hasSubAgencies={Boolean(perm?.hasSubAgencies)} />
            : undefined}
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
      {/* What actually happened to this post, from the delivery ledger — not
          what was requested. A channel that failed does not get a badge. */}
      {(a.audience === "agency_and_subs" || (a.channels ?? []).length > 1) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {a.audience === "agency_and_subs" && (
            <Badge variant="secondary" className="gap-1">
              <Building2 className="h-3 w-3" /> Agency and sub-agencies
            </Badge>
          )}
          {(a.channels ?? [])
            .filter((c: string) => c !== "in_app")
            .map((c: string) => (
              <Badge key={c} variant="outline">{CHANNEL_LABELS[c as Channel] ?? c}</Badge>
            ))}
        </div>
      )}
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

function NewAnnouncementDialog({ hasSubAgencies }: { hasSubAgencies: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<Audience>("agency");
  // In the app is the feed itself, so it is not a choice. The other two are.
  const [channels, setChannels] = useState<Channel[]>(["in_app"]);
  // "default" leaves the ping to each Discord channel's own setting.
  const [discordMention, setDiscordMention] = useState<PostMention>("default");
  const create = useServerFn(createAnnouncement);
  const qc = useQueryClient();
  // So "email" is not a checkbox that quietly does nothing when the agency's
  // own email switch is off.
  const emailQ = useQuery({
    queryKey: ["org-email-settings"],
    queryFn: () => getOrgEmailSettings(),
  });

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
      create({ data: {
        title: title.trim(),
        bodyHtml: editor?.getHTML() ?? "",
        audience,
        channels,
        discordMention,
      } }),
    onSuccess: () => {
      toast.success("Announcement published");
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setOpen(false);
      setTitle("");
      setAudience("agency");
      setChannels(["in_app"]);
      setDiscordMention("default");
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

          {/* Who it reaches. The second option only exists for an agency that
              actually has children — an audience picker offering a choice you
              cannot make is a question with one answer. */}
          {hasSubAgencies && (
            <div>
              <Label className="mb-2 block">Who sees this</Label>
              <div className="space-y-1.5">
                {(["agency", "agency_and_subs"] as Audience[]).map((a) => (
                  <label key={a} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="announcement-audience"
                      checked={audience === a}
                      onChange={() => setAudience(a)}
                      className="accent-primary"
                    />
                    {AUDIENCE_LABELS[a]}
                  </label>
                ))}
              </div>
              {audience === "agency_and_subs" && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Paused and terminated sub-agencies are skipped.
                </p>
              )}
            </div>
          )}

          {/* How it goes out. In the app is the announcement itself, so it is
              shown on and cannot be turned off. */}
          <div>
            <Label className="mb-2 block">How it goes out</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked disabled />
                <Users className="h-3.5 w-3.5" /> {CHANNEL_LABELS.in_app} — always
              </label>
              {(["email", "discord"] as Channel[]).map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={channels.includes(c)}
                    onCheckedChange={(v) =>
                      setChannels((prev) => (v ? [...prev, c] : prev.filter((x) => x !== c)))}
                  />
                  {c === "email" ? <Mail className="h-3.5 w-3.5" /> : <Megaphone className="h-3.5 w-3.5" />}
                  {CHANNEL_LABELS[c]}
                </label>
              ))}
            </div>
            {channels.includes("discord") && (
              <div className="mt-3 rounded-md border bg-muted/30 p-3">
                <Label className="mb-1.5 block text-xs uppercase text-muted-foreground">
                  Discord ping
                </Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={discordMention}
                  onChange={(e) => setDiscordMention(e.target.value as PostMention)}
                >
                  <option value="default">Use each channel's setting</option>
                  {MENTIONS.map((m) => (
                    <option key={m} value={m}>{MENTION_LABELS[m]}</option>
                  ))}
                </select>
              </div>
            )}
            {channels.includes("email") && emailQ.data?.available && !emailQ.data.emailsEnabled && (
              <p className="mt-2 text-xs text-warning">
                Your agency currently sends no notification email, so this will reach
                the app and Discord only.{" "}
                <RouterLink to="/settings/agency" search={{ tab: "emails" } as any} className="underline">
                  Turn email on
                </RouterLink>
                .
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Email respects each person's notification preferences.{" "}
              <RouterLink to="/settings/agency" search={{ tab: "integrations" } as any} className="text-primary hover:underline">
                Set up Discord
              </RouterLink>
              {" "}if you have not yet.
            </p>
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
