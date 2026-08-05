/**
 * Seed an organization with the sample agency, from the command line.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run seed:demo -- --org <uuid> [--clear] [--dry-run]
 *
 * The seed itself lives in `src/lib/demo-seed.server.ts`, because the same
 * rows are written from three places — this script, the nightly demo reset,
 * and (from Prompt 8) the "start with sample data" option on a new agency.
 * Three copies of a fixture drift, and the one that drifts is always the one
 * the tests do not run against.
 *
 * This file is the command line and nothing else: arguments, credentials, exit
 * codes.
 */

import { createClient } from "@supabase/supabase-js";
import { clearSampleData, seedSampleData } from "../src/lib/demo-seed.server";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const ORG_ID = value("org");
const CLEAR_ONLY = flag("clear");
const DRY_RUN = flag("dry-run");

if (!ORG_ID) {
  console.error("Usage: npm run seed:demo -- --org <organization uuid> [--clear] [--dry-run]");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("Dry run — nothing written.");
  console.log(`Would clear every is_sample row in org ${ORG_ID}` + (CLEAR_ONLY ? "." : ", then re-seed it."));
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const cleared = await clearSampleData(db, ORG_ID);
if (cleared.failures.length) {
  console.error(`\n${cleared.failures.length} table(s) could not be cleared:`);
  for (const f of cleared.failures) console.error(`  ${f}`);
}

if (!CLEAR_ONLY) {
  const result = await seedSampleData(db, ORG_ID);
  if (!result.seeded) {
    console.error(`\nNothing was seeded: ${result.detail}`);
    process.exit(1);
  }
}
