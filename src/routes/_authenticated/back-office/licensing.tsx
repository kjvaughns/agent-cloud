import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/back-office/licensing")({
  component: LicensingPage,
});

const LICENSES = [
  { agent: "M. Chen", state: "TX", lines: "Life, Health", expires: "2026-08-12", status: "Active" },
  { agent: "M. Chen", state: "FL", lines: "Life", expires: "2025-12-30", status: "Expiring" },
  { agent: "P. Singh", state: "CA", lines: "Life, Health, Annuity", expires: "2027-03-04", status: "Active" },
  { agent: "S. Lopez", state: "NY", lines: "Life", expires: "2025-11-22", status: "Expired" },
  { agent: "J. O'Connor", state: "AZ", lines: "Life, Health", expires: "2026-05-18", status: "Active" },
];

function LicensingPage() {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead><TableHead>State</TableHead><TableHead>Lines</TableHead>
              <TableHead>Expires</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LICENSES.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{l.agent}</TableCell>
                <TableCell>{l.state}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{l.lines}</TableCell>
                <TableCell className="tabular-nums">{l.expires}</TableCell>
                <TableCell>
                  <Badge variant={l.status === "Active" ? "secondary" : "destructive"} className="gap-1">
                    {l.status !== "Active" && <AlertTriangle className="h-3 w-3" />}{l.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
