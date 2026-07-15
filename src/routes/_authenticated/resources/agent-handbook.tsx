import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getHandbookSections } from "@/lib/resources.functions";
import { Button } from "@/components/ui/button";
import { PageShell, HeroBand } from "@/components/page-shell";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/agent-handbook")({
  head: () => ({ meta: [{ title: "Agent Handbook — Agent Cloud" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getHandbookSections);
  const { data: sections = [] } = useQuery({ queryKey: ["handbook"], queryFn: () => fn() });
  const [active, setActive] = useState<string | null>(null);

  return (
    <PageShell>
      <div className="space-y-4">
        <HeroBand
          title="Agent Handbook"
          subtitle="Your complete guide to being a successful Agent Cloud partner"
          actions={<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Print</Button>}
        />

        <div className="grid lg:grid-cols-[240px_1fr] gap-6">
          <aside className="lg:sticky lg:top-4 lg:self-start space-y-1 text-sm rounded-[var(--radius)] border border-border bg-card p-pad">
            <div className="font-semibold mb-2 text-text-dim uppercase text-xs tracking-[0.09em]">Contents</div>
            {sections.map((s: any) => (
              <a
                key={s.slug}
                href={`#${s.slug}`}
                onClick={() => setActive(s.slug)}
                className={`block px-3 py-2 rounded-md transition-colors hover:bg-surface-2 ${active === s.slug ? "bg-surface-2 font-medium text-gold-bright" : ""}`}
              >
                {s.title}
              </a>
            ))}
          </aside>
          <article className="prose prose-sm dark:prose-invert max-w-none space-y-8 rounded-[var(--radius)] border border-border bg-card p-pad">
            {sections.map((s: any) => (
              <section key={s.slug} id={s.slug} className="scroll-mt-4">
                <div dangerouslySetInnerHTML={{ __html: s.content_html }} />
              </section>
            ))}
          </article>
        </div>
      </div>
    </PageShell>
  );
}
