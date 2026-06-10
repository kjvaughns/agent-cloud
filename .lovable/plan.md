## Agent Cloud Full Platform Audit — Execution Plan

This is a large, multi-phase audit. I'll run it as a structured sweep across the codebase and database, then deliver one consolidated report in the exact format you specified. No code changes during the audit pass (other than 1-line obvious fixes called out inline) — anything bigger gets logged as a follow-up.

### Phase 1 — Codebase Inventory (read-only)
Catalog and skim every file in:
- `src/routes/**` (all page + admin + api routes)
- `src/lib/**` (every `.functions.ts` and helper)
- `src/components/**`
- `src/hooks/**`
- `supabase/migrations/**`
- `src/integrations/supabase/types.ts`

For each route/module record: purpose, tables touched, server fns called, role gating, obvious red flags. Output: an internal inventory table I use to drive Phase 2 (not shipped to you unless useful).

### Phase 2 — Static Code Audit
Grep-driven sweeps for known smells:
- `example.com`, `api.anthropic.com`, `ANTHROPIC_API_KEY`, `(demo response)`, `coming soon`, `TODO`, `FIXME`
- `console.log`, `as any`
- `supabase.channel(` without matching cleanup
- `useEffect` + `fetch` patterns (should be loader + query)
- Server fns missing `requireSupabaseAuth`
- Routes under `_authenticated/` that re-implement auth gates
- Components > 500 lines
- Duplicated logic across `.functions.ts` files
- RLS on every public table + GRANTs present

### Phase 3 — Database / Data Integrity Audit
Run read-only SQL via `supabase--read_query`:
- Enum values for `app_role` (confirm super_admin/agency_owner/staff status)
- `commission_grids` duplicate check (the AHL query you specified)
- `policies.carrier_id IS NULL` count by carrier name match
- `commission_schedule` row counts per recent policy
- Spot-check AHL ($42 @ 80%) and GTL ($47 @ 60%) math against actual rows
- Override chain rows for a multi-level policy
- Renewal rows at months 13/25/37/49 for carriers with non-zero `years_2_5_pct`
- RLS policies present on every user-data table
- Missing indexes on hot columns (`policies.agent_id`, `commission_schedule.agent_id`, `clients.agent_id`, `profiles.upline_id`)

### Phase 4 — Role-by-Role Feature Trace
For each of the 5 roles (agent, manager, agency_owner, staff, admin), walk your checklist. Since I can't click through the UI as different users, I trace each checklist item by:
1. Reading the route component
2. Reading the server fn(s) it calls
3. Reading the RLS policy on the touched tables
4. Confirming the role gate
5. Marking ✅ / ⚠️ / ❌ / 🔒 with file + line citation

Where behavior depends on live data, I query the DB directly to confirm.

### Phase 5 — Known-Issue Regression Pass
Verify each of the 8 known issues you listed is actually fixed in current code (file + line proof for each).

### Phase 6 — Cross-Cutting
- Security: RLS, admin route guards, staff scope, SureLC stub, Anthropic refs, hardcoded AI responses
- Performance: N+1s in `getClientDetail`, dashboard cold-load path, realtime subscription cleanup
- Mobile: scan responsive classes on pipeline, drawer, commission grids, admin tables
- Empty states: grep for empty-array renders without fallback UI

### Phase 7 — Improvement Proposals
UX, performance, feature completeness, code quality, plus top-5 missing features ranked by impact for a life-insurance FMO.

### Phase 8 — Final Report
Single message in the exact format you specified (AUDIT SUMMARY → CRITICAL → HIGH → MEDIUM → LOW → DATA INTEGRITY → SECURITY → IMPROVEMENT PROPOSALS → WHAT'S WORKING WELL), every issue with file + line + root cause + concrete fix.

### Ground rules I'll follow
- Read code before claiming anything is broken.
- Cite file + line for every finding.
- Apply trivial 1-line fixes inline (only after you approve and switch to build mode); anything larger is documented for a follow-up prompt.
- Never delete working features.
- Verify commission math against real DB rows, not assumptions.

### Scope confirmation
This will take multiple long tool-call rounds (likely 60–120 reads + a dozen SQL queries). Approve this plan and I'll execute end-to-end and deliver the single consolidated report. If you'd rather I scope down to a subset first (e.g. just Phases 2+3+5 — the cheapest, highest-signal pass — then expand), say which phases.
