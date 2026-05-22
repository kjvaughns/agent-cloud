import { createFileRoute } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Agent Cloud" },
      { name: "description", content: "Frequently asked questions about commissions, contracting, and Agent Cloud features." },
    ],
  }),
  component: FaqPage,
});

const FAQS = [
  { q: "When do I get paid my advance commission?", a: "On the policy effective date the system schedules 75% of your first-year commission as an advance. The remaining 25% is split evenly across months 10, 11, and 12. GTL products use a different schedule — 50% advance capped at $600 and balance over months 7–12." },
  { q: "Why can't I request an annuity contract?", a: "Annuity contracts are gated on a completed Best Interest / Suitability course. Upload your WebCE certificate on the Annuity Training page and the carriers will unlock automatically." },
  { q: "How do override commissions work?", a: "You earn the spread between your commission level and your direct downline's level on their personal production. Each upline in the chain only earns their differential — not the full amount." },
  { q: "Can my downline see my commission level?", a: "No. Agents only see their own level and any levels below it in the commission grids. Levels above are completely hidden." },
  { q: "What's the difference between Login Email and Contact Email?", a: "Login Email is the credential you sign in with and never changes once set. Contact Email is what your prospects see and what carriers email you at — change it any time from Producer Profile." },
  { q: "How does Sophai Policy Recovery decide who to call?", a: "Sophai targets policies in Lapse Pending status. When enabled, it dials the client, attempts re-engagement, and live-transfers warm leads back to you. You can pause it any time from the shield icon in the top bar." },
  { q: "What is the wallet for?", a: "Wallet funds power SMS, MMS, voice calls, and Sophai Policy Recovery AI minutes. Top up from My Phone → Wallet." },
  { q: "How do I invite a new agent?", a: "Contracting → Invite Agent. Create a link, assign carriers and commission levels (at or below your own), then share. Their contracting paperwork is pre-filled when they sign up." },
];

function FaqPage() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><HelpCircle className="h-7 w-7" /> Frequently Asked Questions</h1>
        <p className="text-muted-foreground mt-1">Quick answers to the questions agents ask most.</p>
      </div>
      <Accordion type="single" collapsible className="w-full">
        {FAQS.map((f, i) => (
          <AccordionItem key={i} value={`q-${i}`}>
            <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
