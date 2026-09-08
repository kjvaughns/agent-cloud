# Policy edits that actually stick, everywhere

## What is happening

Editing a policy in Pipeline reports "Policy updated" even when nothing was written to the database. Two separate gates cause it, and neither one produces an error:

1. The save routine only targets rows where the policy's agent is *you* (`agent_id = your id`). Editing a policy that belongs to one of your downline agents matches zero rows.
2. The database write rule for policies allows only the policy's own agent or the agency owner to change it — uplines and contracting/admin staff can see a policy but cannot save one.

Your workspace is the Apex agency, and almost every recent policy belongs to another agent (Pranav, David, Marcus, Alex). So when you edited those policy numbers, the update matched nothing, the form still showed your typing, and Book of Business — which reads live from the policies table — correctly kept showing the old number.

Book of Business is not caching stale data; the change never landed.

## What I will change

**1. Let the right people save**
- Allow a policy to be edited by: its own agent, anyone above that agent in the hierarchy, the agency owner, and agency admin/staff with the existing management permission. Everyone else stays blocked.
- Applies both to the app's save routine and the database write rule, so the two agree.

**2. Never report a save that did not happen**
- The save routine will count the rows it changed and raise a clear error ("You do not have permission to edit this policy") when the count is zero, instead of a success toast.

**3. One refresh path for every policy change**
- Any policy write (Pipeline inline edit, Post Deal, Book of Business status change, retention, imports) refreshes the same shared set of views: pipeline list and client detail, Book of Business, dashboard metrics, leaderboard, finances, reports, and clients overview.
- Implemented as a single helper both pages call, so a new policy-editing screen cannot forget one.

**4. Record who changed what**
- Policy field changes (number, carrier, product, premium, status, dates) get logged to the existing policy history table, so the detail sheet's timeline shows edits, not just status moves.

**5. Repair the edits you already lost**
- The policy numbers you typed were never stored, so they cannot be recovered. After the fix, re-entering them will save. I will confirm one round-trip end to end before handing it back.

## Technical notes

- `updatePolicy` in `src/lib/pipeline.functions.ts`: drop the `.eq("agent_id", userId)` scoping, add `{ count: "exact" }` and throw on `count === 0`; resolve the caller's edit right through the existing `is_in_downline` / `is_org_owner` helpers.
- Migration: replace the `policies_org_modify` policy's UPDATE path so it also permits `is_in_downline(auth.uid(), agent_id)` and agency admin/staff, keeping INSERT/DELETE as they are today.
- New `src/lib/queries/policy-invalidation.ts` exporting `invalidatePolicyViews(queryClient)`; call it from `client-detail-drawer.tsx`, `policy-detail-sheet.tsx`, `post-deal.tsx`, and the retention/import success handlers.
- Field-level history rows written inside `updatePolicy` into `policy_events`, mirroring the shape the status trigger already writes.
