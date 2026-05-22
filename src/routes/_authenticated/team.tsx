import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtCurrency } from "@/lib/format";
import { UserPlus, ChevronRight, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [
    { title: "Team — Agent Cloud" },
    { name: "description", content: "Manage your downline, activation queue, and org chart." },
  ]}),
  component: TeamPage,
});

const ROSTER = [
  { name: "Sarah Lee", role: "Senior Agent", policies: 28, ap: 84120, status: "Active", since: "Jan 2024" },
  { name: "Marcus Reed", role: "Agent", policies: 14, ap: 41200, status: "Active", since: "Mar 2024" },
  { name: "Priya Shah", role: "Agent", policies: 9, ap: 24800, status: "Ramping", since: "Apr 2025" },
  { name: "Diego Alvarez", role: "Agent", policies: 21, ap: 62400, status: "Active", since: "Aug 2023" },
  { name: "Jamie Chen", role: "Recruit", policies: 0, ap: 0, status: "Onboarding", since: "May 2026" },
  { name: "Riley Brooks", role: "Agent", policies: 6, ap: 14800, status: "Active", since: "Feb 2025" },
];

const ACTIVATION_QUEUE = [
  { name: "Jamie Chen", step: "Complete state license", progress: 60 },
  { name: "Lauren Pike", step: "Submit E&O insurance", progress: 80 },
  { name: "Omar Patel", step: "First carrier contract", progress: 40 },
];

function TeamPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Command Center</h1>
          <p className="text-sm text-muted-foreground">Your downline at a glance — production, ramp, and recruiting.</p>
        </div>
        <Button><UserPlus className="h-4 w-4" /> Invite agent</Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="org">Organization</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Active agents" value="14" change="+2" />
            <KpiCard label="Team AP (MTD)" value={fmtCurrency(412000)} change="+24%" />
            <KpiCard label="Avg per agent" value={fmtCurrency(29400)} />
            <KpiCard label="Onboarding" value="3" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card><CardContent className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Top performers (MTD)</h3>
              <div className="space-y-2">
                {ROSTER.slice(0,4).sort((a,b)=>b.ap-a.ap).map((m, i) => (
                  <div key={m.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <span className="text-sm font-bold text-muted-foreground w-4">#{i+1}</span>
                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-primary/10 text-primary">{m.name.split(" ").map((s)=>s[0]).join("")}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.policies} policies</div>
                    </div>
                    <div className="font-mono font-semibold text-sm">{fmtCurrency(m.ap)}</div>
                  </div>
                ))}
              </div>
            </CardContent></Card>

            <Card><CardContent className="p-4">
              <h3 className="font-semibold mb-3">Activation queue</h3>
              <div className="space-y-3">
                {ACTIVATION_QUEUE.map((a) => (
                  <div key={a.name}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-xs text-muted-foreground">{a.step}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${a.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="roster" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Agent</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Policies</TableHead><TableHead className="text-right">AP</TableHead><TableHead>Since</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ROSTER.map((m) => (
                  <TableRow key={m.name} className="cursor-pointer">
                    <TableCell className="font-medium flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-xs bg-primary/10 text-primary">{m.name.split(" ").map((s)=>s[0]).join("")}</AvatarFallback></Avatar>
                      {m.name}
                    </TableCell>
                    <TableCell>{m.role}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        m.status === "Active" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" :
                        m.status === "Ramping" ? "bg-amber-500/15 text-amber-600 border-amber-500/30" :
                        "bg-blue-500/15 text-blue-600 border-blue-500/30"
                      }`}>{m.status}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{m.policies}</TableCell>
                    <TableCell className="text-right font-mono">{fmtCurrency(m.ap)}</TableCell>
                    <TableCell className="text-muted-foreground">{m.since}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="org" className="mt-4">
          <Card><CardContent className="p-6">
            <h3 className="font-semibold mb-4">Organization depth chart</h3>
            <OrgTree />
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrgTree() {
  return (
    <div className="space-y-1 text-sm">
      <OrgNode name="You" role="Agency Owner" depth={0} />
      <OrgNode name="Sarah Lee" role="Senior Agent · 6 downline" depth={1} />
      <OrgNode name="Marcus Reed" role="Agent" depth={2} />
      <OrgNode name="Priya Shah" role="Agent" depth={2} />
      <OrgNode name="Diego Alvarez" role="Agent · 2 downline" depth={1} />
      <OrgNode name="Jamie Chen" role="Recruit" depth={2} />
      <OrgNode name="Riley Brooks" role="Agent" depth={1} />
    </div>
  );
}

function OrgNode({ name, role, depth }: { name: string; role: string; depth: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5 rounded hover:bg-muted/50" style={{ paddingLeft: depth * 24 + 8 }}>
      {depth > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      <Avatar className="h-7 w-7"><AvatarFallback className="text-xs bg-primary/10 text-primary">{name.split(" ").map((s)=>s[0]).join("")}</AvatarFallback></Avatar>
      <span className="font-medium">{name}</span>
      <span className="text-muted-foreground text-xs">· {role}</span>
    </div>
  );
}
