## What I verified first

- The send pipeline (`/lovable/email/transactional/send`), the queue worker, suppression, unsubscribe tokens and `email_send_log` all exist and look sound.
- `registry.ts` registers **only** `waitlist-confirmation`. Six written templates (`signup`, `magic-link`, `recovery`, `email-change`, `reauthentication`, `invite`) are unreachable.
- `email_send_log` has just 2 rows total — effectively nothing has ever been sent.
- 15 files insert `notifications` rows (billing, contracting, onboarding, tasks, transfers, case design, leads, demo requests, funnel applications, SureLC contract approvals, Nova usage limits). None send email.
- Two gaps that block the stated rules as written:
  - **Idempotency is currently impossible.** The send route generates a fresh random `message_id` per request and only uses `idempotencyKey` inside the queue payload — so the `message_id` unique index can never dedupe an event. This must be fixed.
  - **Org-level consent does not exist yet.** `organization_settings` has only `notify_new_agent` / `notify_new_ticket` / `notify_contract_request`. There is no per-category org opt-in and no org email kill switch. `may_notify(profile, category)` (recipient layer) does exist and works.

## Plan

### Phase 1 — Foundation (no user-visible email yet)
1. **Migration**: add to `organization_settings` an `emails_enabled` boolean (default false — absence of configuration means do not send) and an `email_categories` jsonb of per-category opt-ins. Add a `send_key` text column + unique index to `email_send_log` for event-level idempotency.
2. **Fix the send route** so the caller's idempotency key becomes the dedupe key: reuse it as `message_id`/`send_key`, and short-circuit when a row for that key already exists in a non-failed state. Sending twice then produces one email.
3. **One server-side helper**, `src/lib/email/send.server.ts`, exporting `sendTransactionalEmail({ template, to, profileId, orgId, category, key, data })`. It runs the whole gate in one place: environment check → org opt-in → `may_notify` → suppression → idempotency → enqueue. It never throws; every refusal is logged with its reason. The HTTP route becomes a thin wrapper over the same module so there is exactly one code path.
4. **Environment guard**: nothing sends from local/preview unless an explicit opt-in flag is set. Blocked sends are logged as such.

### Phase 2 — Brand layout + register what exists
- One shared `EmailLayout` (`@react-email/components`, table-based, 600px, inline styles, plain-text alternative, image-blocked fallback, dark-mode-safe). Reads real tokens from `src/styles.css`; agency logo/accent from `organizations.logo_url` / `accent_color` only on the `white_label` plan, Agent Cloud mark otherwise.
- Register the six orphaned templates with correct subjects and `previewData`; re-skin them onto the shared layout. This alone fixes auth mail.

### Phase 3 — New templates
Built in category batches, each registered with `previewData`:
- **Onboarding & team** — agent invited, invite accepted, onboarding stalled nudge, carrier added, contract request status changed
- **Money** — commission posted, statement reconciled (variance count), payment failed, subscription activated/cancelled, Nova Pro activated/ended
- **Book of business** — policy at risk, retention case assigned, policy placed
- **Work** — task assigned, daily digest, weekly agency summary
- **Sales & lifecycle** — new lead, demo request (internal), transfer request submitted / action required

No SSN, banking, card or full policy numbers in any body — link into the app instead.

### Phase 4 — Wire the call sites
Every one of the 15 files that inserts a `notifications` row gets a matching `sendTransactionalEmail` call immediately alongside it, through the helper only. Where an event deliberately gets no email (e.g. Nova usage-percentage nudges), a comment states why. Email failure never breaks the action and never suppresses the in-app notification.

### Phase 5 — Digests
High-volume categories (policy at risk, leads, task assigned) route to a digest instead of per-event mail, using the automation job runner already in place: a daily digest job and a weekly agency summary job, both registered next to the existing hourly sweep. Only action-now events send immediately.

### Phase 6 — Visibility
- Admin preview page listing every registered template rendered from its `previewData`, plus a "send test to me" button per template.
- An owner-facing email log view over `email_send_log` (deduplicated by key): template, recipient, status, timestamp, error, with time/template/status filters and summary counts — so "did that email actually send" is answerable.
- Audit UI copy: remove or correct any "we've emailed you" claim not backed by an actual send.

### Verification
`npx tsgo --noEmit` plus a production build after each phase; render every registered template through the preview route; and a live double-send test against the log to prove one email results.

## Technical notes
- The helper lives in a `.server.ts` module called from server functions with service-role credentials, so no per-call JWT round-trip; the existing JWT-gated HTTP route stays for client-triggered sends.
- Org consent is fail-closed: unconfigured org → no send, logged.
- Security/auth and billing-failure mail is exempt from unsubscribe; everything else carries a working unsubscribe link.

## Sequencing
Phases 1–2 are the smallest change that makes real mail work (auth emails start flowing). I'd suggest shipping and eyeballing those before I run 3–6, but I can run straight through if you'd rather.
