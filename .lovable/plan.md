
## Goal

- `/` becomes a public marketing + waitlist landing page (no auto-redirect to login).
- Login stays at `/login`.
- Visitors can join a waitlist (email + name + optional phone/role) and receive confirmation + future update emails.

## Routing changes

- `src/routes/index.tsx`: replace the auth-redirect stub with the new landing page component. Signed-in visitors get a small "Go to dashboard" button in the nav; not an auto-redirect.
- `/login` unchanged. Header CTA "Sign in" links to `/login`; primary CTA "Join the waitlist" scrolls to the waitlist form.

## Landing page structure (Agent Cloud–branded, gold on white, Bebas display + Inter body — matches existing brand tokens)

Sections, top to bottom, modeled on insuracloud.ai/agents:

1. Sticky top nav — Agent Cloud wordmark left; "Features", "Platform", "Sign in", gold "Join Waitlist" CTA right.
2. Hero — "Your entire life insurance agency. One cloud." + subhead, waitlist email field + Join button, "X agents on the waitlist" social proof counter (live count from DB).
3. Dashboard preview — screenshot/mock of the actual Agent Cloud dashboard (reuse existing components in a decorative frame, non-interactive).
4. "Four powerful tools that run your day" — Pipeline, Calendar, Phone, AI Assistant (icon + 2-line description each).
5. Pipeline visual section.
6. Contracting + commissions section.
7. Downline / team command center section.
8. Sophai AI assistant section.
9. Analytics section.
10. Waitlist CTA band — larger form (first name, last name, email, phone optional, "I am a…" select: Solo agent / Agency owner / Recruit / Other), submit → confirmation state.
11. Footer — small legal, links to `/login`, © Agent Cloud.

Copy is Agent Cloud–specific (life-insurance CRM, contracting, downline, commissions), not a copy of insuracloud's text.

## Waitlist backend

New table `waitlist_signups`:

```
id uuid pk default gen_random_uuid()
first_name text not null
last_name text not null
email citext not null unique
phone text
persona text        -- 'solo' | 'agency_owner' | 'recruit' | 'other'
source text         -- 'landing_hero' | 'landing_cta'
utm jsonb
created_at timestamptz default now()
notified_at timestamptz
```

- RLS on. `GRANT INSERT ON public.waitlist_signups TO anon, authenticated;` and `GRANT SELECT, UPDATE ON public.waitlist_signups TO service_role;` (admins read via has_role policy).
- Policy: `anon` + `authenticated` can INSERT; only `has_role(auth.uid(),'admin')` can SELECT.
- Public count exposed via a SECURITY DEFINER RPC `waitlist_count()` returning `bigint`, granted to `anon`.

Public server route `src/routes/api/public/waitlist-signup.ts`:
- Zod-validated POST (name/email/phone/persona, honeypot field, IP rate-limit via simple in-memory / row rate check by email+created_at).
- Loads `supabaseAdmin` inside handler, inserts row (upsert on email so duplicates are idempotent).
- Enqueues a "waitlist confirmation" transactional email (see below).
- Returns `{ ok: true, count }`.

Public GET route `src/routes/api/public/waitlist-count.ts` → RPC call, returns `{ count }`.

## Waitlist emails

Use existing email infrastructure (already scaffolded, queue-based, gold Agent Cloud template style).

- New template `src/lib/email-templates/waitlist-confirmation.tsx` — "You're on the Agent Cloud waitlist" with brand header, personal greeting, what to expect, link to useagentcloud.com.
- Registered in `src/lib/email-templates/registry.ts`.
- Signup route calls `enqueue_email` via `supabaseAdmin.rpc('enqueue_email', …)` into `transactional_emails` with `template_name='waitlist-confirmation'`, `idempotency_key='waitlist-confirm-<email>'`.
- Broadcast updates later use an admin-only server function `sendWaitlistUpdate({ subject, template })` that iterates `waitlist_signups` in batches and enqueues one message per recipient (respects `suppressed_emails`). Not built in this pass — table + confirmation email only.

## Admin visibility

Small addition to `src/routes/admin.index.tsx`: a "Waitlist" tile with total count + latest 10 signups (server function `listWaitlist` gated by `has_role`). Full page can come later.

## Out of scope this pass

- Broadcast/update email composer UI (table structure supports it; admin can send updates via a later prompt).
- SMS notifications.
- UTM capture beyond storing the query string.
- Custom animations beyond simple fade/slide on scroll (Tailwind + minimal CSS).

## Files touched

- Modified: `src/routes/index.tsx`
- New: `src/components/landing/*` (Hero, DashboardPreview, FeatureGrid, PipelineSection, ContractingSection, DownlineSection, SophaiSection, AnalyticsSection, WaitlistForm, Footer)
- New: `src/routes/api/public/waitlist-signup.ts`
- New: `src/routes/api/public/waitlist-count.ts`
- New: `src/lib/email-templates/waitlist-confirmation.tsx`
- Modified: `src/lib/email-templates/registry.ts`
- New migration: `waitlist_signups` table, grants, RLS, `waitlist_count()` RPC.
- Modified: `src/routes/admin.index.tsx` (waitlist tile) + `src/lib/admin.functions.ts` (`listWaitlist`, `waitlistStats`).
- Head metadata on `/` set to Agent Cloud waitlist copy with proper OG tags.

## Verification

- `curl` POST to `/api/public/waitlist-signup` with a test email → row inserted, email enqueued, count increments.
- Visit `/` unauth → landing renders; visit `/login` → login still works; visit `/dashboard` unauth → still redirects to login as before.
- Playwright screenshot of `/` at 1280×1800 to confirm layout.
