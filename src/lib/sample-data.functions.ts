/**
 * Sample data an agency can look around in, and get rid of.
 *
 * A new agency signing in to an empty product cannot tell whether it works.
 * Seeding a book of business solves that and creates a worse problem: rows
 * that look exactly like client records but are invented. In insurance that
 * confusion is a compliance question rather than a tidy-up — which is why
 * every seeded row carries `is_sample`, every one of them is visibly chipped
 * in the UI, and clearing them is one button rather than an afternoon.
 *
 * The rows themselves come from `demo-seed.server.ts`, the same seed the
 * public demo runs. One fixture, three callers: three copies would drift, and
 * the copy that drifts is always the one nothing tests.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { assertOrgOwner, getMyPrimaryOrgId } from "@/lib/org-guard";

// Imported inside the handlers, not at the top. This module is reached from a
// client component, and the seed carries five hundred lines of fixture data
// that has no business in the browser bundle.

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

export type SampleDataSummary = {
  /** Null when the migration has not landed — meaningfully different from 0. */
  total: number | null;
  byTable: { table: string; count: number }[];
  available: boolean;
};

export const getSampleDataSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SampleDataSummary> => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { total: 0, byTable: [], available: true };

    const { SEEDED_TABLES } = await import("@/lib/demo-seed.server");
    const results = await Promise.all(
      SEEDED_TABLES.map(async (table) => {
        const { count, error } = await supabaseAdmin
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("is_sample", true);
        return { table, count: count ?? 0, error };
      }),
    );

    // If every table refused, the column does not exist yet and the honest
    // answer is "cannot tell" rather than "none" — the card says so instead of
    // offering a button that would do nothing.
    if (results.every((r) => r.error)) {
      return { total: null, byTable: [], available: false };
    }

    const byTable = results
      .filter((r) => !r.error && r.count > 0)
      .map(({ table, count }) => ({ table, count }));

    return {
      total: byTable.reduce((a, r) => a + r.count, 0),
      byTable,
      available: true,
    };
  });

/**
 * Delete every sample row in the caller's agency.
 *
 * Owner only, and deliberately not undoable — an owner who wants it back can
 * seed again. The confirmation lives in the UI; this is the boundary, and it
 * checks ownership rather than trusting that the button was hidden.
 */
export const clearMySampleData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { clearSampleData } = await import("@/lib/demo-seed.server");
    const result = await clearSampleData(supabaseAdmin, orgId);
    if (result.failures.length) {
      throw new Error(
        `Cleared ${result.cleared} rows, but ${result.failures.length} table(s) refused: ` +
          result.failures.join("; "),
      );
    }
    return { cleared: result.cleared };
  });

/**
 * Add sample data to an agency that skipped it at signup, or wants it back.
 *
 * Clears first. Seeding on top of an existing sample set is how an agency ends
 * up with a hundred and ten clients and two of every policy.
 */
export const addSampleData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { clearSampleData, seedSampleData } = await import("@/lib/demo-seed.server");
    const cleared = await clearSampleData(supabaseAdmin, orgId);
    if (cleared.failures.length) {
      throw new Error(`Could not clear the existing sample data: ${cleared.failures.join("; ")}`);
    }

    const seeded = await seedSampleData(supabaseAdmin, orgId);
    if (!seeded.seeded) throw new Error(seeded.detail);
    return { detail: seeded.detail };
  });
