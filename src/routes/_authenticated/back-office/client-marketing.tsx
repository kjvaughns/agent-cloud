import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLandingPages, quickDeployLandingPage, deleteLandingPage } from "@/lib/marketing.functions";
import { LANDING_TEMPLATES } from "@/lib/landing-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Copy, Trash2, Rocket } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/back-office/client-marketing")({
  head: () => ({
    meta: [
      { title: "Client Marketing — Agent Cloud" },
      { name: "description", content: "Publish landing pages to capture leads for life insurance, annuities, and more." },
    ],
  }),
  component: ClientMarketingPage,
});

function pageUrl(agentSlug: string, templateSlug: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/agent/${agentSlug}/${templateSlug}`;
}

function ClientMarketingPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLandingPages);
  const deployFn = useServerFn(quickDeployLandingPage);
  const deleteFn = useServerFn(deleteLandingPage);

  const { data, isLoading } = useQuery({
    queryKey: ["landing-pages"],
    queryFn: () => listFn(),
  });
  const pages = data?.pages ?? [];
  const agentSlug = data?.agentSlug ?? "";
  const deployedSlugs = useMemo(() => new Set(pages.map((p: any) => p.template_slug)), [pages]);

  const deploy = useMutation({
    mutationFn: (template_slug: string) => deployFn({ data: { template_slug } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["landing-pages"] });
      toast.success("Page is live", {
        action: {
          label: "Copy link",
          onClick: () => navigator.clipboard.writeText(pageUrl(res.agentSlug, res.page.template_slug)),
        },
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to publish page"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing-pages"] });
      toast.success("Page removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove page"),
  });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold mb-3">My landing pages</h2>
        {isLoading ? (
          <Skeleton className="h-28" />
        ) : pages.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <Rocket className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <div className="font-medium text-foreground">No pages published yet</div>
              <p className="text-sm mt-1">
                Pick a template below and click "Publish" — your personalized page goes live instantly with
                your name and contact info, and every lead it captures lands in your Leads inbox.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {(pages as any[]).map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      {p.title}
                      {p.published && <Badge variant="secondary">Live</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">/agent/{agentSlug}/{p.template_slug}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-right">
                      <div>{Number(p.lead_count ?? 0)} leads</div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Copy link" onClick={() => {
                      navigator.clipboard.writeText(pageUrl(agentSlug, p.template_slug));
                      toast.success("Link copied");
                    }}><Copy className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Open" onClick={() => window.open(`/agent/${agentSlug}/${p.template_slug}`, "_blank", "noopener,noreferrer")}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" className="text-muted-foreground hover:text-destructive" onClick={() => {
                      if (confirm(`Take down "${p.title}"? The public link will stop working.`)) remove.mutate(p.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Templates</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {LANDING_TEMPLATES.map((t) => {
            const live = deployedSlugs.has(t.slug);
            return (
              <Card key={t.slug} className="flex flex-col">
                <div className={`h-28 bg-gradient-to-br ${t.gradient} rounded-t-xl p-3 flex flex-col justify-end`}>
                  <div className="text-white text-sm font-semibold leading-tight line-clamp-2">{t.headline}</div>
                </div>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <Badge variant="outline" className="shrink-0 text-xs">{t.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 flex-1 flex flex-col">
                  <p className="text-sm text-muted-foreground flex-1">{t.shortDesc}</p>
                  {live ? (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(`/agent/${agentSlug}/${t.slug}`, "_blank", "noopener,noreferrer")}>
                      <ExternalLink className="h-4 w-4 mr-1" /> View live page
                    </Button>
                  ) : (
                    <Button size="sm" className="w-full" disabled={deploy.isPending} onClick={() => deploy.mutate(t.slug)}>
                      <Rocket className="h-4 w-4 mr-1" /> Publish
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
