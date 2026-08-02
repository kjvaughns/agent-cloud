import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";

// Generated DB types predate these tables; cast until regenerated.
const supabaseAdmin = _admin as any;

/**
 * Contracting audit trail.
 *
 * Writes go through the service role and only the service role: the table
 * grants no insert to `authenticated`, because an audit log a client can write
 * is not an audit log. Every mutating server function in this module calls
 * `recordAudit` after the write succeeds.
 *
 * Failures here are swallowed. An audit write that throws would roll back a
 * legitimate action the user already completed, which trades a missing log
 * line for a broken workflow. Losses are surfaced in the server console
 * instead.
 */

export type AuditAction =
  | "carrier.created" | "carrier.updated" | "carrier.archived"
  | "carrier_requirement.changed"
  | "comp_level.created" | "comp_level.updated" | "comp_level.deleted"
  | "writing_number.created" | "writing_number.updated" | "writing_number.deleted"
  | "request.created" | "request.status_changed" | "request.assigned"
  | "request.submitted" | "request.approved" | "request.declined"
  | "document.uploaded" | "document.reviewed" | "document.downloaded"
  // Distinct from `document.uploaded`: staff filing a document they hold on an
  // agent's behalf is a different act from the agent uploading their own, and
  // the trail should be able to tell them apart.
  | "document.uploaded_for_agent"
  | "pdb.reviewed" | "license.edited"
  | "hierarchy.changed" | "hierarchy_change.requested" | "hierarchy_change.decided"
  | "comp.changed"
  | "spreadsheet.exported" | "packet.downloaded" | "email.generated"
  | "sensitive.accessed";

export async function recordAudit(input: {
  organizationId: string | null;
  actorId: string | null;
  action: AuditAction;
  recordType: string;
  recordId?: string | null;
  subjectAgentId?: string | null;
  previous?: unknown;
  next?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("contracting_audit_log").insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      action: input.action,
      record_type: input.recordType,
      record_id: input.recordId ?? null,
      subject_agent_id: input.subjectAgentId ?? null,
      previous_value: input.previous ?? null,
      new_value: input.next ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.error("[contracting-audit] write failed", input.action, err);
  }
}

/**
 * Document access is logged separately: it is far higher volume than
 * configuration changes and answers a different question — who looked at a
 * producer's paperwork.
 */
export async function recordDocumentAccess(input: {
  organizationId: string | null;
  documentId?: string | null;
  pdbUploadId?: string | null;
  subjectAgentId: string | null;
  accessedBy: string | null;
  accessType: "view" | "download" | "signed_url" | "export" | "bundle_download";
  wasSensitive?: boolean;
}): Promise<void> {
  try {
    await supabaseAdmin.from("document_access_log").insert({
      organization_id: input.organizationId,
      document_id: input.documentId ?? null,
      pdb_upload_id: input.pdbUploadId ?? null,
      subject_agent_id: input.subjectAgentId,
      accessed_by: input.accessedBy,
      access_type: input.accessType,
      was_sensitive: input.wasSensitive ?? false,
    });
  } catch (err) {
    console.error("[contracting-audit] document access write failed", err);
  }
}

/**
 * Reduces an object to the fields that actually changed.
 *
 * Storing whole rows in previous_value/new_value makes a log nobody reads —
 * forty unchanged columns hide the one that moved.
 */
export function diff<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
): { previous: Partial<T>; next: Partial<T> } {
  const previous: Partial<T> = {};
  const next: Partial<T> = {};
  if (!before || !after) return { previous: before ?? {}, next: after ?? {} };

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = (before as any)[key];
    const b = (after as any)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      (previous as any)[key] = a;
      (next as any)[key] = b;
    }
  }
  return { previous, next };
}

/** Masks all but the last four characters. Used for anything account-shaped. */
export function maskTail(value: string | null | undefined, keep = 4): string | null {
  if (!value) return null;
  const s = String(value);
  if (s.length <= keep) return "•".repeat(s.length);
  return "•".repeat(Math.max(4, s.length - keep)) + s.slice(-keep);
}
