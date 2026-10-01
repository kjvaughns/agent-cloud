# Keep the Vantage Financial book in Agent Cloud, synced from AgentLink

## What you get
- Your AgentLink book (clients and policies) shows up in Agent Cloud's Book of Business, Pipeline, Leaderboard and Finances like any other policy.
- It refreshes on its own every few hours. Changes only flow from AgentLink into Agent Cloud — Agent Cloud never writes anything back to AgentLink.
- A "Sync now" button and a "last synced" time go in Settings > Agency > Integrations, along with a count of what changed and any rows that could not be matched.

## What I found
- Your key is an AgentLink "agency API key" (`al_…`). AgentLink offers three access types for these keys: Book of Business (client and deal data), Business Analytics, and Team Analytics.
- AgentLink has no public documentation for the addresses that accept these keys. When I tried the most likely ones, they either don't exist or turn the key away, so the exact address for reading your book is still unknown.

## Step 1 — Find the right address (needs you, about 2 minutes)
In AgentLink, open the page where you created the key (Settings > API Keys) and check:
1. That the key has **Book of Business** access turned on.
2. Whether the page shows an example request or a "docs" link. If it does, paste it here. If it doesn't, ask AgentLink support: "Which address do I call with my agency API key to list deals/policies, and do I send the key as a Bearer token or an x-api-key header?"

Once I have that, I test the key with a single read-only request and confirm the information it returns before building anything else.

## Step 2 — Build the sync
- Store the key securely as a backend secret for Vantage Financial only — never in the code.
- A background job runs every 3 hours and pulls deals page by page.
- Each AgentLink deal is matched to an Agent Cloud policy by policy number and carrier. Matches are updated; new ones are created under the right client (matched by name + date of birth / phone, or a new client is created).
- The writing agent is matched by email, then NPN, then name. Deals that don't match an agent go to a review list instead of being credited to you.
- Dates go through the existing date cleanup (Excel serial dates, etc.). Carriers are matched against your active carriers using the existing carrier aliases.
- Commissions for new or changed policies are recalculated through the existing single commission calculator.
- Every synced policy is tagged with its source (AgentLink) so a second sync never creates a duplicate.

## Technical details
- New table `external_integrations` (org_id, provider='agentlink', last_synced_at, last_status, counts) plus `external_policy_links` (provider, external_id, policy_id) for idempotent upserts; with GRANTs and owner-only RLS.
- `src/lib/integrations/agentlink.server.ts` client; `agentlink.functions.ts` (owner-only `syncAgentLinkNow`, `getAgentLinkStatus`); cron route `src/routes/api/public/hooks/sync-agentlink.ts` protected by the existing hook-secret check.
- Reuses `toIsoDate`, the carrier alias matching, and `calculateAndInsertAllCommissions`.
- Secret `AGENTLINK_API_KEY_VANTAGE` (keyed by org so other agencies can be added later).

## Open item
- Blocked on Step 1: the AgentLink address and the way the key should be sent.
