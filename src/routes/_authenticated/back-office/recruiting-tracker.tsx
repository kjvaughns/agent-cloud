import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/back-office/recruiting-tracker")({
  component: RecruitingTrackerPage,
});

const STAGES = [
  { stage: "Inquiries", count: 47, color: "bg-slate-500" },
  { stage: "Interviews", count: 23, color: "bg-sky-500" },
  { stage: "Contracts Out", count: 14, color: "bg-amber-500" },
  { stage: "Licensed", count: 8, color: "bg-violet-500" },
  { stage: "Producing", count: 5, color: "bg-emerald-500" },
];

const RECRUITS = [
  { name: "Tina Brooks", initials: "TB", source: "Indeed", stage: "Licensed", recruiter: "M. Chen", days: 12 },
  { name: "Devon Hill", initials: "DH", source: "Referral", stage: "Contracts Out", recruiter: "P. Singh", days: 5 },
  { name: "Yuki Tanaka", initials: "YT", source: "LinkedIn", stage: "Interviews", recruiter: "S. Lopez", days: 2 },
  { name: "Carlos Mendoza", initials: "CM", source: "Facebook Ad", stage: "Producing", recruiter: "M. Chen", days: 31 },
  { name: "Olivia Park", initials: "OP", source: "Referral", stage: "Inquiries", recruiter: "J. O'Connor", days: 1 },
  { name: "Andre Williams", initials: "AW", source: "Indeed", stage: "Contracts Out", recruiter: "S. Lopez", days: 8 },
];

function RecruitingTrackerPage() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STAGES.map((s) => (
          <Card key={s.stage}>
            <CardContent className="p-4">
              <div className={`h-1 w-12 rounded-full ${s.color} mb-3`} />
              <div className="text-3xl font-bold">{s.count}</div>
              <div className="text-sm text-muted-foreground">{s.stage}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Pipeline</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recruit</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Recruiter</TableHead>
                <TableHead className="text-right">Days in stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RECRUITS.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{r.initials}</AvatarFallback></Avatar>
                      <span className="font-medium">{r.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.source}</TableCell>
                  <TableCell><Badge variant="secondary">{r.stage}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{r.recruiter}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.days}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
