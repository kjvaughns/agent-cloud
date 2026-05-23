import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Newspaper, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { listNewsArticles } from "@/lib/news.functions";

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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Newspaper className="h-6 w-6" /> News Feed
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stay informed with the latest insurance industry insights and market developments
        </p>
        <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
          <span>Last updated: {dataUpdatedAt ? format(new Date(dataUpdatedAt), "MMM d, yyyy 'at' h:mm a") : "—"}</span>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

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
        <div className="text-center py-20 border rounded-lg">
          <Newspaper className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="mt-4 font-medium">News feed is currently unavailable.</p>
          <p className="text-sm text-muted-foreground">Please check back later.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((a) => (
            <Card key={a.id} className="hover:shadow-md transition">
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex items-center justify-between mb-3">
                  {a.category && <Badge variant="secondary">{a.category}</Badge>}
                  {a.source_name && <span className="text-xs text-muted-foreground">{a.source_name}</span>}
                </div>
                <h3 className="font-semibold text-base leading-snug mb-2 line-clamp-2">{a.title}</h3>
                {a.summary && <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{a.summary}</p>}
                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                  <span>{a.published_at ? format(new Date(a.published_at), "MMM d, yyyy") : ""}</span>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    Read <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
