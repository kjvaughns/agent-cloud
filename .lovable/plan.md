## What I verified against the live database

Everything through `20260730145549_*` is live. The **five newest migration files are not applied** — none of their tables, columns, or functions exist:

| File | Not in DB |
|---|---|
| `20260730155000_contracting-ops-permissions.sql` | `role_permissions` has no contracting flag columns; `is_org_admin`, `has_contracting_flag`, `can_manage_contracting`, `can_approve_contracts`, etc. all missing |
| `20260730160000_contracting-ops-carriers.sql` | `org_carriers`, `org_carrier_methods`, `carrier_requirements`, `carrier_comp_levels`, `org_role_comp_mappings`; `carriers.is_private`/owner columns |
| `20260730161000_contracting-ops-producers.sql` | `producer_profiles`, `producer_appointments`, `producer_regulatory_actions`, `pdb_reviews`, `org_contracting_settings`; new review/verification columns on `state_licenses`, `pdb_uploads`, `producer_documents` (checked `state_licenses` — columns absent) |
| `20260730162000_contracting-ops-requests.sql` | `contracting_requests`, `contracting_request_states`, `contracting_request_documents`, `contracting_status_history`, `writing_numbers`, `carrier_hierarchy_records`, `hierarchy_change_requests`, `hierarchy_change_approvals`, plus the reference-number trigger |
| `20260730163000_contracting-ops-templates-audit.sql` | `contracting_spreadsheet_templates`, `contracting_field_mappings`, `contracting_email_templates`, `contracting_submissions`, `ready_to_sell_records`, `contracting_audit_log`, `document_access_log` |

These back the `/contracting-ops` routes and `src/lib/contracting-ops*.ts` / `contracting-records`, `contracting-templates`, `contracting-workflow`, `contracting-import` server functions — so that whole section currently fails at runtime against missing tables. All five files already include `GRANT` statements and RLS policies (spot-checked each), so no grant patching is needed.

## Plan

1. Run one migration containing the five files' SQL concatenated in filename order (permissions → carriers → producers → requests → templates/audit). Order matters: the permission helper functions are referenced by the RLS policies in every later file, and `org_carriers` is the FK parent for requirements/comp-levels/requests.
2. Verify after it applies: all new tables present, RLS enabled with policies on each, helper functions created, and the new columns on `carriers` / `state_licenses` / `pdb_uploads` / `producer_documents` exist.
3. Regenerate `src/integrations/supabase/types.ts` and run the typecheck — several contracting-ops modules likely cast to `any` today; report any that can drop the cast (no code changes unless the typecheck breaks).
4. Load `/contracting-ops` and its sub-tabs to confirm reads/writes hit real tables instead of erroring.

## Deliberately not included

`20260728100000_owner-consolidation.sql` stays unapplied — its section 4 deletes `info@kingofsales.net` and reassigns that account's clients, policies and commissions. Say the word if you want sections 1–3 (data moves) run without the deletion.
