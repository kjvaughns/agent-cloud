# End-to-end tests

Browser-driven tests against a running Agent Cloud. Four role walks, an
accessibility pass, visual regression, and the one test that matters — the full
loop from an invite to a reconciled commission.

---

## The honest state of this suite

**The full-loop spec has never been executed.** It was written from the schema
and the server functions, not from a passing run. Until somebody points it at a
seeded environment it is a specification of the loop, not evidence about it.

That matters because the roadmap's own prediction is that it **fails today at
step (c)** — an invite's pre-assigned carriers not arriving as unassigned
`contracting_requests` in the owner's queue. If your first run fails there, the
suite is working correctly and the application is not.

The selectors in `full-loop.spec.ts` are the part most likely to need adjusting
on that first run. They match visible text because the app has no test ids
today; adding `data-testid` to the elements the loop touches is the right
follow-up once the real failures are known.

### Nothing here skips

There is no `test.skip()` on a missing environment anywhere in this directory,
deliberately. A run that checks nothing and reports green is worse than no run,
because somebody believes it — and this repository has already paid for that
lesson. `scripts/mobile-check.mjs` shipped with `waitUntil: "networkidle"`, two
animated pages never settled, both timed out, and **both were counted as
passes** until the categories were separated.

So a missing credential throws with the name of the variable that is missing.
CI without secrets fails on the first spec rather than walking zero pages and
saying it walked them all.

---

## Running locally

```bash
# One shell
npm run dev

# Another
export E2E_OWNER_EMAIL=...      E2E_OWNER_PASSWORD=...
export E2E_MANAGER_EMAIL=...    E2E_MANAGER_PASSWORD=...
export E2E_STAFF_EMAIL=...      E2E_STAFF_PASSWORD=...
export E2E_AGENT_EMAIL=...      E2E_AGENT_PASSWORD=...

npm run e2e                     # everything
npm run e2e -- nav-walk         # one spec
npm run e2e:ui                  # pick and step through
```

Chromium resolves from `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`),
so **do not run `playwright install`** — the browser is already there. Override
with `CHROMIUM_PATH` if you need a specific binary.

## Against a deployed environment

```bash
E2E_BASE=https://agent-cloud-git-my-branch.vercel.app npm run e2e
```

Setting `E2E_BASE` skips starting a local dev server. This is how to drive the
suite from a Cowork session for exploratory testing between releases: point it
at a preview URL, run the nav walk, and read the HTML report.

---

## What the four accounts need

All four in **one organisation**, because the loop crosses between them.

| Variable | Who |
| --- | --- |
| `E2E_OWNER_*` | Agency owner — `organizations.owner_id` |
| `E2E_MANAGER_*` | A producer with a downline |
| `E2E_STAFF_*` | `role = 'staff'` with `staff_is_admin` and `staff_view_contracts` |
| `E2E_AGENT_*` | An activated producer, no downline |

The full loop additionally needs:

- **At least two carriers on the agency** (`org_carriers`). Override the names
  with `E2E_CARRIER_A` / `E2E_CARRIER_B`; they default to Mutual of Omaha and
  Foresters Financial.
- **A comp grid row** for a level the test agent is assigned to in
  `agent_commission_levels` — without it `commission-calculator.ts` returns
  early and queues the policy for backfill, and step (g) will correctly report
  that no schedule was generated.

`npm run seed:demo` builds an organisation of roughly this shape. It does not
create auth users; `npm run demo:provision` does that.

> **Do not point this at production.** The loop creates a contracting request,
> a writing number, a policy and a commission statement, and nothing tears them
> down. Use a scratch organisation.

---

## Visual regression

No baselines are committed. A screenshot baseline can only be generated against
a running app with real data, and one produced from an empty database fails on
everybody's first run for reasons unrelated to their change — which trains
people to run `--update-snapshots` reflexively, which is the same as not having
the tests.

First run against a seeded environment:

```bash
npm run e2e -- visual --update-snapshots
```

Then **look at what it wrote** before committing it. That commit is the
baseline.

---

## Accessibility

`a11y.spec.ts` runs axe-core on the ten highest-traffic pages and fails on
`critical` and `serious` violations only.

`moderate` and `minor` are excluded on purpose: this codebase has never had an
axe pass, enabling everything would produce thousands of findings on day one,
and a permanently red suite is one nobody reads. Tighten it once these pass.

---

## CI

`.github/workflows/e2e.yml` runs the nav walk and the accessibility pass on pull
requests. It needs the eight credential secrets above set on the repository.

**Until those secrets exist the job fails, and that is intended** — a green
check from a run that had no credentials would be a lie about coverage.

The full loop and visual regression are deliberately not in the PR job:

- The loop writes real rows and needs a scratch organisation per run to be
  repeatable.
- Visual baselines differ enough between a CI runner and a developer's machine
  that they belong in a scheduled job on fixed hardware.

Both are runnable on demand with `workflow_dispatch`.
