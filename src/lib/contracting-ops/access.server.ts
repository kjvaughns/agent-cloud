/**
 * What the caller may do inside contracting operations.
 *
 * Lifted out of `contracting-ops.functions.ts` so the agent-grouped workspace,
 * the Google Sheets sync and the notification builders resolve the same
 * capabilities from the same place instead of each growing their own copy.
 *
 * The database enforces these rules; this exists so the UI can hide what it
 * must not offer, and so every mutation can re-check before writing. It is
 * never the only gate.
 *
 * ── Granular contracting flags ──
 *
 * A contracting specialist is not an admin. They need to move a status, put a
 * writing number on a request, write a note the agent reads and a note only
 * staff read — and nothing else. Those are now their own permissions rather
 * than riding on `contracting_submit`, so granting somebody the ability to
 * update a status does not also hand them approvals or carrier setup.
 *
 * Anybody who already held submit or approve keeps the finer-grained
 * equivalents: the migration backfilled them, and the `or(...)` chains below
 * fall back to the coarse flag so nobody loses an ability they were using.
 */

import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;

export type ContractingAccess = {
  orgId: string | null;
  isOwner: boolean;
  canView: boolean;
  canManageCarriers: boolean;
  canManageCompLevels: boolean;
  canManageHierarchy: boolean;
  canManageLicenses: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canAssign: boolean;
  canViewAgencyComp: boolean;
  canViewSensitiveDocs: boolean;
  canExport: boolean;
  canViewAudit: boolean;
  /** Move a request between statuses. */
  canUpdateStatus: boolean;
  /** Record or correct a writing number. */
  canSetWritingNumber: boolean;
  /** Write a note the agent reads. */
  canNoteAgent: boolean;
  /** Write a note only contracting staff read. */
  canNoteInternal: boolean;
  /** Push a request back to the agent asking for something. */
  canRequestInfo: boolean;
  /** Connect and run the Google Sheets contracting sync. */
  canManageSheets: boolean;
};

export const NO_CONTRACTING_ACCESS: ContractingAccess = {
  orgId: null, isOwner: false, canView: false, canManageCarriers: false,
  canManageCompLevels: false, canManageHierarchy: false, canManageLicenses: false,
  canSubmit: false, canApprove: false, canAssign: false, canViewAgencyComp: false,
  canViewSensitiveDocs: false, canExport: false, canViewAudit: false,
  canUpdateStatus: false, canSetWritingNumber: false, canNoteAgent: false,
  canNoteInternal: false, canRequestInfo: false, canManageSheets: false,
};

export async function resolveContractingAccess(userId: string): Promise<ContractingAccess> {
  const orgId = await getMyPrimaryOrgId(userId);
  if (!orgId) return NO_CONTRACTING_ACCESS;

  const [{ data: org }, { data: roleRows }, { data: perms }] = await Promise.all([
    supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("role_permissions").select("*")
      .eq("profile_id", userId).eq("organization_id", orgId).maybeSingle(),
  ]);

  const roles: string[] = (roleRows ?? []).map((r: any) => String(r.role));
  const isOwner = org?.owner_id === userId;
  const isOrgAdmin =
    isOwner ||
    roles.some((r) => ["agency_owner", "admin", "super_admin"].includes(r)) ||
    Boolean(perms?.staff_is_admin && perms?.admin_manage_staff_configs);

  const flag = (k: string) => Boolean(perms?.[k]);
  const or = (...vals: boolean[]) => isOrgAdmin || vals.some(Boolean);

  const canSubmit = or(
    flag("contracting_submit"), flag("staff_submit_carrier_requests"), flag("mgr_submit_carrier_requests"),
  );
  const canApprove = or(flag("contracting_approve"));

  return {
    orgId,
    isOwner,
    canManageCarriers: or(flag("contracting_manage_carriers")),
    canManageCompLevels: or(flag("contracting_manage_comp_levels")),
    canManageHierarchy: or(flag("contracting_manage_hierarchy")),
    canManageLicenses: or(flag("contracting_manage_licenses")),
    canSubmit,
    canApprove,
    canAssign: or(flag("contracting_assign_staff")),
    canViewAgencyComp: or(flag("contracting_view_agency_comp"), flag("contracting_manage_comp_levels")),
    canViewSensitiveDocs: or(flag("contracting_view_sensitive_docs")),
    canExport: or(flag("contracting_export")),
    canViewAudit: or(flag("contracting_view_audit")),
    canUpdateStatus: or(flag("contracting_update_status")) || canSubmit || canApprove,
    canSetWritingNumber: or(flag("contracting_set_writing_number")) || canSubmit || canApprove,
    canNoteAgent: or(flag("contracting_note_agent")) || canSubmit || canApprove,
    canNoteInternal: or(flag("contracting_note_internal")) || canSubmit || canApprove,
    canRequestInfo: or(flag("contracting_request_info")) || canSubmit || canApprove,
    canManageSheets: or(flag("contracting_manage_sheets")),
    canView: or(
      flag("staff_view_contracts"), flag("contracting_manage_carriers"),
      flag("contracting_submit"), flag("contracting_approve"),
      flag("contracting_assign_staff"), flag("contracting_manage_licenses"),
      flag("contracting_update_status"), flag("contracting_set_writing_number"),
      flag("contracting_note_agent"), flag("contracting_note_internal"),
      flag("contracting_request_info"), flag("contracting_manage_sheets"),
      flag("contracting_view_audit"),
    ),
  };
}
