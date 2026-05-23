# My Phone — UI + DB (Twilio/Stripe stubbed)

Rebuild `/phone` per the spec, wired to Supabase for data + realtime. No Twilio calls/SMS actually transmit; no Stripe wallet top-up. Wallet button, Sophai auto-send, voicemail audio, and MMS uploads are deferred.

## 1. Database migration

Existing tables to extend (additive only, RLS already correct):

- `call_logs`: add `outcome text` ('connected'|'no_answer'|'voicemail'|'busy').
- `sms_conversations`: add `unread_count int default 0`, `created_at timestamptz default now()`.
- `sms_messages`: add `twilio_sid text`, `is_auto bool default false`.
- `dial_list_entries`: add `position int default 0`, `notes text`.
- `wallet_transactions`: add `stripe_payment_id text` (forward-compat).

New table:

- `agent_phone_settings(id, agent_id uuid unique → profiles, phone_number text, twilio_sid text, forwarding_number text, forwarding_enabled bool default false, sms_registration_status text default 'pending')` + owner RLS + auto-row on `handle_new_user` (or upsert-on-read in server fn).

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages, sms_conversations;`.

Trigger: on `sms_messages` insert with `direction='inbound'`, bump `sms_conversations.unread_count` and `last_message_at`.

## 2. Server functions (`src/lib/phone.functions.ts`)

All `requireSupabaseAuth`, validated with zod.

- `getPhoneOverview()` — phone settings (upsert default), top-nav unread count.
- `updatePhoneSettings({ forwarding_number, forwarding_enabled, phone_number? })`.
- `listConversations({ filter: 'all'|'unread' })` — joins clients for name/avatar initials.
- `getConversation({ id })` + `listMessages({ conversationId })`.
- `markConversationRead({ id })` — sets `unread_count=0`.
- `sendSms({ conversationId?, toPhone?, body })` — stubbed: inserts `sms_messages` row `direction='outbound'`, `status='sent'`, no Twilio. Creates conversation if needed.
- `startConversation({ clientId?, phoneNumber })`.
- `listRecents({ limit })` / `getCallLog({ id })`.
- `logCall({ phone, clientId?, direction, duration_seconds, outcome })` — stub used by dialer end-call.
- `listDialLists()` / `getDialList({ id })` (with entries + client joins + progress).
- `createDialList({ name, clientIds[] })` / `updateDialList` / `deleteDialList`.
- `recordDialOutcome({ entryId, outcome, notes? })` — sets `called_at=now()`.
- `searchClientsForPhone({ q })`.

## 3. Routes

- `src/routes/_authenticated/phone.tsx` — full rewrite of the existing mock page. Tab state via search param `?tab=phone|sms|dial`. Sidebar label change "Phone & SMS" → "My Phone".
- Drop wallet tab from `/phone`. Keep a disabled "Wallet" button in the top bar with a "Coming soon" tooltip (spec calls for the button; deferring functionality).

## 4. Components (`src/components/phone/`)

```
PhoneTopBar.tsx        # number, status dot, Wallet (disabled), Settings
PhoneSettingsDrawer.tsx
telephone/
  TelephonePanel.tsx   # owns dialer/active-call/sub-tab state
  Dialer.tsx           # input + 3x4 keypad + green call btn
  ActiveCall.tsx       # name, timer (setInterval), 2x3 control grid
  Recents.tsx
  Voicemail.tsx        # static empty state ("No voicemails yet")
sms/
  ConversationList.tsx # search, All/Unread, realtime, unread badges
  MessageThread.tsx    # auto-scroll, sent/received bubbles, Sophai label
  MessageComposer.tsx  # textarea, Enter-to-send, char counter, attach disabled
  NewMessageModal.tsx  # client typeahead OR raw number
dial/
  DialListGrid.tsx     # cards w/ progress
  DialListEditor.tsx   # modal w/ client search + pipeline-stage import
  DialingSession.tsx   # full-screen overlay, contact 7/15, outcome picker
```

Shared:
- `src/lib/phone-format.ts` (E.164 ↔ display, already partial in `lib/format.ts` — reuse).
- Top-nav phone + chat-bubble icons → wire to `/phone` and `/phone?tab=sms`; chat icon shows unread badge (query `getPhoneOverview` cached in root via TanStack Query).

## 5. Realtime + caching

- Single Supabase Realtime subscription mounted in `phone.tsx` for `sms_messages` + `sms_conversations`; on event call `queryClient.invalidateQueries(['phone'])`.
- Active call: `setInterval` 1s ticker in `ActiveCall`.
- Dialer "call" action: opens `ActiveCall` immediately (stub), random connect after 1.5s; "End Call" calls `logCall` then prompts "Add note to client" if duration > 30s (writes to `contact_history`).

## 6. Out of scope (explicit)

- Twilio Voice/SMS network calls, capability tokens, webhooks, MMS upload.
- Wallet top-ups, Stripe, pricing/usage rollup, low-balance banner. Wallet tables stay untouched.
- Sophai auto-send logic (column + label rendering only).
- Voicemail audio playback (empty state only).
- Number provisioning / Twilio number picker (settings shows current `phone_number` text + read-only registration status).

## 7. Verification

After migration + code, manually exercise: send SMS → row appears + realtime updates list; create dial list from 3 clients → start session → record outcomes → progress bar updates; place stub call → log row appears in Recents; settings drawer saves forwarding number.

Approve to start with the migration.