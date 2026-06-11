## Goal
Load the 2026 Compensation Grid PDF into the database so the Commission Grids page reflects the new official data, and attach Kaeden's and Samuel's actual level assignments.

## Scope decisions (confirmed)
- **Carriers**: Replace ALL `commission_grids` rows. Only the 10 carriers in the PDF will have grid data afterward (GTL, Transamerica, American Home Life, Mutual of Omaha, Foresters Financial, American Amicable, Newbridge, Royal Neighbors, Baltimore Life, Prudential). Other carriers (AIG, Aflac, Americo, AHL non-FE, etc.) will have no grid rows.
- **Renewals**: All Yr 2-5 and Yr 6+ rates set to `0` (PDF only shows Yr 1).
- **Agent assignments**: Attach Kaeden (`kjvaughns13@gmail.com`) and Samuel (`info@kingofsales.net`) to their carrier levels per the ★YOU / FMO markers.

## Changes

### 1. Migration: replace `commission_grids`
Single migration that:
- `DELETE FROM commission_grids` (full wipe)
- Insert all rows from the PDF, one row per (carrier, product, level). `level_name` stores the printed level label (e.g. `"22 (60%) ★YOU"` becomes `"22"`, `"RK12"`, `"GA(10)"`, `"L15"`, `"PKRAGENT10"`, `"8"`, `"60-SA2"`, etc.), `year_1_pct` stores the Yr1 commission, `years_2_5_pct`/`years_6_plus_pct` = `0`.
- Special case: **Newbridge** uses `age_group_min`/`age_group_max` for Level DB (0–79 vs 80–85) and Modified DB (0–79 vs 80–85).
- Special case: **Royal Neighbors** uses age bands for SI WL (50–75, 76–80, 81–85) and Graded DB (50–75, 76–80, 81–85). GI WL Band 1/2, Single Premium WL, Jet WL Band 1/2, Jet Youth WL stay age-less.
- **GTL** keeps `is_gtl` semantics (Heritage + Life Select). The 2026 grid uses levels `6` through `30` in steps of 2.

### 2. Migration: replace `agent_commission_levels` for Kaeden & Samuel
- Delete existing rows for both users (clean slate).
- Insert Kaeden's ★YOU level per carrier:
  - GTL: `22 (60%)` → 60%
  - Transamerica: `RK12` → 80%
  - American Home Life: `GA(10)` → 80%
  - Mutual of Omaha: `L15` → 74%
  - Foresters Financial: `PKRAGENT10` → 80%
  - American Amicable: `75` → 75%
  - Newbridge: `8` → 75%
  - Royal Neighbors: `60-SA2` → 75%
  - Baltimore Life: `80` → 80%
  - Prudential: `80` → 80%
- Insert Samuel's top FMO level per carrier:
  - GTL: `30 (80%)` → 80%
  - Transamerica: `RK20` → 150%
  - American Home Life: `GA(24)` → 150%
  - Mutual of Omaha: `L1` → 140%
  - Foresters Financial: `PKRAGENT24` → 150%
  - American Amicable: `150` → 150%
  - Newbridge: `23` → 150%
  - Royal Neighbors: `150-FMO1` → 150%
  - Baltimore Life: `150` → 150%
  - Prudential: `150` → 150%

### 3. No frontend changes required
- The existing `src/routes/_authenticated/contracting/commission-grids.tsx` already groups by carrier, renders age-band tables, sorts levels descending, and highlights the agent's assigned level. It will display the new data automatically.
- GTL advance cap row in `carriers` is already correct (`fixed`, `$600`, `6 months`).

## Out of scope
- No changes to `commission-calculator.ts` (the calculation rules from the PDF — 75% advance / 25% trail months 10-12 for standard, GTL 50%/$600 cap with 6-month trail months 7-12, override = spread × annual — already match `calculateAndInsertAllCommissions`).
- Renewal rates left at 0; can be filled in later when a separate renewal schedule is provided.
- Non-PDF carriers' grids are wiped; if you want them preserved instead, say so and I'll switch to scoped deletes.
