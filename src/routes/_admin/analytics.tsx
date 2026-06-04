import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_admin/analytics")({
  component: AdminAnalytics,
  head: () => ({ meta: [{ title: "Analytics — Agent Cloud Admin" }] }),
});

function AdminAnalytics() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p className="text-muted-foreground mt-2 max-w-sm">
        Advanced analytics and reporting are coming soon. Check the Overview page for current platform metrics.
      </p>
    </div>
  );
}
