import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as MiniCal } from "@/components/ui/calendar";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Trash2, Pencil, Phone, MessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MeetingBriefPanel } from "@/components/ai/meeting-brief-panel";
import {
  listCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  searchClientsForCalendar,
  type CalendarEvent,
} from "@/lib/calendar.functions";
import { metaFor, EVENT_META } from "@/lib/calendar-meta";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Agent Cloud" },
      { name: "description", content: "Auto-generated insurance events plus manual appointments." },
    ],
  }),
  component: CalendarPage,
});

type ViewMode = "month" | "week" | "day";

function CalendarPage() {
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const v = localStorage.getItem("calendar:view") as ViewMode | null;
    if (v && ["month", "week", "day"].includes(v)) setView(v);
  }, []);
  useEffect(() => {
    localStorage.setItem("calendar:view", view);
  }, [view]);

  const { rangeStart, rangeEnd } = useMemo(() => computeRange(view, cursor), [view, cursor]);

  const listFn = useServerFn(listCalendarEvents);
  const opts = queryOptions({
    queryKey: ["calendar", rangeStart, rangeEnd],
    queryFn: () => listFn({ data: { rangeStart, rangeEnd } }),
  });
  const { data, isLoading } = useQuery(opts);
  const events = data?.events ?? [];

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("calendar_events_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () => {
        qc.invalidateQueries({ queryKey: ["calendar"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const title = useMemo(() => formatTitle(view, cursor), [view, cursor]);

  function shift(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  }

  return (
    <PageShell className="space-y-4">
      <HeroBand
        title="Calendar"
        subtitle="Auto-generated insurance events and your appointments, in one view."
        actions={
          <>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
              <Button variant="outline" size="icon" onClick={() => shift(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => shift(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Jump to date">
                  <CalendarDays className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <MiniCal
                  mode="single"
                  selected={cursor}
                  onSelect={(d) => d && setCursor(d)}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Button
              onClick={() => {
                setCreateDate(new Date());
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Create
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="font-display font-semibold text-lg tnum">{title}</div>
        <div className="flex-1" />
        <div className="hidden lg:flex items-center gap-3 text-xs text-muted-foreground">
          {Object.entries(EVENT_META)
            .filter(([k]) => ["birthday", "policy_starting_soon", "beneficiary_checkin", "lapse_follow_up", "policy_anniversary", "appointment"].includes(k))
            .map(([k, m]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", m.bg)} />
                {m.label}
              </div>
            ))}
        </div>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : view === "month" ? (
        <MonthView
          cursor={cursor}
          events={events}
          onDayClick={(d) => {
            setCreateDate(d);
            setCreateOpen(true);
          }}
          onEventClick={setSelected}
        />
      ) : view === "week" ? (
        <WeekView cursor={cursor} events={events} onEventClick={setSelected} />
      ) : (
        <DayView cursor={cursor} events={events} onEventClick={setSelected} />
      )}

      <CreateEventModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={createDate ?? new Date()}
        onCreated={() => qc.invalidateQueries({ queryKey: ["calendar"] })}
      />

      <EventDetailDrawer
        event={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null);
          qc.invalidateQueries({ queryKey: ["calendar"] });
        }}
      />
    </PageShell>
  );
}

/* ---------------- Month View ---------------- */

function MonthView({
  cursor,
  events,
  onDayClick,
  onEventClick,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const days = useMemo(() => buildMonth(cursor), [cursor]);
  const byDay = useMemo(() => bucketByDay(events), [events]);

  const allEmpty = events.length === 0;

  return (
    <Panel pad={false} className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border-soft bg-surface-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-3 py-2 text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(120px,auto)]">
        {days.map((d) => {
          const list = byDay.get(d.iso) ?? [];
          return (
            <div
              key={d.iso}
              onClick={() => onDayClick(d.date)}
              className={cn(
                "border-r border-b border-border-soft p-2 last:border-r-0 cursor-pointer hover:bg-surface-2 transition-colors",
                !d.inMonth && "bg-surface-2/40 text-text-dim",
                d.isPast && d.inMonth && "opacity-80",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs font-semibold inline-flex items-center justify-center h-6 w-6 rounded-full",
                    d.isToday && "bg-gold-glow text-gold-bright ring-1 ring-primary/40",
                  )}
                >
                  {d.day}
                </span>
              </div>
              <div className="space-y-1">
                {list.slice(0, 3).map((e) => (
                  <EventPill key={e.id} event={e} onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }} />
                ))}
                {list.length > 3 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        +{list.length - 3} more
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2 space-y-1" onClick={(ev) => ev.stopPropagation()}>
                      <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
                        {d.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                      </div>
                      {list.map((e) => (
                        <EventPill key={e.id} event={e} onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }} expanded />
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {allEmpty && (
        <div className="p-10 text-center text-sm text-muted-foreground border-t border-border-soft">
          No events this month — enjoy the quiet! Or create an appointment.
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Week View ---------------- */

function WeekView({
  cursor,
  events,
  onEventClick,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6am-9pm
  const now = new Date();

  return (
    <Panel pad={false} className="overflow-hidden">
      <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        <div className="border-b border-border-soft" />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-b border-l border-border-soft p-2 text-center">
            <div className="text-xs text-muted-foreground">{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
            <div className={cn("text-lg font-semibold", sameDay(d, now) && "text-gold-bright")}>{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="grid relative" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        {hours.map((h) => (
          <div key={`h-${h}`} className="contents">
            <div className="border-b border-r border-border-soft text-[10px] text-muted-foreground px-1 py-1 h-14">
              {formatHour(h)}
            </div>
            {days.map((d) => (
              <div key={`${d.toISOString()}-${h}`} className="border-b border-l border-border-soft h-14 relative" />
            ))}
          </div>
        ))}
        {/* events */}
        {events.map((e) => {
          const dt = new Date(e.start_at);
          const dayIdx = days.findIndex((d) => sameDay(d, dt));
          if (dayIdx === -1) return null;
          const h = dt.getHours() + dt.getMinutes() / 60;
          if (h < 6 || h > 22) return null;
          const top = (h - 6) * 56;
          const endDt = e.end_at ? new Date(e.end_at) : new Date(dt.getTime() + 60 * 60 * 1000);
          const dur = Math.max(0.5, (endDt.getTime() - dt.getTime()) / (1000 * 60 * 60));
          const meta = metaFor(e.event_type);
          return (
            <button
              key={e.id}
              onClick={() => onEventClick(e)}
              className={cn(
                "absolute rounded-md px-2 py-1 text-[11px] text-white text-left overflow-hidden hover:opacity-90",
                meta.bg,
              )}
              style={{
                top: top + 28, // header height adjustment
                height: dur * 56 - 4,
                left: `calc(60px + ${dayIdx} * (100% - 60px) / 7 + 2px)`,
                width: `calc((100% - 60px) / 7 - 4px)`,
              }}
            >
              <div className="font-semibold truncate">{e.title}</div>
              <div className="opacity-90 truncate">{formatTime(dt)}</div>
            </button>
          );
        })}
        {/* now line */}
        {days.some((d) => sameDay(d, now)) && now.getHours() >= 6 && now.getHours() <= 21 && (
          <div
            className="absolute left-[60px] right-0 h-px bg-destructive z-10"
            style={{ top: ((now.getHours() + now.getMinutes() / 60) - 6) * 56 }}
          >
            <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-destructive" />
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ---------------- Day View ---------------- */

function DayView({
  cursor,
  events,
  onEventClick,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const dayEvents = events.filter((e) => sameDay(new Date(e.start_at), cursor));
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);

  return (
    <Panel pad={false} className="overflow-hidden">
      <div className="p-3 border-b border-border-soft bg-surface-2">
        <div className="font-semibold">
          {cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </div>
        <div className="text-xs text-muted-foreground">{dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}</div>
      </div>
      <div className="divide-y divide-border-soft">
        {hours.map((h) => {
          const slot = dayEvents.filter((e) => new Date(e.start_at).getHours() === h);
          return (
            <div key={h} className="flex gap-3 p-2 min-h-14">
              <div className="text-xs text-muted-foreground w-16 pt-1">{formatHour(h)}</div>
              <div className="flex-1 space-y-1">
                {slot.map((e) => {
                  const meta = metaFor(e.event_type);
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className={cn("w-full rounded-md px-3 py-2 text-left text-white text-sm hover:opacity-90", meta.bg)}
                    >
                      <div className="flex items-center gap-2">
                        <meta.icon className="h-4 w-4" />
                        <span className="font-semibold">{e.title}</span>
                      </div>
                      {e.notes && <div className="text-xs opacity-90 mt-0.5">{e.notes}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {dayEvents.length === 0 && (
        <div className="p-10 text-center text-sm text-muted-foreground border-t border-border-soft">Nothing scheduled.</div>
      )}
    </Panel>
  );
}

/* ---------------- Event Pill ---------------- */

function EventPill({
  event,
  onClick,
  expanded,
}: {
  event: CalendarEvent;
  onClick: (e: React.MouseEvent) => void;
  expanded?: boolean;
}) {
  const meta = metaFor(event.event_type);
  const isLapse = event.event_type === "lapse_follow_up";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-white truncate text-left hover:opacity-90",
        meta.bg,
        expanded && "py-1 text-xs",
      )}
      title={event.title}
    >
      {isLapse && <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" />}
      <span className="shrink-0">{meta.emoji}</span>
      <span className="truncate">{event.title.replace(/^[^\w]+\s*/, "")}</span>
    </button>
  );
}

/* ---------------- Create Modal ---------------- */

function CreateEventModal({
  open,
  onOpenChange,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  defaultDate: Date;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createCalendarEvent);
  const searchFn = useServerFn(searchClientsForCalendar);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"appointment" | "follow_up" | "meeting" | "call" | "other">("appointment");
  const [date, setDate] = useState(defaultDate);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [reminder, setReminder] = useState<string>("none");
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientLabel, setClientLabel] = useState("");
  const [clientResults, setClientResults] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setType("appointment");
      setDate(defaultDate);
      setAllDay(false);
      setStartTime("09:00");
      setEndTime("10:00");
      setNotes("");
      setReminder("none");
      setClientQuery("");
      setClientId(null);
      setClientLabel("");
    }
  }, [open, defaultDate]);

  useEffect(() => {
    if (!clientQuery || clientLabel) {
      setClientResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await searchFn({ data: { q: clientQuery } });
      setClientResults(res.clients);
    }, 200);
    return () => clearTimeout(t);
  }, [clientQuery, clientLabel, searchFn]);

  async function submit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const start = allDay
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
        : combineDateTime(date, startTime);
      const end = allDay ? null : combineDateTime(date, endTime).toISOString();
      await createFn({
        data: {
          title: title.trim(),
          event_type: type,
          client_id: clientId,
          start_at: start.toISOString(),
          end_at: end,
          all_day: allDay,
          notes: notes.trim() || null,
          reminder_minutes: reminder === "none" ? null : parseInt(reminder, 10),
        },
      });
      toast.success("Event created");
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Client review meeting" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Event type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">Appointment</SelectItem>
                  <SelectItem value="follow_up">Follow-Up</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reminder</Label>
              <Select value={reminder} onValueChange={setReminder}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="15">15 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                  <SelectItem value="60">1 hour before</SelectItem>
                  <SelectItem value="1440">1 day before</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Client (optional)</Label>
            {clientLabel ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{clientLabel}</Badge>
                <Button variant="ghost" size="sm" onClick={() => { setClientId(null); setClientLabel(""); setClientQuery(""); }}>Clear</Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Search client by name"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                {clientResults.length > 0 && (
                  <div className="mt-1 border rounded-md max-h-40 overflow-auto bg-popover">
                    {clientResults.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-2 py-1.5 hover:bg-surface-2 text-sm"
                        onClick={() => {
                          setClientId(c.id);
                          setClientLabel(`${c.first_name} ${c.last_name}`);
                          setClientResults([]);
                        }}
                      >
                        {c.first_name} {c.last_name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div className="col-span-1">
              <Label>Date *</Label>
              <Input
                type="date"
                value={toDateInput(date)}
                onChange={(e) => setDate(new Date(e.target.value + "T00:00:00"))}
              />
            </div>
            <div className="col-span-2 flex items-center gap-2 pb-2">
              <Checkbox id="allday" checked={allDay} onCheckedChange={(v) => setAllDay(!!v)} />
              <Label htmlFor="allday" className="cursor-pointer">All day</Label>
            </div>
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start time</Label>
                <Input type="time" step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End time</Label>
                <Input type="time" step={900} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating..." : "Create event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Detail Drawer ---------------- */

function EventDetailDrawer({
  event,
  onClose,
  onDeleted,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const deleteFn = useServerFn(deleteCalendarEvent);
  const open = !!event;
  if (!event) return (
    <Sheet open={false} onOpenChange={onClose}>
      <SheetContent />
    </Sheet>
  );
  const meta = metaFor(event.event_type);
  const dt = new Date(event.start_at);
  const clientName = event.client_first_name ? `${event.client_first_name} ${event.client_last_name ?? ""}`.trim() : null;

  async function handleDelete() {
    if (!confirm("Delete this event?")) return;
    try {
      await deleteFn({ data: { id: event!.id } });
      toast.success("Event deleted");
      onDeleted();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete");
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <span className={cn("h-3 w-3 rounded-full", meta.bg)} />
            <Badge variant="outline" className="text-xs">{meta.label}</Badge>
            {event.is_auto_generated && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Sparkles className="h-3 w-3" /> Auto
              </Badge>
            )}
          </div>
          <SheetTitle className="text-left">{event.title}</SheetTitle>
          <SheetDescription className="text-left">
            {dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {!event.all_day && ` · ${formatTime(dt)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 text-sm">
          {clientName && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Client</div>
              <div className="font-medium">{clientName}</div>
            </div>
          )}
          {event.notes && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Notes</div>
              <div className="whitespace-pre-wrap">{event.notes}</div>
            </div>
          )}
          {event.is_auto_generated && (
            <div className="text-xs text-muted-foreground italic">
              Auto-generated by Agent Cloud from your book of business.
            </div>
          )}
          {event.client_id && (
            <MeetingBriefPanel
              clientId={event.client_id}
              eventTitle={event.title}
              eventAt={event.start_at}
            />
          )}
        </div>

        <div className="mt-6 space-y-2">
          {clientName && event.client_phone && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" asChild>
                <a href={`tel:${event.client_phone}`}><Phone className="h-4 w-4" /> Call</a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`sms:${event.client_phone}`}><MessageSquare className="h-4 w-4" /> SMS</a>
              </Button>
            </div>
          )}
          <Button variant="destructive" className="w-full" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" /> Delete event
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- Skeleton ---------------- */

function SkeletonGrid() {
  return (
    <Panel pad={false} className="overflow-hidden">
      <div className="grid grid-cols-7 auto-rows-[minmax(120px,auto)]">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="border-r border-b border-border-soft p-2 last:border-r-0">
            <div className="h-3 w-6 bg-surface-2 rounded animate-pulse mb-2" />
            <div className="h-2 w-full bg-surface-2/60 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------- helpers ---------------- */

function buildMonth(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - first.getDay());
  const today = new Date();
  const todayIso = today.toDateString();
  const out: { day: number; iso: string; inMonth: boolean; isToday: boolean; isPast: boolean; date: Date }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({
      day: d.getDate(),
      iso: localIso(d),
      inMonth: d.getMonth() === cursor.getMonth(),
      isToday: d.toDateString() === todayIso,
      isPast: d < new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      date: d,
    });
  }
  return out;
}

function bucketByDay(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = localIso(new Date(e.start_at));
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }
  return map;
}

function localIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateInput(d: Date) {
  return localIso(d);
}

function combineDateTime(date: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(h: number) {
  const period = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${period}`;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function computeRange(view: ViewMode, cursor: Date) {
  if (view === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(start.getDate() - first.getDay() - 7);
    const end = new Date(first);
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() + 14);
    return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
  }
  if (view === "week") {
    const start = startOfWeek(cursor);
    const end = addDays(start, 7);
    return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
  }
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

function formatTitle(view: ViewMode, cursor: Date) {
  if (view === "month") return cursor.toLocaleString("en-US", { month: "long", year: "numeric" });
  if (view === "week") {
    const s = startOfWeek(cursor);
    const e = addDays(s, 6);
    return `${s.toLocaleString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return cursor.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
