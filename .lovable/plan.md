# Levels ↔ carriers, the Carriers tab, and a guided Add Carrier flow

## What is already in place (verified in the code)

- Levels and Positions (`src/components/contracting/levels-panel.tsx`) already edits name, base percentage, active, "can build a downline", and per-carrier level mapping with a suggested match by closest base percentage, and it already hides higher positions from agents (`listAgencyLevels` returns only the agent's own position and below).
- The Carriers tab (`src/components/contracting/carrier-setup.tsx`) already has search, a status filter across the full lifecycle, active / needs-setup counts, an Add carrier button, an activation toggle gated on readiness, and Delete-vs-Archive with a usage check.
- Carrier lifecycle statuses and the "what is stopping this going live" reasons live in one module (`src/lib/carriers/status.ts`), sourced from the compensation resolver.
- Grid upload already accepts several files at once (PDF, photo, screenshot, spreadsheet), extracts with AI into a reviewable matrix with age bands as first-class rows, and never saves without the owner pressing save (`manage-grids.tsx`, `comp-grid.functions.ts`).
- A seven-step wizard model already exists at `src/lib/carriers/wizard.ts` — and nothing imports it. Add Carrier is still a single dialog.

So the remaining work is four gaps, not a rebuild.

## Gap 1 — Add Carrier becomes the guided flow

Replace the single Add-carrier dialog with a stepped flow driven by the existing `WIZARD_STEPS` model, saving after every step so leaving and returning never loses work:

1. Choose a carrier — searchable library picker, or add a custom (agency-private) carrier.
2. Basic settings — display name, website, agent portal, contracting email, support contact, turnaround, products, staff notes.
3. Compensation grid — the existing multi-file upload and review matrix, embedded, and skippable.
4. Review carrier levels — level name, base percentage, rank, active, product/age-band rates.
5. Advance — carrier maximum plus agency default, capped at the maximum.
6. Contracting method — one or more methods, one marked default, with staff instructions.
7. Review and activate — full summary including position mappings, advance, method, and any fallback in use, with the plain warning that product/age rates are not available yet when the grid is missing.

Editing an existing carrier reopens the same flow at any step.

## Gap 2 — Grid review screen flags its own problems

The review matrix will surface, before saving: low-confidence extraction cells, missing age coverage, overlapping age bands, products with no rate, and level names it could not read. Purely a review aid — nothing is auto-corrected, nothing publishes unreviewed.

## Gap 3 — Carrier library fields

Step 1 shows what the shared library actually holds (name, logo, website, agent portal, contracting site and email, support phone, common products, typical turnaround, suggested submission method), leaves unknown fields blank rather than inventing them, keeps global records read-only for agencies, and stores every agency edit as its own override.

## Gap 4 — Levels tab surfaces the mapping work

The mapping editor moves out from behind the "Match carrier levels" link into the position editor's main body: every active carrier listed, its suggested match shown as a suggestion requiring confirmation, and an explicit "Use position percentage as fallback" choice for carriers with no matching level. The Levels list gets the example ladder as a one-click starter (Training Agent 50, Agent 60, Supervising Agent 65, General Agent 70, MGA 80) for an agency with no positions yet.

## Technical notes

- No new tables. `org_carriers`, `carrier_comp_levels`, `commission_grids`, `agency_levels`, `agency_level_carrier_mappings` and `org_carrier_methods` already carry all of this; only additive columns if the library metadata or extraction-confidence flags turn out to have nowhere to live.
- Readiness, activation gating and Delete-vs-Archive keep coming from `src/lib/carriers/status.ts` — the wizard's final step asks it rather than forming a second opinion.
- Compensation lookup precedence is unchanged and stays in `src/lib/compensation/resolve.ts`; this work only feeds it better data.
- Existing checks (`carrier-wizard-check`, `carrier-status-check`, `carrier-levels-check`, `comp-grid-model-check`, `settings-ia-check`) are extended to cover the new flow and the review flags.
