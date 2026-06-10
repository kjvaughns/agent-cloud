# Gold-Forward Sweep

The theme tokens (`--primary` = gold `#C9A227`) and the brand mark are intact — the login page renders gold. What's actually missing is **decorative blue/sky/indigo accents** that should have been swept to gold during the original Gold Reskin pass. This plan finishes that sweep without breaking semantic meaning.

## Rules

**Keep unchanged (semantic):**
- Red — destructive / errors / hot lead temperature
- Green / Emerald — success, completed, active, "good delta"
- Amber / Yellow — warnings, pending review
- Sky / Blue — **cold lead temperature only** (`temperature-badge`, pipeline cold buckets)
- Purple — trail commission type (finances chart + badges)
- Finances charts — left alone per your answer

**Convert to gold (`#C9A227` / `bg-primary` / `text-primary`):**
- Any decorative blue/sky/indigo used as a brand accent (not as cold-temp semantic)
- "In progress" / "processing" badges currently blue → gold
- Generic info/highlight blue chips → gold
- KPI tiles tagged as "lead/primary" that are currently blue
- Chart legend dots and gradient stops that represent the primary brand metric

## Files I'll edit

| File | Change |
|---|---|
| `src/routes/_authenticated/contracting/invite.tsx` | `in_progress` badge: `bg-blue-500/15 text-blue-700` → gold |
| `src/routes/_authenticated/contracting/index.tsx` | Status pill blue → gold (in-progress) |
| `src/routes/_authenticated/contracting/annuity-training.tsx` (if blue) | Same pattern |
| `src/routes/_authenticated/analytics.tsx` | 4 hardcoded blues → gold for primary metric, neutral for secondary |
| `src/routes/_authenticated/team.tsx` | Blue accent tiles → gold |
| `src/routes/_authenticated/pipeline.tsx` | Decorative blues (not cold-temp) → gold |
| `src/routes/_authenticated/account/help.tsx` | Info blue chips → gold |
| `src/routes/_authenticated/account/producer-profile.tsx` | Blue accent → gold |
| `src/routes/admin.agents.tsx` | 6 blues → gold/neutral |
| `src/routes/admin.index.tsx`, `admin.contracts.tsx`, `admin.roles.tsx`, `admin.import-requests.tsx` | Lone blue → gold |
| `src/components/admin/ai-import-dialog.tsx` | Blue → gold |
| `src/components/pipeline/sold-tab.tsx` | Decorative blue → gold (keep amber warnings, emerald success) |
| `src/components/pipeline/notes-tab.tsx` | Blue chip → gold (keep amber for height/weight tags) |
| `src/components/pipeline/client-detail-drawer.tsx` | Blue chip → gold (preserve `temperature-badge` cold) |
| `src/components/contracting/contract-status-badge.tsx` | `processing` blue → gold; keep `approved` emerald, `pending` amber |
| `src/components/ai/*.tsx` (insights panels) | "Lead insight" amber that's meant as brand accent → gold; keep amber for actual warnings |

## What I will NOT touch

- `src/styles.css` — tokens are correct
- `src/components/temperature-badge.tsx` — cold = blue is semantic
- `src/components/pipeline/client-detail-drawer.tsx` "callback = amber" — semantic warm state
- Finances charts (`finances.tsx` lines 302–305, 518–521) — keep emerald/purple/sky per your answer
- Dashboard team chart (emerald line for "Team" vs gold "Individual") — semantic comparison
- Any green checkmarks, red errors, amber warnings

## Verification

After the sweep I'll:
1. `rg "text-blue-|bg-blue-|border-blue-"` and confirm only `temperature-badge` + intentional cold-lead spots remain
2. Open `/login`, `/dashboard`, `/contracting`, `/contracting/invite`, `/finances`, `/admin/agents` in the preview at 1280px and screenshot each
3. Spot-check dark mode on dashboard + finances

## Out of scope (call out for next prompt)

- Logo asset upload — your apex org has `logo_url = null`, so the sidebar shows the default Cloud-icon brand mark. If you want a custom uploaded gold logo there, upload it in **Admin → Settings** (or tell me to add a default gold SVG asset).
- Chart recolor to mono-gold — you said keep current scheme.
