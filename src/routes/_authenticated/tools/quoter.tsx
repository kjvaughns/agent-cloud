import { createFileRoute } from "@tanstack/react-router";
import { PageShell, HeroBand } from "@/components/page-shell";
import { QuoteRecommender } from "@/components/ai/quote-recommender";

export const Route = createFileRoute("/_authenticated/tools/quoter")({
  component: QuoterPage,
  head: () => ({
    meta: [
      { title: "Quoter — Agent Cloud" },
      { name: "description", content: "Match a client to the right carrier and product before you dial." },
    ],
  }),
});

/**
 * The quoter existed as a finished component with no route pointing at it, so
 * nobody could open it. This is that component, given a door.
 */
function QuoterPage() {
  return (
    <PageShell>
      <div className="flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Quoter"
          subtitle="Describe the client and get carrier and product suggestions before you dial."
        />
        <QuoteRecommender />
      </div>
    </PageShell>
  );
}
