import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFunnels, createFunnel, deleteFunnel } from "@/lib/recruiting.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Plus, Copy, Trash2, Megaphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/back-office/recruiting-funnels")({
  head: () => ({
    meta: [
      { title: "Recruiting Funnels — Agent Cloud" },
      { name: "description", content: "Build branded recruiting websites to attract licensed and unlicensed agents." },
    ],
  }),
  component: FunnelsPage,
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

function funnelUrl(slug: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/join/${slug}`;
}

function FunnelsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFunnels);
  const deleteFn = useServerFn(deleteFunnel);

  const { data: funnels = [], isLoading } = useQuery({
    queryKey: ["recruiting-funnels"],
    queryFn: () => listFn(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recruiting-funnels"] });
      toast.success("Funnel deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <CardContent className="pt-6 flex flex-col md:flex-row md:items-center gap-4">
          <Megaphone className="h-10 w-10 text-primary shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Your personal recruiting page</div>
            <p className="text-sm text-muted-foreground mt-1">
              Create a branded "Get Contracted Now" page with your name and contact info. Share the link on
              social media, job boards, or with prospects directly — every application lands in your
              Recruiting Tracker automatically.
            </p>
          </div>
          <CreateFunnelDialog />
        </CardContent>
      </Card>

      <section>
        <h2 className="text-lg font-semibold mb-3">My funnels</h2>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : funnels.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <div className="font-medium text-foreground">No funnels yet</div>
              <p className="text-sm mt-1">Create your first recruiting funnel above — it takes less than a minute.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {(funnels as any[]).map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {f.name}
                      {f.published && <Badge variant="secondary">Live</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">/join/{f.slug}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-right">
                      <div>{Number(f.page_views ?? 0).toLocaleString()} views</div>
                      <div className="text-muted-foreground text-xs">
                        {Number(f.applications ?? 0)} applications
                        {Number(f.production ?? 0) > 0 && ` · $${Math.round(Number(f.production)).toLocaleString()} recruited AP`}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Copy link" onClick={() => {
                      navigator.clipboard.writeText(funnelUrl(f.slug));
                      toast.success("Link copied");
                    }}><Copy className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Open" onClick={() => window.open(`/join/${f.slug}`, "_blank", "noopener,noreferrer")}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" className="text-muted-foreground hover:text-destructive" onClick={() => {
                      if (confirm(`Delete funnel "${f.name}"? The public link will stop working.`)) remove.mutate(f.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Recruiting resources</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Where to share your link</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1.5">
              <p>• Facebook groups for sales professionals and career changers</p>
              <p>• LinkedIn posts and direct messages</p>
              <p>• Indeed and ZipRecruiter job postings</p>
              <p>• Text it directly to warm referrals</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Who to recruit</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1.5">
              <p>• Hungry, coachable people with some sales experience</p>
              <p>• Career changers seeking remote, commission-based work</p>
              <p>• Licensed agents unhappy at their current agency</p>
              <p>• No insurance experience required — we train them</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">After they apply</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1.5">
              <p>• Applications appear in your Recruiting Tracker as New Inquiries</p>
              <p>• Call within 24 hours — speed wins recruits</p>
              <p>• Move them through stages: callback → course → licensing → onboarded</p>
              <p>• Send an Agent Cloud invite once they're licensed</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function CreateFunnelDialog() {
  const qc = useQueryClient();
  const createFn = useServerFn(createFunnel);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const create = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim(), slug: slug.trim() } }),
    onSuccess: (res: any) => {
      if (!res.ok) { toast.error(res.error); return; }
      qc.invalidateQueries({ queryKey: ["recruiting-funnels"] });
      setOpen(false);
      setName(""); setSlug(""); setSlugTouched(false);
      toast.success("Funnel created", {
        action: { label: "Copy link", onClick: () => navigator.clipboard.writeText(funnelUrl(res.funnel.slug)) },
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create funnel"),
  });

  const canSave = name.trim().length > 0 && slug.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New funnel</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Recruiting Funnel</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Funnel name</Label>
            <Input value={name} placeholder="e.g. Join My Team — Texas" onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }} />
          </div>
          <div className="space-y-1">
            <Label>Public URL</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/join/</span>
              <Input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} placeholder="join-my-team-tx" />
            </div>
            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens. Must be unique.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!canSave || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Creating..." : "Create funnel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
