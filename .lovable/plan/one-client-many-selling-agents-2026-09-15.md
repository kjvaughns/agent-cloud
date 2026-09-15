# One client, many selling agents

Today a client record belongs to exactly one agent. If a second agent writes a policy for that same person, the client never appears in the second agent's pipeline, so agents create duplicate records for the same household. Policies already store their own selling agent, so the credit side is close — but the client record, its details, and its notes are single-owner.

This change makes a client shared by every agent who sells them, while keeping production and commission credit strictly on the policy's selling agent, and giving every agent their own private notes on that client.

## What changes for agents

- A client can have several selling agents. The person who created the record stays the primary contact; anyone who writes a policy for them is added automatically.
- The client shows up in the pipeline and client list of every attached agent.
- Every attached agent can open and edit the client's full details, including card and bank info, the same as today's owner.
- Notes are individual. Each agent sees the notes they wrote on that client. Agency owners, staff and uplines can still see everyone's notes, with the author's name on each one.
- Production, premium and commissions always follow the agent on the policy — never the client record. Two agents selling the same household each get credit for their own policy only.
- Nothing is removed: existing clients keep their current owner, and history stays intact.

## How agents get attached

- Automatically, the moment a policy is saved for that client (Post a Deal or the client screen).
- Historical data is backfilled once, so every past policy's writing agent is attached to that client immediately.

## Technical detail

**Schema (additive only)**

- New table `public.client_agents`: `client_id`, `agent_id`, `organization_id`, `role` (`owner` | `selling`), `created_at`; unique on (`client_id`, `agent_id`). Grants for `authenticated` and `service_role`, RLS on.
- Backfill in the same migration: one `owner` row per existing `clients.agent_id`, plus one `selling` row per distinct `policies.agent_id` / `client_id` pair.
- `clients.agent_id` stays and keeps meaning "primary contact" — nothing is dropped or renamed.
- Security-definer helper `public.is_client_agent(_client uuid, _user uuid)` for policy use, plus `public.client_ids_for_agents(uuid[])` for scoped reads.

**RLS**

- Extend the SELECT and ALL policies on `clients`, `client_banking`, `client_health`, `client_financials`, `beneficiaries`, `needs_analysis` and `contact_history` with `public.is_client_agent(...)` alongside the existing owner / downline / org-owner branches. Existing branches are left in place.

**Reads and writes**

- `src/lib/pipeline.functions.ts`: replace `.in("agent_id", agentIds)` client reads with an attachment-based id set (attached OR `agent_id` in scope). Same for the beneficiary back-reference query and the count/overview queries in `src/lib/clients-overview.functions.ts` and `src/lib/nova-context.server.ts`.
- `savePolicy` / `postDeal` (`src/lib/post-deal.functions.ts`, `pipeline.functions.ts`): upsert a `client_agents` row for the writing agent after the policy insert.
- Notes: `contact_history` already carries `agent_id`. The Notes tab (`src/components/pipeline/notes-tab.tsx`, drawer filters in `client-detail-drawer.tsx`) filters to the viewer's own entries; owners, staff and uplines get the full list with author labels. New notes always record the current agent.

**Credit audit**

Walk Book of Business, leaderboard, records, dashboard and finances queries to confirm every production and commission read groups by `policies.agent_id`, not `clients.agent_id`, and fix any that use the client owner.

**Verification**

- Attach a second agent by writing a policy on an existing client; confirm the client appears for both, details are editable by both, and each sees only their own notes.
- Confirm the shared client contributes premium to each agent only for their own policy, and agency totals are unchanged.
- Typecheck, build, and a Playwright pass over the pipeline and client screen.
