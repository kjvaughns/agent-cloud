
## Goal

Send a branded "You're on the Agent Cloud waitlist" confirmation email every time someone joins from the landing page.

## What's missing today

- Only auth email routes exist (`/lovable/email/auth/*` + `/lovable/email/queue/process`).
- There is no transactional send route, no template registry, and no waitlist template.
- The `/api/public/waitlist-signup` route currently inserts the row but does not enqueue any email.

## Steps

1. Scaffold the transactional email pipeline
   - Call `email_domain--scaffold_transactional_email` to create:
     - `/lovable/email/transactional/send`
     - `/lovable/email/transactional/preview`
     - `/email/unsubscribe` validation route
     - `src/lib/email-templates/registry.ts`
   - Existing auth templates and queue processor stay untouched.

2. Waitlist confirmation template
   - New `src/lib/email-templates/waitlist-confirmation.tsx` matching the existing gold/Bebas Agent Cloud template style (same tokens as `signup.tsx`).
   - Content: greeting by first name, "you're on the waitlist" headline, 3 bullets on what to expect (early access, launch updates, founder-tier discount), CTA button to `https://useagentcloud.com`.
   - Register in `src/lib/email-templates/registry.ts` under `waitlist-confirmation`.

3. Wire the waitlist signup route
   - In `src/routes/api/public/waitlist-signup.ts`, after the row upsert, enqueue the transactional email via the RPC `enqueue_email` with:
     - `queue`: `transactional_emails`
     - `template_name`: `waitlist-confirmation`
     - `recipient`: submitted email
     - `idempotency_key`: `waitlist-confirm-<email>` so re-submissions don't duplicate sends
     - `template_data`: `{ first_name }`
   - `supabaseAdmin` is loaded inside the handler already.
   - Silently ignore duplicate-idempotency errors so returning users still get an `ok` response.

4. Verification
   - POST a test email to `/api/public/waitlist-signup`.
   - Confirm a row lands in `email_send_log` with `template_name = 'waitlist-confirmation'`.
   - Confirm the queue processor drains it.

## Out of scope this pass

- Bulk broadcast composer (still admin-triggered later).
- Editing the unsubscribe branded page — the scaffolded validation route is enough for the confirmation email footer.
