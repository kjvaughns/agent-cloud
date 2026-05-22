import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [
    { title: "Calendar — Agent Cloud" },
    { name: "description", content: "Appointments, follow-ups, and reminders in one view." },
  ]}),
  component: CalendarPage,
});

const EVENT_TYPES = [
  { type: "Presentation", color: "bg-purple-500" },
  { type: "Follow-up call", color: "bg-blue-500" },
  { type: "Application", color: "bg-amber-500" },
  { type: "Policy review", color: "bg-emerald-500" },
  { type: "Birthday", color: "bg-pink-500" },
];

function CalendarPage() {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [cursor, setCursor] = useState(new Date());

  const days = useMemo(() => buildMonth(cursor), [cursor]);
  const monthLabel = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });

  const events = useMemo(() => {
    const map = new Map<string, { type: string; color: string; time: string; client: string }[]>();
    days.forEach((d, i) => {
      if (!d.inMonth) return;
      const count = (i * 7 + 3) % 4;
      const arr: { type: string; color: string; time: string; client: string }[] = [];
      for (let j = 0; j < count; j++) {
        const e = EVENT_TYPES[(i + j) % EVENT_TYPES.length];
        arr.push({ ...e, time: `${9 + j * 2}:00`, client: ["J. Smith","M. Garcia","R. Lee","P. Brown"][(i + j) % 4] });
      }
      map.set(d.iso, arr);
    });
    return map;
  }, [days]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">Auto-generated events from your pipeline and book of business.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "month" | "week" | "day")}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button><Plus className="h-4 w-4" /> New event</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setCursor((d) => addMonths(d, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" onClick={() => setCursor((d) => addMonths(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
        <div className="font-semibold text-lg ml-2">{monthLabel}</div>
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-3 text-xs">
          {EVENT_TYPES.map((e) => (
            <div key={e.type} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", e.color)} />{e.type}</div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="px-3 py-2 text-xs font-semibold text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[minmax(110px,auto)]">
          {days.map((d) => {
            const ev = events.get(d.iso) ?? [];
            return (
              <div key={d.iso} className={cn("border-r border-b p-2 last:border-r-0", !d.inMonth && "bg-muted/20 text-muted-foreground", d.isToday && "bg-primary/5")}>
                <div className={cn("text-xs font-semibold mb-1", d.isToday && "text-primary")}>{d.day}</div>
                <div className="space-y-1">
                  {ev.slice(0, 3).map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] truncate">
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", e.color)} />
                      <span className="truncate">{e.time} {e.client}</span>
                    </div>
                  ))}
                  {ev.length > 3 && <div className="text-[10px] text-muted-foreground">+{ev.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function buildMonth(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - first.getDay());
  const today = new Date();
  const out: { day: number; iso: string; inMonth: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      day: d.getDate(),
      iso: d.toISOString().slice(0, 10),
      inMonth: d.getMonth() === cursor.getMonth(),
      isToday: d.toDateString() === today.toDateString(),
    });
  }
  return out;
}
