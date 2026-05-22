import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, ExternalLink, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/state-licenses")({
  head: () => ({
    meta: [
      { title: "State Licenses — Agent Cloud" },
      { name: "description", content: "Track your resident and non-resident insurance licenses, expirations, and DOI links." },
    ],
  }),
  component: StateLicensesPage,
});

const LICENSES = [
  { state: "TX", name: "Texas", number: "2148321", issued: "2023-02-14", expires: "2027-02-14", doi: "https://www.tdi.texas.gov", status: "Active" },
  { state: "FL", name: "Florida", number: "W845921", issued: "2023-05-01", expires: "2026-09-01", doi: "https://myfloridacfo.com", status: "Expiring soon" },
  { state: "CA", name: "California", number: "0L21834", issued: "2024-01-10", expires: "2028-01-10", doi: "https://insurance.ca.gov", status: "Active" },
  { state: "NY", name: "New York", number: "PC-119238", issued: "2022-11-22", expires: "2026-11-22", doi: "https://www.dfs.ny.gov", status: "Active" },
  { state: "GA", name: "Georgia", number: "3284119", issued: "2023-08-08", expires: "2025-08-08", doi: "https://oci.georgia.gov", status: "Expired" },
];

const STATUS: Record<string, string> = {
  Active: "bg-success/15 text-success",
  "Expiring soon": "bg-warning/15 text-warning",
  Expired: "bg-destructive/15 text-destructive",
};

function StateLicensesPage() {
  const expiring = LICENSES.filter((l) => l.status !== "Active").length;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div className="text-sm text-muted-foreground">{LICENSES.length} licenses on file · {expiring} need attention</div>
        <Button><Upload className="h-4 w-4 mr-1" /> Upload license</Button>
      </div>

      {expiring > 0 && (
        <div className="flex items-start gap-3 border border-warning/30 bg-warning/10 rounded-lg p-3">
          <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">{expiring} license{expiring > 1 ? "s" : ""} expiring or expired</div>
            <div className="text-muted-foreground">Renew through your state DOI to avoid commission interruptions.</div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Your licenses</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead>License #</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">DOI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LICENSES.map((l) => (
                <TableRow key={l.state}>
                  <TableCell className="font-medium">{l.state} · {l.name}</TableCell>
                  <TableCell className="font-mono text-sm">{l.number}</TableCell>
                  <TableCell>{l.issued}</TableCell>
                  <TableCell>{l.expires}</TableCell>
                  <TableCell><Badge variant="secondary" className={STATUS[l.status]}>{l.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <a href={l.doi} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary text-sm hover:underline">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
