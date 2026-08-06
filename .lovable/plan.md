# Apply the 11 pending migrations, then wire the app to them

Verified before writing this: `producer_notes`, `nova_feature_usage` and `carrier_aliases` do not exist in the live database, and `retention_cases.risk_reason` currently allows only `lapse_pending`, `payment_failed`, `nsf`, `cancelled_pending`, `manual`, `no_contact` — so `scanLapseRisk` genuinely has no honest value to file under. `MISSING_SIGNALS` (payment mode) and `MISSING_INPUTS` (stated income) both exist as documented.

## Important: one migration removes your own admin access

`20260805110000_revoke-seeded-founder-admin.sql` revokes platform admin from `info@kingofsales.net` and `kjvaughns13@gmail.com` and does not give it back. Both accounts keep every agency-level power (agency settings, roles, contracting, billing — those key on organization ownership). What they lose is the cross-tenant `/admin` portal, until re-granted deliberately from the SQL editor:

```text
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = '<address>'
on conflict do nothing;
```

Approving this plan is the confirmation to run it. If you'd rather keep `/admin` for now, say so and I'll apply the other ten and leave this one queued.

## 1. Apply the migrations, in the given order

`20260805100000` (clears the base64 third-party passwords) goes first, then producer notes, the founder revoke, profile completeness + contracting PII flag, the sample-data flag, the demo org, the book-of-business sample flag (depends on the sample-data flag — it drops and recreates `get_book_of_business`), user onboarding state, carrier aliases + NAIC, the AI message log, and Nova usage + upsell events.

The demo-org migration's pg_cron schedule stays commented, as its own tail instructs.

Anyone who ever submitted a CRM password through the old migration flow should treat it as disclosed and change it on that platform.

## 2. Regenerate types and drop the stale `any` casts

Regenerate `src/integrations/supabase/types.ts` from the live schema, then remove the "generated types predate" casts where the new types now cover them (`ai-features.functions.ts`, `nova-gate.functions.ts`, `contracting-notes.functions.ts`) — leaving any cast whose table still isn't in the generated types.

## 3. Three schema additions that are not in the migrations

A small follow-up migration:

- `policies.premium_mode` (text, nullable) — the importer already parses it correctly (including "12" meaning monthly) and throws it away.
- `clients.annual_income` (numeric, nullable) — currently appended to a notes string.
- `'predicted'` added to the `retention_cases.risk_reason` check constraint.

Then wire them: importer writes both columns; `lapse-risk.ts` gains a payment-mode factor and loses that `MISSING_SIGNALS` entry; `policy-review.ts` uses stated income and loses that `MISSING_INPUTS` entry; `scanLapseRisk` files retention rows as `predicted`.

## 4. Verify end to end, not just "table exists"

The code degrades silently when these tables are absent, so presence proves nothing. I'll drive the running app with a headless browser signed in as your account and confirm each path, reporting verified vs. assumed:

- a note saves on the agent contracting tab and survives a reload
- a dismissed checklist item stays dismissed after reload
- an import matches a carrier by alias rather than exact name
- a Nova draft writes an `ai_message_log` row and returns `logged: true`
- **the Nova Pro gate** — it currently fails open, so nothing is gated at all. Confirm a non-subscriber gets exactly one free lapse scan, compliance screen and review prep, and is blocked on the second attempt.
- an upsell card impression records a row
- the demo banner and sample-data chips appear where the new `is_demo` / `is_sample` flags say they should

Nothing that deliberately degrades gets changed: where a table still can't be read, the documented fallback stays the outcome. `scripts/migration-safety.ts`'s REVIEWED map is the reference.

## 5. Close out

Run `npm run check:migrations`, then delete only the `PENDING.md` lines for migrations that actually applied.

## Report back

Which applied cleanly, which failed and why, and which connections in step 4 were verified in the running app versus only inferred from schema.
