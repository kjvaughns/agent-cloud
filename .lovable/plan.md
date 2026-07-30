
# Agent Cloud — AI automation layer

Everything is built on what exists: `callAi`/`callAiJson`, the 12 AI functions, `automation_runs`, `document_intake`, `tasks`, `retention_cases`. Nothing is rewritten. Ship order below is the order things become useful; each phase stands alone.

## What I confirmed first

- `src/lib/ai-gateway.ts` exports `callAi` / `callAiJson<T>` (JSON mode + `{...}` fallback, multimodal parts). All AI goes through it.
- `automation-worker.functions.ts` exports `runDueAutomations` and `listAutomationRuns` — a per-agent runner with the consent + idempotency + SMS-blocked rules already implemented. That is the pattern the scheduler reuses, not replaces.
- `requireNovaPro(userId)` and `trackNovaUsage(userId, metric)` exist in `billing.functions.ts`; `NOVA_LIMITS` in `billing/pricing.ts`.
- **Gaps that need schema:** there is no job-run table (nothing records that a sweep ran); `retention_cases` has no columns for an AI proposal; `organization_settings` has only `notify_new_agent` / `notify_new_ticket` / `notify_contract_request` — there is no switch for an automated agency brief, so one must be added rather than assumed.

---

## Phase 1 — Scheduler + the "what ran" surface

Build the visibility before the automation, per your instruction.

**Schema:** `automation_job_runs` — org, job key, trigger (`cron` | `manual`), status (`running` / `ok` / `partial` / `failed`), `started_at`, `finished_at`, counts (`considered`, `acted`, `skipped`, `errored`), `error`, `detail` jsonb. Org-scoped RLS, owner-readable.

**Entry point:** `src/routes/api/public/hooks/run-automations.ts` (POST). Verifies the `apikey` header, then dispatches registered jobs sequentially, one org at a time. A job registry maps a key → handler so later phases add a line, not a new endpoint. Each job opens its run row, runs inside try/catch, closes with counts. A per-job time budget stops a slow job from starving the rest. AI calls run sequentially in small batches with a short delay — never `Promise.all` over a whole table.

`pg_cron` is scheduled against the stable project URL, hourly, with an empty body.

**UI:** `/agency/automations` (owner-only) — list of recent job runs, status, counts, duration, error, and a "Run now" button per job that calls the same handler through an authenticated server fn.

Phase 1 ships with one real job wired in: the existing `runDueAutomations`, so the scheduler is proven end-to-end before any new AI job exists.

## Phase 2 — Morning agency brief

New job `agency_brief`. Aggregates overnight change through RLS-safe org-scoped queries: policies that entered at-risk, new retention cases, agents stalled in onboarding, contracting requests blocked >7 days, decisions due today. One `callAiJson` call per org producing a structured brief (sections, items, `confidence`), stored in a `agency_briefs` row and rendered on the dashboard for owners.

Email only if a new `organization_settings.notify_daily_brief` is on **and** `may_notify(owner, 'announcements')` passes. Default off. Idempotent on `(org, date)`.

## Phase 3 — Retention triage

Add `ai_priority`, `ai_reason`, `ai_next_action`, `ai_confidence`, `ai_scored_at` to `retention_cases`. Job reads open/working cases with no score (or stale), pulls client + policy + contact history, and writes the proposal back. Never touches `assigned_to`, `status`, or `outcome_note`. Retention page sorts by AI priority with the reason shown inline and low confidence badged, not hidden.

## Phase 4 — Commission variance explanation

For statement lines where `match_status` is `variance` or `unexpected`, an advisory explainer reads the policy, carrier and applicable comp grid and returns one of: wrong level, chargeback, advance timing, split, unexplained — plus a `worth_disputing` flag and confidence. Written to `commission_statement_lines.note` plus new `ai_explanation` / `ai_confidence` / `ai_dispute` columns. Reporting only: no write to `commission_schedule`, and `commission-calculator.ts` is untouched.

## Phase 5 — Onboarding and contracting nudges

Detect stalls from `profiles.status`, `surelc_progress`, `agent_completion()` and stuck `contract_requests`. AI turns the raw blockers into a plain-language description; a `tasks` row is created for whoever can unblock it (upline, or owner for contracting). Idempotent through `automation_runs` keyed on the agent + week, so a stalled agent generates one task, not one per sweep. No email.

## Phase 6 — Pipeline follow-up sweep

Batch version of `getClientAiSuggestions` over stale pipeline clients (stage, temperature, days since last contact). Produces a ranked daily call list per agent — who to call and what to open with — stored per agent per day and surfaced as a dashboard card. Read-only against clients.

## Phase 7 — Document intake, one-click apply

Extend `analyzeIntakeDoc` for the two unambiguous types:
- commission statement → extract lines, stage a draft `commission_statements` + lines, Apply runs the existing `reconcile_statement`.
- lapse report → extract policy numbers, match, present draft retention cases; Apply inserts them.

Everything lands in `document_intake.extracted` first; the row stays `needs_review` until a person clicks Apply. Unmatched rows are shown, not silently dropped.

## Phase 8 — Natural-language ask

Upgrade `askAiAssistant` into a two-step: the model picks from a fixed catalogue of parameterised, whitelisted queries (agent production, persistency by carrier, stalled agents, carrier mix, retention outcomes) and returns arguments; the server executes the chosen query through `context.supabase` so RLS scopes the answer; the model then narrates the returned rows. No generated SQL, no admin client. Gated by `requireNovaPro` + `trackNovaUsage(userId, "ai_queries")`.

---

## Rules applied throughout

- Reads and writes go through the RLS-bound `context.supabase`. The cron entry point has no user, so it iterates orgs with `supabaseAdmin` guarded by `src/lib/org-guard.ts` helpers and never returns rows to a user through that path.
- Nothing autonomously changes a policy, commission row, client or contract. Every phase writes a proposal, a task, or a draft.
- `commission-calculator.ts`, `saveClientFullRecord`, and the disabled `trg_generate_commission_schedule` are left alone.
- Sends require both gates: the org switch and `may_notify()`. SMS stays recorded as `blocked`.
- Every AI value that gets stored or compared comes from `callAiJson` with an explicit schema and a self-reported confidence.
- Fail soft: one bad record is recorded on its own row and the batch continues.

## Verification per phase

`npx tsc --noEmit` and a build, plus running the job twice and showing the second pass acts on zero rows.

## Note on sequencing

You asked not to land all eight together. I'll implement Phase 1 and stop for you to look at the run log before Phase 2 — tell me if you'd rather I keep going through several phases per turn.
