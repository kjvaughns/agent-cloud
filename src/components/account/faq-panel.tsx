import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/page-shell";
import { listFaq } from "@/lib/account.functions";

/**
 * Frequently asked questions.
 *
 * Lives inside the Help page as a tab rather than as its own sidebar entry —
 * "where do I find the answer to a question" should have one answer, and it
 * should not be "well, it depends which kind of question".
 *
 * Content comes from faq_items so an agency can edit it without a deploy.
 */

type FaqItem = { id: string; section: string | null; question: string; answer: string };

export function FaqPanel() {
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

  if (isLoading) return <Panel><Skeleton className="h-64" /></Panel>;

  if (items.length === 0) {
    return (
      <Panel>
        <div className="py-12 text-center space-y-2">
          <div className="font-medium">No FAQ entries yet.</div>
          <p className="text-sm text-muted-foreground">
            Questions added to your agency's FAQ will appear here.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {sections.map((s) => (
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
      ))}
    </div>
  );
}
