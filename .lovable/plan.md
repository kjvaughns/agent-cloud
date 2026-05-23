## Calendar Page — Implementation Plan

Replace the existing mock `/calendar` route with a fully wired calendar backed by the `calendar_events` table, plus auto-event generation via DB triggers.

### 1. Database migration

Extend `calendar_events`:
- Add columns: `policy_id uuid`, `all_day boolean default false`, `reminder_minutes integer`, `is_auto_generated boolean default false`, `recurrence_rule text`, `color text`
- Expand the `event_type` enum to include: `appointment`, `birthday`, `policy_starting_soon`, `beneficiary_checkin`, `lapse_follow_up`, `policy_anniversary`, `follow_up`, `meeting`, `call`, `other` (keep existing values, add missing ones via `ALTER TYPE ... ADD VALUE`)
- Index on `(agent_id, start_at)`

Auto-event triggers (security definer functions):
- `clients` AFTER INSERT/UPDATE of `date_of_birth` → insert annual `birthday` event (next upcoming birthday)
- `policies` AFTER INSERT with `effective_date` → insert `policy_starting_soon` (effective_date − 30d). Replace existing `policy_after_insert` follow-up to use `policy_starting_soon` type
- `policies` AFTER UPDATE when status → `active` → insert `policy_anniversary` (effective_date + 1y, recurrence `FREQ=YEARLY`). Extend existing `policy_status_lapse_followup` to write `lapse_follow_up` type instead of generic `followup`
- `beneficiaries` AFTER INSERT → look up client's most recent active policy, insert annual `beneficiary_checkin` on its anniversary

RLS already covers agent ownership; no changes needed.

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events`.

### 2. Server functions (`src/lib/calendar.functions.ts`)

All protected with `requireSupabaseAuth`:
- `listEvents({ rangeStart, rangeEnd })` → events in window for current agent
- `createEvent(input)` → inserts manual event (`is_auto_generated=false`)
- `updateEvent({ id, ...fields })`
- `deleteEvent({ id })`

### 3. Calendar page (`src/routes/_authenticated/calendar.tsx`)

Rewrite the existing mock page:
- Header: Today / prev / next, month-year title, view toggle (Day/Week/Month), mini-calendar popover, `+ Create` button
- View persisted in `localStorage` (`calendar:view`)
- **Month view**: 7-col grid, today highlighted, ≤3 event pills + "+N more" popover, color-coded by event type, click day → create modal pre-filled, click pill → detail drawer
- **Week view**: 7 columns × hourly rows 6am–9pm, events as colored blocks, red "now" line
- **Day view**: single column hourly list
- Lapse Follow-Up pills get a pulsing red dot
- Empty-month copy: "No events this month — enjoy the quiet!"
- Skeleton loader while loading
- Realtime subscribe → invalidate query on `calendar_events` changes

Components (under `src/components/calendar/`):
- `MonthView.tsx`, `WeekView.tsx`, `DayView.tsx`
- `EventPill.tsx` (color + icon by type)
- `CreateEventModal.tsx` (title, type, client search, date, all-day, start/end time, notes, reminder)
- `EventDetailDrawer.tsx` (details, auto-generated badge, Call/SMS quick actions if client linked, Edit/Delete)
- `MiniCalendar.tsx`

Color/icon map kept in `src/lib/calendar-meta.ts` matching spec (Blue/Pink/Green/Orange/Red/Purple + lucide icons).

### Out of scope (not implementing this turn)
- Drag-to-reschedule
- Print stylesheet
- Reminder-to-notification cron job (table column reserved; cron job can be added later)
- Mobile swipe gestures

### Technical notes
- Data fetched via `useSuspenseQuery` with `queryKey: ['calendar', rangeStart, rangeEnd]`
- Recurrence handled client-side: annual events expanded into the visible window by adjusting year
- Client search in modal uses existing `clients` table scoped by RLS
