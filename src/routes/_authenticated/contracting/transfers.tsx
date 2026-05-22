import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRightLeft, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contracting/transfers")({
  component: TransfersPage,
});

const REQS = [
  { agent: "Marcus Reed", carrier: "Americo", from: "Old Agency", to: "You", status: "Pending", date: "May 19" },
  { agent: "Priya Shah", carrier: "Aetna", from: "—", to: "You", status: "Approved", date: "May 12" },
  { agent: "Riley Brooks", carrier: "Foresters", from: "Other Upline", to: "You", status: "Awaiting carrier", date: "Apr 30" },
];

function TransfersPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Move appointments between uplines.</p>
        <Button><Plus className="h-4 w-4" /> New transfer</Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Agent</TableHead><TableHead>Carrier</TableHead><TableHead>From</TableHead>
            <TableHead>To</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {REQS.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.agent}</TableCell>
                <TableCell>{r.carrier}</TableCell>
                <TableCell className="text-muted-foreground">{r.from}</TableCell>
                <TableCell className="inline-flex items-center gap-1"><ArrowRightLeft className="h-3 w-3 text-muted-foreground" /> {r.to}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell className="text-muted-foreground">{r.date}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
