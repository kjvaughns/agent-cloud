import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { format } from "date-fns";
import { Newspaper, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { listNewsArticles } from "@/lib/news.functions";
import { PageShell, HeroBand } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/news-feed")({
  head: () => ({ meta: [{ title: "News Feed — Agent Cloud" }] }),
  component: NewsFeedPage,
});

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "Life Insurance", label: "Life Insurance" },
  { value: "Medicare", label: "Medicare" },
  { value: "Annuities", label: "Annuities" },
  { value: "Regulations", label: "Regulations" },
];

function NewsFeedPage() {
  const [cat, setCat] = useState("all");
  const list = useServerFn(listNewsArticles);
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["news", cat],
    queryFn: () => list({ data: { category: cat } }),
  });

  const items = data ?? [];

  return (
    <PageShell>
      <div className="max-w-5xl mx-auto">
        <HeroBand
          title={<span className="flex items-center gap-2"><Newspaper className="h-6 w-6" /> News Feed</span>}
          subtitle="Stay informed with the latest insurance industry insights and market developments"
          actions={
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="tnum">Last updated: {dataUpdatedAt ? format(new Date(dataUpdatedAt), "MMM d, yyyy 'at' h:mm a") : "—"}</span>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          }
        >
          <div className="mt-2 space-y-6">
            <Tabs value={cat} onValueChange={setCat}>
              <TabsList>
                {CATEGORIES.map((c) => (
                  <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
              </div>
            ) : !items.length ? (
              <div className="text-center py-20 border border-border rounded-[var(--radius)] bg-card">
                <Newspaper className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="mt-4 font-medium">News feed is currently unavailable.</p>
                <p className="text-sm text-muted-foreground">Please check back later.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {items.map((a) => (
                  <div key={a.id} className="rounded-[var(--radius)] border border-border bg-card p-5 flex flex-col h-full transition hover:bg-surface-2">
                    <div className="flex items-center justify-between mb-3">
                      {a.category && <Badge variant="secondary">{a.category}</Badge>}
                      {a.source_name && <span className="text-xs text-muted-foreground">{a.source_name}</span>}
                    </div>
                    <h3 className="font-semibold text-base leading-snug mb-2 line-clamp-2">{a.title}</h3>
                    {a.summary && <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{a.summary}</p>}
                    <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                      <span className="tnum">{a.published_at ? format(new Date(a.published_at), "MMM d, yyyy") : ""}</span>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-gold-bright hover:underline">
                        Read <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </HeroBand>
      </div>
    </PageShell>
  );
}
