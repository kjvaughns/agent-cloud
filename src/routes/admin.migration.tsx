import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, UserPlus, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/admin/migration")({
  component: AdminMigration,
  head: () => ({ meta: [{ title: "Team Migration — Agent Cloud Admin" }] }),
});

function AdminMigration() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Team Migration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Move an existing agency onto Agent Cloud. Pick the path that matches the data you have.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Bulk import from CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload an AgentLink, SureLC, or carrier-export CSV. AI extracts agents, clients, policies, and assigns them to the right writer.
            </p>
            <Button asChild>
              <Link to="/admin/csv-import">Open CSV importer</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" /> Invite agents one by one
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Send a single invite with pre-assigned carriers and commission levels. Best for high-value producers you want to onboard personally.
            </p>
            <Button asChild variant="outline">
              <Link to="/contracting/invite">Open invite builder</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Pending agent requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Agents who asked for a full AgentLink pull show up here with credentials. Review, run the import on their behalf, and mark complete.
            </p>
            <Button asChild variant="outline">
              <Link to="/admin/import-requests">Open import requests</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
