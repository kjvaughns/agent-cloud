import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PhoneCall, MessageSquare, Cake, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sophai/activity")({
  head: () => ({
    meta: [
      { title: "Sophai Activity — Agent Cloud" },
      { name: "description", content: "Live feed of every action Sophai takes on your behalf." },
    ],
  }),
  component: SophaiActivityPage,
});

type T = "recovery" | "sms" | "birthday" | "beneficiary";
const ITEMS: { id: number; type: T; client: string; outcome: string; outcomeKind: "ok" | "neutral" | "bad"; time: string }[] = [
  { id: 1, type: "recovery", client: "Aisha Patel", outcome: "Reinstated · $124/mo", outcomeKind: "ok", time: "12 min ago" },
  { id: 2, type: "sms", client: "James O'Connor", outcome: "Replied, scheduled callback", outcomeKind: "ok", time: "32 min ago" },
  { id: 3, type: "birthday", client: "Maria Gonzalez", outcome: "Sent", outcomeKind: "neutral", time: "1h ago" },
  { id: 4, type: "recovery", client: "Lee Chen", outcome: "No answer", outcomeKind: "bad", time: "2h ago" },
  { id: 5, type: "beneficiary", client: "Theresa Williams (bene)", outcome: "Confirmed contact info", outcomeKind: "ok", time: "4h ago" },
  { id: 6, type: "sms", client: "Daniel Kim", outcome: "Opted out", outcomeKind: "bad", time: "Yesterday" },
];

const ICONS: Record<T, React.ComponentType<{ className?: string }>> = { recovery: PhoneCall, sms: MessageSquare, birthday: Cake, beneficiary: Users };
const LABEL: Record<T, string> = { recovery: "Policy Recovery", sms: "SMS Follow-up", birthday: "Birthday", beneficiary: "Beneficiary" };

function SophaiActivityPage() {
  const [filter, setFilter] = useState<T | "all">("all");
  const filtered = filter === "all" ? ITEMS : ITEMS.filter((i) => i.type === filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
        {(Object.keys(LABEL) as T[]).map((k) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{LABEL[k]}</Button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent className="divide-y p-0">
          {filtered.map((i) => {
            const Icon = ICONS[i.type];
            const tone = i.outcomeKind === "ok" ? "bg-success/15 text-success" : i.outcomeKind === "bad" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
            return (
              <div key={i.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 grid place-items-center text-primary"><Icon className="h-4 w-4" /></div>
                  <div>
                    <div className="font-medium">{i.client}</div>
                    <div className="text-xs text-muted-foreground">{LABEL[i.type]}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={tone}>{i.outcome}</Badge>
                  <span className="text-xs text-muted-foreground w-20 text-right">{i.time}</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
