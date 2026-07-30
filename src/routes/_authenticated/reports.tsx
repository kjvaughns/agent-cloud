import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsView } from "@/components/reports/analytics-view";

/**
 * One Reports page.
 *
 * Analytics and Reports were two sidebar entries covering the same ground —
 * how the agency is doing — and choosing between them meant already knowing
 * which one held your number. /analytics now redirects here.
 */
export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [
    { title: "Reports — Agent Cloud" },
    { name: "description", content: "Production, commission, team performance and data export for your agency." },
  ]}),
  component: AnalyticsView,
});
