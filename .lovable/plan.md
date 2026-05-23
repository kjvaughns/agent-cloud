## Book of Business — Full Build Plan

Replace the current mock-data `book-of-business.tsx` with a real, Supabase-backed implementation matching the spec.

### 1. Database

Migration adds:
- RPC `get_book_of_business(scope text, target_agent uuid)` — SECURITY DEFINER, uses recursive CTE walking `profiles.upline_id` from `auth.uid()` downward. `scope` = `'hierarchy' | 'mine' | 'agent'`. Returns joined rows: policy fields + `client_first_name`, `client_last_name`, `agent_first_name`, `agent_last_name`, `carrier_name`.
- RPC `get_downline_agents()` — returns id, first_name, last_name for the agent picker.
- Trigger on `policies` UPDATE: when `status` transitions to `lapse_pending`, insert a `calendar_events` row (event_type `followup`, 3 days out) for the writing agent. Status → `active` already triggers existing `generate_commission_schedule`; extend to fire on UPDATE too (currently INSERT-only — add AFTER UPDATE branch guarded against duplicates).

### 2. Server functions (`src/lib/book-of-business.functions.ts`)

- `listBookOfBusiness({ scope, agentId })` — calls RPC via authed client.
- `listDownlineAgents()` — RPC wrapper.
- `updatePolicyStatus({ policyId, status })` — updates `policies.status`.
- `getCarrierSyncMeta()` — placeholder returning `{ enabled: false }` (carrier integration not wired).

### 3. Route component (`src/routes/_authenticated/book-of-business.tsx`)

Full rewrite, hydration-guarded `useQuery` (same pattern as pipeline). Structure:

- **Header**: title + subtitle, right-aligned source toggle `[Agents | Carrier]`. Carrier tab shows "Integration pending" empty state.
- **Filters row**: Carrier dropdown (from `carriers` table), Hierarchy dropdown (Entire / Mine / per-agent from `listDownlineAgents`), "View My Policies" quick button, Status dropdown, search input. Active filter chips below.
- **Status summary cards**: horizontal row, one per status (10 statuses + Total), colored, clickable to toggle status filter. Multi-select.
- **Summary stats bar**: Total Policies, Total Annual Premium, Active Rate %, Avg Policy Size — derived from filtered rows.
- **Table**: sortable headers, sticky header, default sort `posted_at desc`, pagination (25/50/100), Agent column conditional on hierarchy view, Annual Premium bold green, carrier_integration rows show 🔗 icon. Row click → opens detail sheet.
- **Detail sheet** (`src/components/book-of-business/policy-detail-sheet.tsx`): client info, policy summary card, status dropdown (calls `updatePolicyStatus` with optimistic update + toast), commission summary from `commission_schedule` (sum for this policy), link to `/pipeline?client=<id>`.
- **Empty states**: no policies → centered CTA to `/post-deal`; filtered-empty → "Clear Filters".
- **Export CSV**: client-side via `papaparse` (already installed); filename `AgentCloud_BookOfBusiness_<YYYY-MM-DD>.csv`.
- **Loading**: skeleton rows.

### 4. Shared status styling

Create `src/lib/policy-status.ts` exporting `POLICY_STATUSES` array with `{ value, label, tone }` and a `statusBadgeClass(status)` helper using semantic tokens. Reuse in summary cards, table badges, and detail sheet so colors stay consistent.

### 5. Notes

- Policy `status` enum in DB currently: `in_review`, `active`, plus others; verify full enum and extend migration if any of the 10 spec values are missing.
- `policies.carrier_integration` is `text` in current schema, not boolean — treat as truthy if not null/empty.
- RLS already restricts policies by agent/downline, so RPC `SECURITY DEFINER` keeps results safe by filtering through downline CTE rooted at `auth.uid()`.
- No new dependencies needed (`papaparse` already added during Pipeline build).
