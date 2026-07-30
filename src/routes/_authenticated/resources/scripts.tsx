import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getScripts } from "@/lib/resources.functions";
import { Panel } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Printer, Copy, Star, ArrowLeft, Check, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/resources/scripts")({
  head: () => ({ meta: [{ title: "Scripts — Agent Cloud" }] }),
  component: Page,
});

type Script = {
  id: string;
  title: string;
  category: string;
  short_description: string | null;
  long_description: string | null;
  content_html: string | null;
  accent_color: string | null;
};

const CATS = [
  { key: "all", label: "All" },
  { key: "basic", label: "Opening" },
  { key: "needs_analysis", label: "Needs Analysis" },
  { key: "objection_handling", label: "Objections" },
  { key: "mortgage_protection", label: "Mortgage" },
  { key: "beneficiary", label: "Beneficiary" },
  { key: "check_in", label: "Follow-Up" },
];

const FAV_KEY = "ac-script-favorites";

function plainText(html: string) {
  if (typeof document === "undefined") return html;
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent ?? "";
}

function Page() {
  const fn = useServerFn(getScripts);
  const { data: scripts = [], isLoading } = useQuery({ queryKey: ["scripts"], queryFn: () => fn() });

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Script | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // Favourites are a personal shortcut, not agency data — local storage keeps
  // it instant and avoids a table for something nobody else needs to see.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavs(new Set(JSON.parse(raw)));
    } catch { /* private mode */ }
  }, []);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const list = scripts as Script[];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return list
      .filter((s) => cat === "all" || s.category === cat)
      .filter((s) => {
        if (!term) return true;
        // Search the body too — you rarely remember a script's title, you
        // remember a line from inside it.
        const hay = `${s.title} ${s.short_description ?? ""} ${plainText(s.content_html ?? "")}`.toLowerCase();
        return hay.includes(term);
      })
      // Saved scripts float up; everything else keeps its sort order.
      .sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)));
  }, [list, q, cat, favs]);

  const copyScript = (s: Script) => {
    navigator.clipboard.writeText(plainText(s.content_html ?? "")).then(
      () => { setCopied(true); toast.success("Script copied"); setTimeout(() => setCopied(false), 1500); },
      () => toast.error("Couldn't copy"),
    );
  };

  // ── Reader ────────────────────────────────────────────────────────────────
  // Full width rather than a modal: these get read aloud on a live call, and a
  // cramped dialog is the wrong shape for that.
  if (open) {
    return (
      <div className="flex flex-col gap-[var(--gap)]">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setOpen(null)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> All scripts
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => toggleFav(open.id)}>
              <Star className={cn("mr-1 h-4 w-4", favs.has(open.id) && "fill-primary text-primary")} />
              {favs.has(open.id) ? "Saved" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyScript(open)}>
              {copied ? <Check className="mr-1 h-4 w-4 text-success" /> : <Copy className="mr-1 h-4 w-4" />} Copy
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" /> Print
            </Button>
          </div>
        </div>

        <Panel>
          <Badge variant="outline" className="mb-2 capitalize">
            {String(open.category).replace(/_/g, " ")}
          </Badge>
          <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            {open.title}
          </h2>
          {open.long_description && (
            <p className="mt-1.5 text-sm text-muted-foreground">{open.long_description}</p>
          )}

          <article
            className="prose prose-base dark:prose-invert mt-5 max-w-none border-t border-border-soft pt-5 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: open.content_html || "" }}
          />
        </Panel>
      </div>
    );
  }

  // ── Browse ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <Input
            className="pl-9"
            placeholder="Search titles and script text…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {favs.size > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3 fill-primary text-primary" /> {favs.size} saved
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              cat === c.key
                ? "border-primary/40 bg-gold-glow text-gold-bright"
                : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-[var(--gap)] md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Panel>
          <div className="py-14 text-center">
            <ScrollText className="mx-auto mb-3 h-9 w-9 text-text-dim" />
            <div className="font-semibold">
              {list.length === 0 ? "No scripts yet." : "Nothing matches that search."}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {list.length === 0
                ? "Your agency's scripts will appear here once they're added."
                : "Try a different search or category."}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-[var(--gap)] md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpen(s)}
              className={cn(
                "ac-lift group flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card text-left",
                "hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              )}
            >
              <div className="h-1.5 w-full" style={{ background: s.accent_color || "var(--gold)" }} />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className="capitalize">
                    {String(s.category).replace(/_/g, " ")}
                  </Badge>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggleFav(s.id); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleFav(s.id); }
                    }}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                    aria-label={favs.has(s.id) ? "Remove from saved" : "Save script"}
                  >
                    <Star className={cn("h-4 w-4", favs.has(s.id) && "fill-primary text-primary")} />
                  </span>
                </div>

                <div className="mt-2 font-semibold group-hover:text-gold-bright">{s.title}</div>
                {s.short_description && (
                  <p className="mt-1 text-sm text-muted-foreground">{s.short_description}</p>
                )}
                {s.long_description && (
                  <p className="mt-2 line-clamp-3 flex-1 text-xs text-text-dim">{s.long_description}</p>
                )}

                <span className="mt-4 text-xs font-semibold text-primary">Read script →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
