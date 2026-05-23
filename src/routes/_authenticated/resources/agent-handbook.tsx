import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getHandbookSections } from "@/lib/resources.functions";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent Handbook</h1>
          <p className="text-muted-foreground">Your complete guide to being a successful Agent Cloud partner</p>
        </div>
        <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Print</Button>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-6">
        <aside className="lg:sticky lg:top-4 lg:self-start space-y-1 text-sm">
          <div className="font-semibold mb-2 text-muted-foreground uppercase text-xs">Contents</div>
          {sections.map((s: any) => (
            <a
              key={s.slug}
              href={`#${s.slug}`}
              onClick={() => setActive(s.slug)}
              className={`block px-3 py-2 rounded hover:bg-muted ${active === s.slug ? "bg-muted font-medium" : ""}`}
            >
              {s.title}
            </a>
          ))}
        </aside>
        <article className="prose prose-sm dark:prose-invert max-w-none space-y-8">
          {sections.map((s: any) => (
            <section key={s.slug} id={s.slug} className="scroll-mt-4">
              <div dangerouslySetInnerHTML={{ __html: s.content_html }} />
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
