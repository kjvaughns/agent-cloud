/**
 * Undoing an import.
 *
 * Moving fifteen years of business into a new system is the single most
 * anxious thing an agency does, and the fear is specific: *what if it goes in
 * wrong and I cannot get it out again*. Almost nobody offers an undo, which is
 * why offering one is worth more than another percent of extraction accuracy.
 *
 * ── The rule that makes it safe ─────────────────────────────────────────────
 *
 * **A row edited since the import is never deleted.**
 *
 * That is the whole design. An import runs on Monday; by Thursday somebody has
 * added a policy to one of those clients, corrected a phone number on another,
 * logged three calls against a third. An undo that removes them anyway is not
 * an undo — it is a second data loss, arriving at the exact moment the person
 * was trying to recover from the first.
 *
 * So the rollback compares `updated_at` (falling back to `created_at`) against
 * when the proposal was applied. Untouched rows are removed; touched rows are
 * kept and *reported*, so the person knows precisely what survived and why
 * rather than discovering it later.
 *
 * ── Why it does not use a snapshot table ────────────────────────────────────
 *
 * The obvious design is to copy every written row into a shadow table before
 * writing it. That doubles the write cost of an import — the slowest thing in
 * the product — to serve an action most agencies take once or never. It also
 * has to be kept in step with every schema change, forever.
 *
 * `import_proposals` already records `target_table` and `applied_record_id`
 * for each row it wrote. Deleting exactly what was created needs nothing more
 * than that. What it cannot do is restore a row an import *overwrote* — so
 * updates are excluded from rollback and said so out loud, instead of being
 * quietly attempted and half-working.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Delete order matters: children before parents.
 *
 * A client with policies cannot be deleted while they reference it, and the
 * failure arrives as a foreign-key error halfway through — leaving the batch
 * partly removed, which is worse than either outcome on its own.
 */
const DELETE_ORDER = [
  "commission_schedule",
  "policies",
  "contact_history",
  "clients",
  "pending_agents",
  "writing_numbers",
  "state_licenses",
  "org_carriers",
] as const;

function orderOf(table: string): number {
  const i = (DELETE_ORDER as readonly string[]).indexOf(table);
  // Anything unlisted goes last. Being conservative about order costs nothing;
  // guessing it is a child and deleting early costs a foreign-key error.
  return i === -1 ? DELETE_ORDER.length : i;
}

export type RollbackPreview = {
  batchId: string;
  /** Rows that would be removed, by table. */
  removable: { table: string; count: number }[];
  /** Rows kept because somebody has touched them since. */
  keptEdited: { table: string; count: number }[];
  /** Rows the import updated rather than created — never reversible. */
  keptUpdated: number;
  total: number;
};

/**
 * What an undo would do, without doing it.
 *
 * Shown before the confirmation, because "this will remove 4,182 records and
 * keep 11 you have edited since" is a decision somebody can actually make.
 * "Are you sure?" is not.
 */
export const previewImportRollback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RollbackPreview> => {
    const { supabase } = context as Ctx;
    const plan = await buildPlan(supabase, data.batchId);
    return plan.preview;
  });

export const rollbackImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const plan = await buildPlan(supabase, data.batchId);

    let removed = 0;
    const failures: string[] = [];

    // Grouped by table and ordered children-first. One delete per table rather
    // than per row: a four-thousand-row import should not be four thousand
    // round trips.
    for (const table of Object.keys(plan.byTable).sort((a, b) => orderOf(a) - orderOf(b))) {
      const ids = plan.byTable[table];
      if (ids.length === 0) continue;
      const { error, count } = await supabase
        .from(table)
        .delete({ count: "exact" })
        .in("id", ids);
      if (error) {
        failures.push(`${table}: ${error.message}`);
        continue;
      }
      removed += count ?? 0;
    }

    // Only the proposals whose rows actually went are marked reverted, so a
    // partial failure leaves an accurate record rather than claiming the whole
    // batch is undone.
    if (failures.length === 0 && plan.proposalIds.length > 0) {
      await supabase
        .from("import_proposals")
        .update({
          applied_record_id: null,
          apply_error: "Rolled back",
          updated_at: new Date().toISOString(),
        })
        .in("id", plan.proposalIds);
    }

    return {
      removed,
      kept_edited: plan.preview.keptEdited.reduce((a, r) => a + r.count, 0),
      kept_updated: plan.preview.keptUpdated,
      failures,
    };
  });

/**
 * Work out what can go, reading the batch's applied proposals.
 *
 * RLS does the authorisation: the caller's client is used throughout, so a
 * batch belonging to another organization returns no proposals and the plan is
 * empty. There is deliberately no ownership check written here — one more
 * place to get it subtly different from the policy.
 */
async function buildPlan(supabase: any, batchId: string) {
  const { data: proposals, error } = await supabase
    .from("import_proposals")
    .select("id, target_table, operation, applied_record_id, applied_at")
    .eq("batch_id", batchId)
    .not("applied_record_id", "is", null);

  if (error) throw new Error(error.message);

  const byTable: Record<string, string[]> = {};
  const keptEditedCount: Record<string, number> = {};
  const proposalIds: string[] = [];
  let keptUpdated = 0;

  // An import that updated an existing record cannot be reversed by deleting
  // it — the row predates the import and belongs to the agency. Counted and
  // reported rather than attempted.
  const created = (proposals ?? []).filter((p: any) => {
    if (p.operation && p.operation !== "create" && p.operation !== "insert") {
      keptUpdated++;
      return false;
    }
    return true;
  });

  // Group by table so "has this been touched since" is one query per table
  // rather than one per row.
  const idsByTable: Record<string, { id: string; appliedAt: string | null; proposalId: string }[]> = {};
  for (const p of created) {
    const t = p.target_table as string;
    (idsByTable[t] ??= []).push({
      id: p.applied_record_id,
      appliedAt: p.applied_at ?? null,
      proposalId: p.id,
    });
  }

  for (const [table, entries] of Object.entries(idsByTable)) {
    const ids = entries.map((e) => e.id);
    // `select("*")` rather than naming updated_at: not every one of these
    // tables has that column, and naming a missing one fails the whole query.
    const { data: rows, error: rowsErr } = await supabase.from(table).select("*").in("id", ids);
    if (rowsErr) {
      // A table we cannot read is a table we must not delete from.
      continue;
    }

    const rowById = new Map((rows ?? []).map((r: any) => [r.id, r]));
    for (const e of entries) {
      const row: any = rowById.get(e.id);
      // Already gone — somebody deleted it by hand. Nothing to do, and not
      // worth reporting as "kept".
      if (!row) continue;

      const touchedAt = row.updated_at ?? row.created_at ?? null;
      const edited =
        e.appliedAt && touchedAt
          // A second of slack: the write itself sets updated_at a beat after
          // applied_at is recorded, and without this every row would look
          // edited and nothing would ever be removable.
          ? new Date(touchedAt).getTime() > new Date(e.appliedAt).getTime() + 1000
          : false;

      if (edited) {
        keptEditedCount[table] = (keptEditedCount[table] ?? 0) + 1;
      } else {
        (byTable[table] ??= []).push(e.id);
        proposalIds.push(e.proposalId);
      }
    }
  }

  const removable = Object.entries(byTable).map(([table, ids]) => ({ table, count: ids.length }));

  return {
    byTable,
    proposalIds,
    preview: {
      batchId,
      removable,
      keptEdited: Object.entries(keptEditedCount).map(([table, count]) => ({ table, count })),
      keptUpdated,
      total: removable.reduce((a, r) => a + r.count, 0),
    } satisfies RollbackPreview,
  };
}
