# Agency Settings and Carrier System — completion report

Section 18 of the build prompt, in the format it asks for.

Written from what shipped. Where the prompt and the code disagree, the code is
what is described, and where I chose differently from a literal reading, the
reason is given rather than the difference hidden.

---

## 1 — Root causes found

**The grid was write-only.** `commission_grids` has carried `product_name`,
`age_group_min/max`, `year_1_pct`, `years_2_5_pct`, `years_6_plus_pct` and
`level_name` since the first schema in this repository. **Nothing ever selected
from it.** An owner could upload a carrier's full schedule, see it stored, and
every deal would still price at the agent's flat level percentage. A carrier
paying 100% on Final Expense at 55 and 60% at 82 paid the 55-year-old's rate to
an 82-year-old.

**A Florida exception could not be stored at all.** The unique index keyed on
(organization, carrier, product, level, age_min). A state row for the same
product and band as the national row collided with it. The same key also
treated two bands sharing a lower bound as one rule, so a second band starting
at the same age silently overwrote the first on upsert.

**Nine carrier statuses existed nowhere.** Four screens each needed "is this
carrier ready" and each was about to answer it separately.

**Eight tabs, no gate.** Agency Settings became eight tabs on one route with
nothing deciding who could open which — including Carriers, which decides what
agents are paid, and Roles and Permissions, which decides who can change that.

**Discord privacy was a convention.** No sender leaked client data, but only
because each had been written carefully. Nothing structural stopped the next one
rendering a field off the policy row.

**An agent saw the staff vocabulary.** Seventeen statuses including "not in
good order", which reads as the agent's fault and is usually the carrier's
paperwork.

**Three RLS tables were missed.** `20260815050000` was re-recorded and applied
as `20260815045002`, and that re-record omitted `import_jobs`,
`import_duplicates` and `migration_roster` — all three still testing a role
with no organization to bound it.

**Three check scripts were red on `main`** before any of this work started, all
stale assertions from the settings consolidation rather than broken code.

---

## 2 — Files changed

| Added | What |
|---|---|
| `src/lib/carriers/status.ts` | The nine lifecycle statuses, delete-vs-archive |
| `src/lib/carriers/wizard.ts` | Seven steps, progress, the advance ceiling |
| `src/lib/compensation/grid-rule.ts` | Most-specific-row selection, requirements, age-on-date |
| `src/lib/compensation/deal-pricing.server.ts` | Products and questions for one carrier |
| `src/lib/contracting/request-stage.ts` | Nine agent-facing stages over seventeen |
| `src/lib/discord/message.ts` | Allowlist, builders, PII scan |
| `src/lib/settings/tab-access.ts` | Who may open which tab |

| Changed | What |
|---|---|
| `src/lib/compensation/resolve.ts` | Grid layer above the existing tiers |
| `src/lib/contracting-ops.functions.ts` | Carrier list carries its state |
| `src/lib/discord.functions.ts` | Privacy gate in `postToDiscord` |
| `src/lib/permissions.functions.ts` | Six new tab permissions |
| `src/lib/writing-numbers.ts` | Audit inside the recorder |
| `src/routes/_authenticated/settings.agency.tsx` | Tabs gated, landing corrected |
| `scripts/integration-check.sh` | Roles seeded; structural RLS rule |

---

## 3 — Database migrations added

| Migration | What |
|---|---|
| `20260815060000_import-tooling-org-bound.sql` | The three tables the re-record missed |
| `20260815070000_grid-rules-state-risk-and-bands.sql` | State and risk columns, the index fix, age-band and vocabulary checks, Discord delivery uniqueness |

Both forward-only and idempotent. The age-band check is `NOT VALID`, so
applying it cannot reject rows already stored; the header carries the query to
list any that would fail.

**Nothing was reset, dropped or rewritten.** The only index dropped is replaced
in the same statement pair by a wider one that admits strictly more rows.

---

## 4 — Existing systems consolidated

Reuse was the constraint, and it decided several things:

- **The grid layer sits above the existing resolver tiers** rather than beside
  them. Every current caller passes no grid and resolves exactly as before; the
  suite proves it.
- **Two of the eight tab permissions already existed** and are not duplicated —
  Roles reuses `admin_manage_staff_configs`, Contracting reuses
  `staff_edit_contracts`.
- **The status module takes the resolver's own sentences** rather than
  re-diagnosing. A setup screen that disagreed with the deal screen would be
  worse than no setup screen.
- **The wizard has no opinion on readiness.** Its review step hands facts to
  `carrierState` and shows that answer.
- **The nine request stages are a presentation layer**, not a replacement.
  Staff keep every state they had.
- **A second `maskWebhook` was written and then deleted.** One already existed
  in `discord.functions.ts` and keeps the numeric channel id, which is more use.
- **`commission_grids` was extended, not replaced.** The age-band model the
  prompt describes was already there.

---

## 5 — Tests added

| Script | Assertions |
|---|---|
| `grid-rule-check` | 70 |
| `discord-message-check` | 47 |
| `tab-access-check` | 47 |
| `carrier-status-check` | 46 |
| `carrier-wizard-check` | 38 |
| `request-stage-check` | 28 |
| `writing-numbers-check` | +6 |

Plus `scripts/check-all.sh` and `npm run check`, because **36 of the 50
existing check scripts had no `package.json` entry** and nothing ever ran them.

---

## 6 — Test and build results

**Baseline, recorded before editing:**

| | |
|---|---|
| Typecheck | clean |
| Lint | 0 errors |
| Build | clean |
| Check scripts | **51 of 54** — three already failing |

**After:**

| | |
|---|---|
| Typecheck | clean |
| Lint | 0 errors |
| Build | clean |
| Check scripts | **59 of 59** |
| Integration harness | passes, 208 migrations applied |

One honest note: one commit was pushed with a red check
(`contract-compensation-check`, from a new enum member) and fixed in the next.

---

## 7 — Manual journeys completed

**Verified end to end on scratch Postgres**, with every migration applied and
each rule asserted to bite rather than merely to parse:

- A state exception sits beside its national row
- A duplicate national rule is refused
- Two bands sharing a lower bound are two rules, not one
- An inverted age band, a made-up risk class and a non two-letter state code
  are each refused
- Cross-agency reads return nothing in both directions, with the roles the
  product actually issues held

**Verified as pure functions**, against the prompt's own examples:

- Final Expense at 18–70 / 71–80 / 81–85 resolving to 100 / 80 / 60
- Carrier maximum 9 months, agency default 6, agents on 6, 9 and as earned —
  all four permitted, 12 refused
- Training Agent at 50% mapped to a carrier's Level 40 at 40%, with the grid
  row winning over both

**Not run:** the browser journey. See below.

---

## 8 — Remaining limitations

**The user interface for sections 5, 6 and 7 is not built.** The models,
server functions and tests are complete and wired; the Carriers tab still
renders the previous surface rather than the status pills, filters and guided
flow those models describe. Everything a screen needs is available to it — this
is presentation work, not design work.

**Post a Deal does not yet ask for age, state or tobacco class.**
`getCarrierDealOptions` returns which of them a carrier needs, and
`resolveCompensation` prices from them, but the form has not been changed. Until
it is, a banded carrier still resolves through the level percentage — the grid
layer is ready and not yet reached.

**AI extraction of uploaded grids is not implemented.** Section 6 step 3 asks
for detection with a review screen. `bandProblems` reports gaps and overlaps for
that screen and manual grid entry works, but nothing reads a PDF or photograph
yet.

**`invite_sent` cannot be recorded.** Nothing in the schema marks that an
invitation went out. The stage exists so the UI and the eventual column agree
on the name; nothing maps to it, deliberately.

**RLS enforcement of the six new permissions is not written.** Server-side is
done — `assertTabPermission` and `assertCanEditGrids` refuse
`saveOrgCarrier`, `saveGrid` and `saveDiscordSettings` at the endpoint, reusing
the same decision function the interface renders from so the two cannot drift.
`saveAgencyLevel` already had a capability check. What is missing is the third
layer: the database does not yet know about these six keys, so a service-role
path would not be stopped by a policy.

Saving a Discord channel moved from owner-only to the Automations permission,
which is what the prompt asks for. Nobody who could do it before loses it —
`assertTabPermission` returns true for the owner — but it is a real widening,
because a webhook URL is a bearer credential.

**The three RLS tables are unverified against production.** I did not query
your database — the only Supabase project visible was named `readysupport`,
which did not look like agent-cloud. The migration is correct and idempotent
whether or not they are currently leaking, but the live state is unconfirmed.

**No browser test was run.** The four Playwright specs need a served app and
credentials this environment does not have, so section 17's user-interface
cases are covered by string-level wiring assertions rather than by a real
click-through.

---

## 9 — Carrier information that still requires manual owner entry

The prompt asks for a common carrier library with public information, and is
explicit that nothing may be invented. **Nothing was.**

`carriers` already holds name, logo, website and phone. Everything else on the
prompt's list is entered by the owner per agency:

- Agent portal URL
- Contracting website and contracting email
- Support phone number
- Typical turnaround time
- Common products
- Suggested submission method

These are per-agency in practice — two agencies contracting with the same
carrier often use different portals, different emails and different terms — so
they live on `org_carriers` as overrides rather than on the global record,
which is the shape already in place.

No global carrier catalogue was seeded, because I have no verified source for
those fields and the prompt forbids inventing them.
