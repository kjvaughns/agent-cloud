# Migrations not yet applied

Migrations are applied by hand in Lovable, so a migration can sit in this
repository for hours or days before the database has it. Code deployed in that
window must still work — see `scripts/migration-safety.ts`, which reads this
file.

**This list is a fallback.** When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are set, the script asks `list_applied_migrations` instead and ignores this
file entirely, because a hand-maintained list going stale is the same kind of
mistake it exists to prevent. Keep it current anyway, for anyone running
without credentials.

Delete a line once the migration is applied.

- `20260803120000_producer-notes.sql`
- `20260805100000_drop-scrape-credentials.sql`
- `20260805110000_revoke-seeded-founder-admin.sql`
- `20260805120000_profile-completeness-and-pii.sql`
- `20260805130000_sample-data-flag.sql`
- `20260805140000_demo-org.sql`
- `20260805150000_book-of-business-sample-flag.sql`
- `20260806100000_user-onboarding-state.sql`
- `20260806110000_carrier-aliases.sql`
- `20260806120000_ai-message-log.sql`
- `20260806130000_nova-usage-and-upsells.sql`

`20260805110000` **revokes platform admin from the two hardcoded founder
emails and does not give it back.** Read its header before applying: the
accounts keep every agency-level power (those key on `organizations.owner_id`),
but lose `/admin` until somebody re-grants it deliberately from the SQL editor.
That is the point of the change, not a side effect of it.

`20260805120000` rewrites `agent_completion()` and adds
`organization_settings.collect_contracting_pii`. Until it applies, every agent
stays capped at 80% — the old function scores two document types the UI cannot
produce — and the Producer Profile reads the new column as absent, which is
`false`, so the sensitive sections stay hidden. That is the intended default,
so the pre-migration state is the safe one rather than a broken one.

`20260805130000` adds `is_sample` to the eleven tables the demo seed writes.
Until it applies, `npm run seed:demo` fails on its first insert — which is the
right failure, because a seed that ran without the flag would leave rows nobody
could tell apart from real ones or remove in one action. Nothing in `src/`
reads the column yet, so the application is unaffected either way.

`20260805140000` adds `organizations.is_demo` and `demo_reset_log`. Until it
applies there is no demo org, and everything downstream reads that correctly
rather than erroring: `demo.server.ts` treats the missing column as "no demo"
and caches it, so the guardrails are inert; the banner renders nothing;
`/demo-login` says the sample agency is not set up yet; and the reset endpoint
returns 200 with `skipped`. Read the migration's tail before applying — the
pg_cron schedule is deliberately left commented, because it needs the site
origin and a vault secret that do not belong in this repository.

`20260805150000` **drops and recreates `get_book_of_business`** to add
`is_sample` to its return shape — Postgres will not `create or replace` a
function whose return type changed. It depends on `20260805130000`, so apply
them in order. One caller reads the rows by name as `any[]`, so the extra
column is additive; until it lands, the Sample chip on the Book of Business
simply does not render.

`20260806100000` adds `user_onboarding_state`, which the role-based onboarding
checklist writes dismissals and completed tours to. Until it applies the
checklist still renders and still derives every step from real data — only the
choices do not stick, so a dismissed step comes back on the next load. The
write catches its own error and logs rather than throwing, because losing a
dismissal is a far smaller problem than a click that fails.

`20260806110000` adds `carriers.naic_code` and the `carrier_aliases` table, and
seeds the aliases for carriers already in the catalog. Until it applies, carrier
matching runs on names alone — the alias and NAIC tiers simply find nothing, and
the confidence threshold still refuses to guess. That is strictly better than
the substring test it replaces, so the pre-migration state is an improvement
rather than a regression.

`20260805100000` clears the stored third-party passwords in `scrape_requests`.
Anyone who submitted one should treat it as disclosed and change it on the
source platform — base64 is not encryption, and the admin queue displayed it.

Until it is applied, `contracting-notes.functions.ts` treats `42P01` as "not
yet": the notes panel shows the audit trail on its own, an attempted note
throws a sentence naming the reason, and the delete is a no-op. The CHECK
constraints in the same file close the submission-method vocabulary on
`contracting_requests.submission_method` and `contracting_submissions.method`,
which are free text until then — and a CHECK is one of this script's stated
blind spots, so nothing will warn about it.

The two queued on 3 Aug 2026 have landed. Checked by looking for each one's
distinctive object rather than by matching filenames, since Lovable renames:

- `20260803010000_recruiting-challenge-audience.sql` →
  `20260803025510_312d5c10`, which carries the `has_downline` gate.
- `20260803020000_academy-course-builder.sql` → `20260804213753_c8f4f981`,
  which carries `academy_modules_kind_check`, `sync_course_duration`,
  `course_progress_agent_module_key`, `can_see_agent_progress` and
  `may_write_academy_media`.

**One thing was changed on the way in, and the code follows it rather than the
other way round.** `20260803020000` created `academy-media` as a public bucket.
This workspace refuses public buckets, so it exists as a private one and the
`insert into storage.buckets` line is absent from the applied file. The policies
are unchanged — writes are still gated on `can_manage_resources` for the folder
— and `src/lib/academy-media.ts` now hands back a signed URL with a ten-year
expiry instead of a public one. That keeps the property the public bucket was
chosen for: a link that does not expire part-way through a lesson.

The seven queued on 2 Aug 2026 were applied together in
`20260802235937_bb40a3c7-23f3-4abb-9d3b-34c755add42c.sql`. Verified by checking
for each one's distinctive object in that bundle rather than by assuming:
`commission_grids_org_row_uniq`, the `org_carriers` backfill,
`commission_level_requests_decide`, `policy_after_insert`,
`writing_numbers_own`, `background_questionnaire` and `caller_is_active` are all
present.

An earlier batch is in
`20260802193054_e04946cb-f497-4d04-a0ba-a573587e18e8.sql`. That bundle improved
on what it replaced in two places worth knowing: `sync_profile_primary_org`
writes only when the value actually changes, because a no-op rewrite still fires
the cross-org hierarchy check and some existing accounts already violate it; and
the org-owner membership backfill computes `is_primary` rather than assuming it.

## What now becomes actionable

Two things were deliberately deferred until these landed, and are now unblocked:

- **The deprecated writing-number columns.** `contract_requests.writing_number`
  and `agent_commission_levels.writing_number` are backfilled and commented, and
  `src/lib/writing-numbers.ts` still dual-writes them with a read fallback. Both
  can go once the backfill has been checked against real data.
- **`20260803000045`** re-declared `get_team_downline_for` as `RETURNS SETOF
  jsonb`, dropping the aggregate columns (`contracts_count`, `policies_count`,
  `premium_total`, `completion_pct`, `missing`) and adding an admin/manager
  gate. `getTeamDownline` already maps that shape defensively; `getTeamRoster`'s
  `fullCompany` branch did not, and is corrected. Nothing in the UI passes
  `fullCompany`, so this was latent rather than live.
