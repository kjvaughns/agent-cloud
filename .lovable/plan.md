# Apply the six remaining migrations

## What I verified against the live database

| Migration file | Status |
|---|---|
| `20260801120000_scope-layer.sql` | **Not applied** — `scope_agent_ids` / `my_scopes` do not exist |
| `20260801121000_analytics-authorization.sql` | **Not applied** — `get_carrier_breakdown` still has no caller guard |
| `20260802120000_pending-agents.sql` | **Not applied** — `profiles.first_sale_at` and `mark_first_sale` missing |
| `20260802130000_nova-conversations.sql` | **Not applied** — `nova_conversations` / `nova_messages` missing |
| `20260802140000_help-desk.sql` | **Not applied** — ticket routing columns, `can_work_tickets`, `is_platform_operator` missing (base ticket tables exist) |
| `20260802150000_agency-resources.sql` | **Not applied** — no `organization_id` on handbook/scripts/courses, `can_manage_resources` missing |
| Everything up to `20260731140000` | Already applied and verified earlier |
| `20260728100000_owner-consolidation.sql` | Still deliberately skipped — its section 4 deletes an account |

## Plan

1. Run one migration containing all six files in filename order, unchanged apart from the additions below:
   - **Scope layer** — `scope_agent_ids`, `my_scopes`, `get_scope_agents`, plus the rewritten `get_downline_agents` and `get_book_of_business` (mine / team / agency, with `hierarchy` and `agent` kept as aliases).
   - **Analytics authorization** — guard the `_agent` argument on `get_carrier_breakdown`, and narrow `get_agent_analytics` so a global admin role no longer grants cross-org reads.
   - **Pending agents** — `profiles.first_sale_at`, its index, and the `mark_first_sale` trigger that promotes a pending agent on their first policy from any entry point.
   - **Nova conversations** — `nova_conversations` and `nova_messages`, owner-only RLS, indexes, and the `updated_at` touch trigger.
   - **Help desk** — ticket scope/escalation columns, the three `role_permissions` flags, `route_support_ticket`, `can_work_tickets`, `is_platform_operator`, and the replacement ticket RLS policies.
   - **Agency resources** — org ownership and fork columns on handbook sections, scripts and academy courses, `can_manage_resources`, per-table read/write policies, academy module policies, and the module-count sync trigger.
2. Add the `GRANT` statements any of these files omit for newly created tables (`nova_conversations`, `nova_messages`): select/insert/update/delete to `authenticated`, all to `service_role`. Without them the Data API cannot reach the tables even with RLS in place.
3. After it applies: regenerate `src/integrations/supabase/types.ts`, run the typecheck, and re-run the same existence checks so each object is confirmed present.
4. The new **DB Migrations** admin page will then list these entries; I'll confirm they show up.

## Technical notes

- Every file is written idempotently (`create or replace`, `if not exists`, `add column if not exists`), so combining them into one migration is safe and re-runnable.
- Ordering matters: the scope layer replaces `get_book_of_business` before the analytics functions are rewritten, and the help-desk permission flags must exist before its policies reference them.
- No data is deleted or rewritten; existing active accounts are untouched by the pending-agents change.
