# The demo agency

Summit Life Partners is a working sample agency anybody can log into at
`/demo-login` — three buttons, no form, no email capture, no sales call.

That is the whole competitive point. HawkSoft asks for twelve fields before it
shows anything, Better Agency wants a discovery call, and AgencyBloc's "free
trial" routes to sales. Being the one life-insurance platform a prospect can
actually get inside is worth protecting, so resist adding a field to that page.

## It is a tenant, not a mode

The demo org is an ordinary row in `organizations` with ordinary memberships,
ordinary RLS and ordinary data. Nothing about it is special-cased in the query
layer. **If the demo breaks, production is broken** — that is the point of
building it this way, and the reason there is no `if (demo)` anywhere near a
select.

The only state that cannot be inferred lives in `20260805140000_demo-org.sql`:

- `organizations.is_demo` — one flag, three readers: the guardrails, the
  banner, and the nightly reset. A unique index allows exactly one.
- `demo_reset_log` — one row per reset, so a reset that silently stopped
  running is visible before a prospect finds it.

## Setting it up

Once per deployment:

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_PASSWORD=<something long> \
  npm run demo:provision
```

That creates the org, three accounts (`demo-owner@`, `demo-manager@`,
`demo-agent@`), their profiles, memberships, roles and hierarchy, then seeds the
data. It is idempotent — re-running reconciles rather than duplicates, because
the first thing you want to do to a broken demo is run the provisioner again.

`DEMO_PASSWORD` is required with no default. The password is not what protects
these accounts — the guardrails are — but a default committed here would be a
default everywhere this ever ran.

To reseed the data without touching the accounts:

```
npm run seed:demo -- --org <demo org uuid>
```

## What the demo is not allowed to do

Reads all work. Most writes work too: a demo where nothing works is worse than
no demo, because a visitor who clicks "Add client" and gets a shrug learns that
the *product* does not work.

Five things are refused, and they share a shape — each reaches outside the
database and touches somebody who did not ask to be part of a demo. The guards
live in `src/lib/demo.server.ts`, at the call sites rather than in RLS, because
"this is an email send" is not a fact the database has.

| Refused | Where |
| --- | --- |
| Email | `sendTransactionalEmail`, before idempotency so a refusal does not burn the key |
| Billing and checkout | `createCheckoutSession`, `createPortalSession` |
| Invites | `createOnboardingInvite`, and — more importantly — `acceptInviteCreateAccount` |
| Outbound webhooks | `announceDeal`, `sendDiscordTest` |
| Deleting the org | nothing to guard: no code path deletes an organization |

Two notes on that table. Blocking invite *acceptance* matters more than blocking
invite *creation*: a real account created inside the demo would be wiped by the
nightly reset, and the person who made it would have no way to know why their
agency vanished. And there is no SMS sending code in this repository at all —
only wallet transaction types in the schema — so there was nothing to guard.

## The nightly reset

`POST /api/public/hooks/demo-reset`, authenticated by the project's publishable
key in the `apikey` header, same as `run-automations`. Scheduled by pg_cron; the
statement is at the bottom of the migration, deliberately left commented because
it needs the site origin and a vault secret.

It clears every `is_sample` row in the demo org and re-seeds. It does **not**
delete the org, its memberships, its accounts, or carrier configuration that is
not flagged sample. Those are the demo rather than data inside it, and
rebuilding them on a timer would mean minting auth users nightly.

A partial clear is treated as a failure rather than a warning: re-seeding on top
of rows that would not delete is how a demo ends up with two hundred clients and
eleven copies of the same policy by the end of the month.

Check on it with:

```sql
select started_at, status, rows_cleared, detail
  from demo_reset_log order by started_at desc limit 10;
```

A row still saying `running` an hour later means a reset died mid-flight.

## The banner

Not dismissible, on every page, for the whole session. A banner you can close is
gone by the third screen, and by then the visitor has been reading Marcus Webb's
book of business for ten minutes without being told it is invented. Clearly
labelled sample data builds trust; data pretending to be real destroys it the
moment somebody notices, and in insurance somebody always notices.

## The same seed, for real agencies

A new solo workspace is offered "Start with sample data so I can look around",
default on, and it runs the same seed against the new org. That is deliberate:
three copies of a fixture drift, and the copy that drifts is always the one
nothing tests.

What keeps it safe is the same flag. Every seeded row carries `is_sample`,
clients and policies render a "Sample" chip, and Agency Settings has a
**Clear sample data** button that removes all of it in one action — with a
confirmation that says what *survives*, because the fear it has to answer is
"will this delete my real clients".

Seeding also must not lie to the agency about its own progress. The setup
checklist's "Post your first deal" counts non-sample policies only; without
that, an agency that accepted the default would be congratulated on
fifty-two deals it did not write.

## One deviation from the plan

The plan's CTA was "Start your own free account". There is no free account —
Agent Cloud is invite-only for agencies and paid for solo producers — so the
page offers the two real next steps instead. A CTA promising something untrue
would be the first thing a prospect discovered about us.
