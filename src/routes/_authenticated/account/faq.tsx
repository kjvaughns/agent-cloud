import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpCircle } from "lucide-react";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { listFaq } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/account/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Agent Cloud" },
      { name: "description", content: "Frequently asked questions about commissions, contracting, and Agent Cloud features." },
    ],
  }),
  component: FaqPage,
});

type FaqItem = { id: string; section: string | null; question: string; answer: string };

function FaqPage() {
  // Reads faq_items, which listFaq already served and this page ignored in
  // favour of a hardcoded array. Content is now editable without a deploy.
  const fn = useServerFn(listFaq);
  const { data, isLoading } = useQuery({ queryKey: ["faq"], queryFn: () => fn() });

  const items = ((data as any)?.items ?? []) as FaqItem[];

  // Preserve the order the query returned (section, then sort_order) while
  // grouping, so an agency's own ordering is respected.
  const sections: { name: string; items: FaqItem[] }[] = [];
  for (const item of items) {
    const name = item.section || "General";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.items.push(item);
    else sections.push({ name, items: [item] });
  }

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title={<span className="flex items-center gap-2"><HelpCircle className="h-7 w-7" /> Frequently Asked Questions</span>}
          subtitle="Quick answers to the questions agents ask most."
        />

        {isLoading ? (
          <Panel><Skeleton className="h-64" /></Panel>
        ) : items.length === 0 ? (
          <Panel>
            <div className="py-12 text-center space-y-2">
              <div className="font-medium">No FAQ entries yet.</div>
              <p className="text-sm text-muted-foreground">
                Questions added to your agency's FAQ will appear here.
              </p>
            </div>
          </Panel>
        ) : (
          sections.map((s) => (
            <Panel key={s.name} title={sections.length > 1 ? s.name : undefined}>
              <Accordion type="single" collapsible className="w-full">
                {s.items.map((f) => (
                  <AccordionItem key={f.id} value={f.id}>
                    <AccordionTrigger className="text-left">{f.question}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground whitespace-pre-line">
                      {f.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Panel>
          ))
        )}
      </div>
    </PageShell>
  );
}
