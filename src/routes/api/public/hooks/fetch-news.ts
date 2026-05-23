import { createFileRoute } from "@tanstack/react-router";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FEEDS: { url: string; source: string; category: string }[] = [
  { url: "https://www.insurancejournal.com/news/national/feed/", source: "Insurance Journal", category: "Life Insurance" },
  { url: "https://www.thinkadvisor.com/feed/", source: "ThinkAdvisor", category: "Annuities" },
  { url: "https://content.naic.org/rss.xml", source: "NAIC", category: "Regulations" },
];

function categorize(text: string, fallback: string): string {
  const t = text.toLowerCase();
  if (t.includes("medicare")) return "Medicare";
  if (t.includes("annuity") || t.includes("annuities")) return "Annuities";
  if (t.includes("regulation") || t.includes("naic") || t.includes("compliance")) return "Regulations";
  if (t.includes("life insurance") || t.includes("term life") || t.includes("whole life") || t.includes("iul")) return "Life Insurance";
  return fallback;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function stripHtml(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
}

export const Route = createFileRoute("/api/public/hooks/fetch-news")({
  server: {
    handlers: {
      POST: async () => {
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        let inserted = 0;
        const errors: string[] = [];

        for (const feed of FEEDS) {
          try {
            const res = await fetch(feed.url, {
              headers: { "User-Agent": "AgentCloud/1.0" },
            });
            if (!res.ok) {
              errors.push(`${feed.source}: HTTP ${res.status}`);
              continue;
            }
            const xml = await res.text();
            const parsed = parser.parse(xml);
            const items = asArray<any>(parsed?.rss?.channel?.item ?? parsed?.feed?.entry);

            const rows = items.slice(0, 20).map((it: any) => {
              const title = String(it.title?.["#text"] ?? it.title ?? "").trim();
              const link =
                typeof it.link === "string"
                  ? it.link
                  : it.link?.["@_href"] ?? it.link?.[0]?.["@_href"] ?? "";
              const pubDate = it.pubDate ?? it.published ?? it.updated ?? null;
              const summary = stripHtml(it.description ?? it.summary ?? it["content:encoded"]);
              const cat = categorize(`${title} ${summary}`, feed.category);
              return {
                title: title.slice(0, 300),
                url: String(link).slice(0, 1000),
                summary,
                source_name: feed.source,
                category: cat,
                published_at: pubDate ? new Date(pubDate).toISOString() : null,
              };
            }).filter((r: any) => r.title && r.url);

            if (rows.length) {
              const { error } = await supabaseAdmin
                .from("news_articles")
                .upsert(rows, { onConflict: "url", ignoreDuplicates: true });
              if (error) {
                errors.push(`${feed.source}: ${error.message}`);
              } else {
                inserted += rows.length;
              }
            }
          } catch (e) {
            errors.push(`${feed.source}: ${(e as Error).message}`);
          }
        }

        // Purge older than 90 days
        await supabaseAdmin
          .from("news_articles")
          .delete()
          .lt("published_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

        return Response.json({ ok: true, processed: inserted, errors });
      },
    },
  },
});
