import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/tools/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Agent Cloud" },
      { name: "description", content: "Lead marketplace — coming soon." },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  return (
    <ComingSoonPage
      title="Leads"
      description="A built-in lead marketplace is on the roadmap. In the meantime, keep working your book — add prospects to the Pipeline and let Nova draft your follow-ups."
      icon="spark"
      actions={[
        { label: "Open Pipeline", to: "/pipeline" },
        { label: "Ask Nova", to: "/ai-assistant" },
      ]}
    />
  );
}
