# Security and permissions — audit 2026-09-10

Scope: all 80 `src/lib/*.functions.ts`, `src/routes/api/**`, `src/lib/org-guard.ts`, role helpers.
Every finding below was re-verified by hand after the automated sweep; claims the sweep
over-reported are recorded as *not a finding* so a later reader does not re-chase them.

## Confirmed CRITICAL

### S-1 Cron hooks authenticate with the public key
`src/routes/api/public/hooks/run-automations.ts:16-28`,
`src/routes/api/public/hooks/process-imports.ts:21`,
`src/routes/api/public/hooks/demo-reset.ts:37`

All three compare the caller's `apikey` header against
`process.env.SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_ANON_KEY`. That value is shipped in the
browser bundle (`src/integrations/supabase/client.ts`, `VITE_SUPABASE_PUBLISHABLE_KEY`), so it
is not a secret. Anyone who loads the app can call these endpoints.

Blast radius, worst first:
- `run-automations` accepts an arbitrary `orgId` in the body (`:39-42`) and runs
  `runAllJobs({ orgId, trigger: "cron" })` — an outsider can force automation jobs (email, SMS,
  notifications) for **any** agency, repeatedly.
- `process-imports` re-processes stalled imports on demand.
- `demo-reset` wipes and reseeds `is_sample` rows only — low impact, same broken model.

`dispatch-announcements.ts:14-20` already fixed this class of bug and uses
`ANNOUNCEMENT_DISPATCH_TOKEN`. Fix: a server-only `CRON_SECRET`, plus a migration updating the
pg_cron job headers in the same change (code-only change breaks the schedules).

Severity: Critical.

## Not a finding (sweep over-reported)

- `src/lib/onboarding.functions.ts` — the id-taking functions (`addCarriersToInvite:849`,
  `updateInviteCarrierLevel:908`, `resendInvite:933`, `listOnboardingDocs:944`,
  `recordOnboardingDoc:958`, `getOnboardingDocSignedUrl:981`, `updateChangeRequestStatus:1050`,
  `deleteChangeRequest:1065`, `getActiveContractsForAgent:1205`) all use the **RLS-bound**
  `context.supabase`, not `supabaseAdmin`. The policies verified in the database are org-scoped:
  `invitation_links_org` (USING `created_by = auth.uid() OR organization_id IN my_org_ids()`,
  WITH CHECK owner-or-creator), `onboarding_documents_org_select/_org_modify` (org + own/downline
  /owner), `change_requests_*` (submitter, agent, downline, admin-of-agent). No cross-tenant path.
- `src/lib/agency-overview.functions.ts:20-30` — derives `orgId` from
  `getMyPrimaryOrgId(userId)` and builds the id list from that org's active memberships. No
  caller-supplied ids.
- `src/lib/agent-onboarding.functions.ts:63-86` — takes `agent_id` but refuses unless
  `agentId === userId` or the target shares the caller's `organization_id`.

## Verified sound

- `requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts:9-73`) validates the bearer
  JWT and hands the handler an RLS-bound client, never service role.
- Only two function files are unauthenticated by design: `demo.functions.ts:119-159` (mints a
  magic link for at most three accounts inside an `is_demo` org; returns only a token hash) and
  `public-agent-page.functions.ts` (published agent landing pages).
- `src/routes/api/stripe/webhook.ts:343-384` verifies the Stripe signature before any write.
- `src/routes/api/v1/*` uses hashed API keys with per-key scopes
  (`authenticate.server.ts:78-141`) and scopes reads to the key's own org; no client PII exposed.
- Legacy role `admin` is present in every role list checked: `src/hooks/use-role.ts:6,64,86-99`,
  `src/lib/invitations/permissions.ts:39-47`, `src/lib/admin.functions.ts:14-23`.
- Platform-admin helpers in `admin.functions.ts:34-67` are correctly narrowed to `super_admin`.

## Major

### S-2 `setAgentPosition` has no RLS backstop
`src/lib/team.functions.ts:690-829` writes through `supabaseAdmin` precisely because RLS
(`profiles_org_manage`) would refuse a manager (`:811-815`). The whole access boundary for that
mutation is ~140 lines of hand-rolled checks. A regression there is a silent full bypass.
Fix: route it through `org-guard.ts` helpers and cover it with a test.

### S-3 Silent failures that hide security-relevant writes
`src/lib/contracting-ops/audit.ts:98-99,127-128` — audit-log writes for document access and
actions fail with a `console.error` only. An audit trail can be missing with no signal.

## Follow-up still open
- A route-by-route pass over `isAdmin`/`canX` conditionals in `src/routes/**` cross-referenced
  against the server functions they call.
- Public lead-capture endpoints: **checked and closed.** `landing-lead:28`, `lead-submit:30`,
  `funnel-apply:30`, `funnel-view:21`, `waitlist-signup:131`, `demo-request:47`, `page-data:25`,
  `branding:39`, `plans:27` all call `guardPublicEndpoint` with per-IP and global caps.
