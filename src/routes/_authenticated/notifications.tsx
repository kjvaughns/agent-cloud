import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bell, FileSignature, DollarSign, AlertTriangle, UserPlus, MessageSquare, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — Agent Cloud" },
    { name: "description", content: "Activity and alerts from across your agency." },
  ]}),
  component: NotificationsPage,
});

const ITEMS = [
  { icon: DollarSign, color: "text-emerald-500 bg-emerald-500/10", title: "Commission paid", body: "Mutual of Omaha · $1,284.00 deposited", time: "12m ago", unread: true },
  { icon: FileSignature, color: "text-blue-500 bg-blue-500/10", title: "Policy issued", body: "John Smith · Term 20 · $500k face", time: "2h ago", unread: true },
  { icon: AlertTriangle, color: "text-amber-500 bg-amber-500/10", title: "Lapse pending", body: "Mary Johnson · payment failed", time: "5h ago", unread: true },
  { icon: UserPlus, color: "text-indigo-500 bg-indigo-500/10", title: "New downline agent", body: "Sarah Lee joined your team", time: "Yesterday" },
  { icon: MessageSquare, color: "text-purple-500 bg-purple-500/10", title: "SMS reply", body: "From (214) 555-0188 · \"Sounds good!\"", time: "Yesterday" },
  { icon: Bell, color: "text-slate-500 bg-slate-500/10", title: "Appointment reminder", body: "Presentation with R. Lee at 3pm", time: "2d ago" },
];

function NotificationsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Stay on top of policies, payments, and team activity.</p>
        </div>
        <Button variant="outline" size="sm"><CheckCheck className="h-4 w-4" /> Mark all read</Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4 space-y-2">
          {ITEMS.map((n, i) => (
            <Card key={i} className={cn(n.unread && "border-l-4 border-l-primary")}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className={cn("h-9 w-9 rounded-lg grid place-items-center shrink-0", n.color)}>
                  <n.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{n.title}</div>
                    <div className="text-xs text-muted-foreground shrink-0">{n.time}</div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">{n.body}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="unread" className="mt-4 text-sm text-muted-foreground text-center py-12">3 unread notifications above.</TabsContent>
        <TabsContent value="policies" className="mt-4 text-sm text-muted-foreground text-center py-12">Filter applied.</TabsContent>
        <TabsContent value="commissions" className="mt-4 text-sm text-muted-foreground text-center py-12">Filter applied.</TabsContent>
        <TabsContent value="team" className="mt-4 text-sm text-muted-foreground text-center py-12">Filter applied.</TabsContent>
      </Tabs>
    </div>
  );
}
