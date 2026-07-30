import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getHandbookSections } from "@/lib/resources.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Search, Link2, Check, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/resources/agent-handbook")({
  head: () => ({ meta: [{ title: "Agent Handbook — Agent Cloud" }] }),
  component: Page,
});

type Section = { slug: string; title: string; content_html: string };

/** Strip tags once so search matches body text, not just section titles. */
function plainText(html: string) {
  if (typeof document === "undefined") return html;
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent ?? "").toLowerCase();
}

function Page() {
  const fn = useServerFn(getHandbookSections);
  const { data: sections = [], isLoading } = useQuery({ queryKey: ["handbook"], queryFn: () => fn() });

  const [q, setQ] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  const list = sections as Section[];

  const searchable = useMemo(
    () => list.map((s) => ({ slug: s.slug, hay: `${s.title} ${plainText(s.content_html ?? "")}`.toLowerCase() })),
    [list],
  );

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    const hits = new Set(searchable.filter((s) => s.hay.includes(term)).map((s) => s.slug));
    return list.filter((s) => hits.has(s.slug));
  }, [list, q, searchable]);

  /**
   * Scroll-spy. The old contents list highlighted only on click, so it never
   * reflected where you actually were once you started scrolling.
   */
  useEffect(() => {
    if (!visible.length) return;
    const nodes = visible
      .map((s) => document.getElementById(s.slug))
      .filter(Boolean) as HTMLElement[];
    if (!nodes.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        // Nearest the top wins, so a short section does not lose to a tall
        // one below it.
        const onScreen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (onScreen[0]) setActive(onScreen[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [visible]);

  // Progress across the article specifically — the header and sidebar should
  // not count toward "how much have I read".
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      if (total <= 0) { setProgress(100); return; }
      setProgress(Math.min(100, Math.max(0, (-r.top / total) * 100)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [visible.length]);

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${slug}`;
    navigator.clipboard.writeText(url).then(
      () => { setCopied(slug); toast.success("Link copied"); setTimeout(() => setCopied(null), 1500); },
      () => toast.error("Couldn't copy"),
    );
  };

  if (isLoading) {
    return (
      <div className="grid gap-[var(--gap)] lg:grid-cols-[250px_1fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-[520px]" />
      </div>
    );
  }

  if (!list.length) {
    return (
      <Panel>
        <div className="py-14 text-center">
          <BookOpen className="mx-auto mb-3 h-9 w-9 text-text-dim" />
          <div className="font-semibold">The handbook is empty.</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your agency's handbook sections will appear here once they're added.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="sticky top-0 z-20 h-1 rounded-full bg-surface-2 print:hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="relative min-w-0 max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim" />
          <Input
            className="pl-9"
            placeholder="Search the handbook…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          {q && (
            <span className="tnum text-xs text-muted-foreground">
              {visible.length} of {list.length} sections
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Panel>
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing in the handbook matches “{q}”.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-[var(--gap)] lg:grid-cols-[250px_1fr]">
          <aside className="print:hidden lg:sticky lg:top-4 lg:self-start">
            <Panel>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-dim">
                Contents
              </div>
              <nav className="space-y-0.5 text-sm">
                {visible.map((s, i) => (
                  <a
                    key={s.slug}
                    href={`#${s.slug}`}
                    onClick={() => setActive(s.slug)}
                    className={cn(
                      "flex items-baseline gap-2 rounded-md px-2.5 py-1.5 transition-colors",
                      active === s.slug
                        ? "bg-gold-glow font-medium text-gold-bright"
                        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    <span className="tnum text-[10px] text-text-dim">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 break-words">{s.title}</span>
                  </a>
                ))}
              </nav>
            </Panel>
          </aside>

          <div ref={articleRef} className="min-w-0 space-y-[var(--gap)]">
            {visible.map((s, i) => (
              <Panel key={s.slug} style={{ scrollMarginTop: "5rem" }}>
                <section id={s.slug} style={{ scrollMarginTop: "5rem" }}>
                  <div className="mb-3 flex items-start justify-between gap-3 border-b border-border-soft pb-3">
                    <div className="flex min-w-0 items-baseline gap-2.5">
                      <span className="tnum text-xs text-text-dim">{String(i + 1).padStart(2, "0")}</span>
                      <h2
                        className="min-w-0 break-words text-lg font-bold"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {s.title}
                      </h2>
                    </div>
                    <button
                      onClick={() => copyLink(s.slug)}
                      title="Copy a link to this section"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground print:hidden"
                    >
                      {copied === s.slug ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <article
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: s.content_html }}
                  />
                </section>
              </Panel>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
