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

*(nothing pending)*

Both entries here on 3 Aug 2026 have landed. Checked by looking for each one's
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
