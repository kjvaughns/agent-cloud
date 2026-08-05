/**
 * Putting the demo back the way it was.
 *
 * Clears every sample row in the demo org and re-seeds it. Called nightly by
 * `/api/public/hooks/demo-reset`, and by hand from the same endpoint when
 * somebody has left the demo in a state worth undoing sooner.
 *
 * What it does not touch: the organization row, its memberships, the three
 * demo accounts, and any carrier configuration that is not flagged sample.
 * Those are the demo rather than data inside it, and rebuilding them on a
 * timer would mean minting auth users nightly — a much larger blast radius
 * than this job needs, for no gain.
 *
 * This is a separate module from the endpoint so the endpoint stays about
 * authentication and logging, and separate from `demo-seed.server.ts` so that
 * file stays callable from a bundled script with no server imports.
 */

import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { clearSampleData, seedSampleData } from "@/lib/demo-seed.server";

const supabaseAdmin = _admin as any;

export type ResetResult = { cleared: number; detail: string };

export async function resetDemoOrg(orgId: string): Promise<ResetResult> {
  const cleared = await clearSampleData(supabaseAdmin, orgId);

  // A partial clear is a failure, not a warning. Re-seeding on top of rows
  // that would not delete is how a demo ends up with two hundred clients and
  // eleven copies of the same policy by the end of the month.
  if (cleared.failures.length) {
    throw new Error(`could not clear ${cleared.failures.length} table(s): ${cleared.failures.join("; ")}`);
  }

  const seeded = await seedSampleData(supabaseAdmin, orgId);
  if (!seeded.seeded) throw new Error(`seed did not run: ${seeded.detail}`);

  return { cleared: cleared.cleared, detail: seeded.detail };
}
