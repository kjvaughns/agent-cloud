
## 1. Discord webhook on "Post a Deal"

- Add secret `DISCORD_SALES_WEBHOOK` via secrets tool.
- In `postDeal` server fn (`src/lib/post-deal.functions.ts`), after the policy insert succeeds, fire-and-forget a POST to the webhook. Look up carrier name + agent display name from the DB so the message reads like the example.
- Message format (matches your example):
  `On The Books: {Agent First L.} — {Carrier} — {Product} — ${face} for ${annual} — Effective {Month D, YYYY} — Deal #{N} today`
  where `{N}` = count of policies this agent has created today (cheap `count` query with `created_at >= today`).
- Failure to post to Discord must NOT fail the deal — wrap in try/catch and log.
- Also fire the same message when an existing pipeline client is moved to "Sold" via the "Mark Sold" button (see §2) — same helper.

## 2. Pipeline "Post a Deal" + "Mark Sold" wiring

- Each pipeline card / client drawer already has actions. Wire:
  - **"Post a Deal"** → `nav({ to: "/post-deal", search: { client_id } })` (route already supports prefill).
  - **"Mark Sold"** → opens the same `/post-deal` screen prefilled with that client, with stage forced to Sold on submit. (Reuses the post-deal form; no separate modal.)
- Confirm both buttons appear consistently on: kanban card menu, client detail drawer header, and Sold tab "needs review" rows.

## 3. Editable, category-tagged notes

Current behavior: clicking "Medical Note" / Height / Weight / Physician / Tobacco buttons immediately commits a note. New behavior:

- Single composer textarea + a row of toggle chips: **Medical**, **Height**, **Weight**, **Physician**, **Tobacco**.
- Toggling a chip:
  - Adds a category tag to the in-progress draft.
  - If "Medical" is on, the textarea border + saved note card render red.
  - For Height / Weight / Physician / Tobacco, on save the parsed value is also written to the structured profile field (`clients.height`, `weight`, `physician_*`, `tobacco_status`).
- Only the **Add Note** button persists. Saved notes remain **editable** (pencil icon already present) and editing updates the row in place.
- DB: add `category text[]` and `is_medical boolean` columns to the notes table (whichever currently stores client notes — confirm during impl) via migration.

## 4. Pipeline + Sold redesign to match AgentLink

Rebuild both tabs to mirror the screenshots.

**Pipeline tab (kanban)**
- 3 columns: **New / Cold**, **Callback**, **Almost There** with count subheaders.
- Card shows: name, phone (icon prefix), last opened date, temperature pill (Warm/Cold + %) top-right.
- Light card surface, subtle shadow, generous padding; column header is bold w/ count.
- Top bar: Pipeline / Sold pill tabs, search by name/phone, **Import Clients**, **Add Client** buttons.

**Sold tab**
- KPI strip: Clients, Policies, Total Face, Annual Premium, Avg Policy, This Month (6 tiles, colored numbers per screenshot).
- Search row + Carrier filter + sort dropdown.
- Filter chips: All Clients, Needs Review, Needs Contact (count), Upcoming Birthdays (count), Anniversaries.
- Client Alerts banner (amber) summarizing counts.
- Sold client card: green check + name + policy count badge; Call/Text/Email action chips; **POLICIES (n)** list with carrier, product (sub-line), $X/mo, #policy#, face, start date; per-policy status pill (Not Taken / In Review); footer Total Coverage + Monthly, and a green Last Contact strip.

All colors via semantic tokens in `src/styles.css` (add tokens for `--temp-warm`, `--temp-cold`, `--status-not-taken`, `--status-in-review`, `--sold-strip-bg`).

## 5. AgentLink import field mapping

- The current importer dumps imported context into a separate "Additional Notes" section. Change parser/mapper (`src/lib/agentlink-xls-parser.ts` + `src/lib/agentlink.functions.ts`) so each field lands in its proper structured column:
  - Contact: first/last, phone, phone type, email, DOB
  - Address: street, city, state, ZIP, born country/state
  - Health: height, weight, smoker, SSN last 4, physician name/address/phone, medical notes
  - Banking: bank, account type, routing, account
  - Policies: carrier, product, policy#, effective date, face, monthly premium, status
  - Beneficiaries: each into beneficiaries table
- Anything that doesn't map to a structured field becomes a single saved note on the client profile (not a separate UI section).
- Re-running an import for an existing client updates fields in place; do not create duplicate "Additional Notes" sections.

## 6. Commission grids — AI parse + extrapolate

- Use `document--parse_document` on `commission_grids.pdf` to extract carrier/product/level/percent rows.
- Use Lovable AI Gateway (script via skill/ai-gateway) to:
  1. Normalize into `{carrier, product, level, percentage}` JSON.
  2. For each (carrier, product), detect the step delta between adjacent levels and **project** the missing higher and lower levels using the same step (or geometric ratio when steps are non-linear). Cap at sensible bounds (e.g., 0%–140%).
- Generate a SQL seed and apply via migration / insert tool into `commission_grids` (and `commission_schedule` if it stores per-level rows — verify schema during impl).
- Mark projected rows with `is_estimated boolean default false → true` so the UI can show a small "est." badge. Migration adds that column if absent.

## Technical notes

- New secret: `DISCORD_SALES_WEBHOOK`.
- New server fn: `notifyDiscordSale(policyId)` in `src/lib/post-deal.functions.ts`.
- Migrations:
  - `client_notes` (or current notes table): add `category text[]`, `is_medical boolean default false`.
  - `commission_grids` / level rows: add `is_estimated boolean default false`.
- New components:
  - `src/components/pipeline/pipeline-card.tsx`, `pipeline-column.tsx` (redesigned).
  - `src/components/book-of-business/sold-client-card.tsx`, `sold-kpi-strip.tsx`, `sold-filter-chips.tsx`.
  - `src/components/pipeline/notes-composer.tsx` (chip toggles + draft + save).
- Files edited:
  - `src/lib/post-deal.functions.ts` (Discord + sold-stage trigger).
  - `src/lib/agentlink-xls-parser.ts`, `src/lib/agentlink.functions.ts` (structured mapping).
  - `src/routes/_authenticated/pipeline.tsx` (both tabs).
  - `src/components/pipeline/client-detail-drawer.tsx`, `src/components/pipeline/notes-tab.tsx`.
  - `src/styles.css` (new tokens).
- Tokens only — no raw hex in components.

## Order of work

1. Secret + Discord helper + wire into postDeal.
2. Mark Sold / Post a Deal nav wiring.
3. Notes composer + migration.
4. Pipeline tab redesign.
5. Sold tab redesign.
6. AgentLink import field remap.
7. Commission grid parse + extrapolation + seed.
