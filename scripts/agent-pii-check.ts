/**
 * The product stops asking agents for a Social Security number.
 *
 *   npx tsx scripts/agent-pii-check.ts
 *
 * Agent Cloud does not submit contracting paperwork to carriers — SureLC and
 * NIPR do — so it has no reason to hold an agent's SSN, date of birth,
 * driver's licence or bank account, and no business being the place those
 * accumulate. The fields are gone from the UI and from every write path.
 *
 * Nothing is deleted. Every column and table still exists and still holds
 * whatever it held; this is a change to what the product *asks for*, not a
 * purge. That distinction is what most of the assertions below are about.
 *
 * The subtle half is completeness. Three separate places required `ssn_last4`
 * for an agent to count as "identity done", and none of them consulted the
 * flag that was supposed to gate PII — so removing the field without touching
 * them would have pinned every agent below 100% forever, with no field left to
 * fill in. `agent_completion()` had the same problem with date of birth, which
 * it scored unconditionally. Punishing people for data you refuse to collect
 * is a worse outcome than collecting it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── Gone from the profile ───────────────────────────────────────────────────

const PROFILE = strip(read("src/routes/_authenticated/account/producer-profile.tsx"));

check("no Banking tab", /BankingTab|value="banking"/.test(PROFILE), false);
check("no driver's licence card", /DriversLicenseCard|drivers_license/.test(PROFILE), false);
check("no SSN field or dialog", /ssn_last4|Social Security Number|showSsnModal/.test(PROFILE), false);
check("no date of birth, gender or marital status",
  /date_of_birth|marital_status|"Gender"/.test(PROFILE), false);
check("no Government ID document", /government_id/.test(PROFILE), false);
check("no voided cheque document", /voided_check/.test(PROFILE), false);
// The flag is gone too — with the fields removed it had nothing left to gate.
check("no PII toggle left to consult", /collectPii|collect_contracting_pii/.test(PROFILE), false);
check("…and the tab list no longer names banking",
  /"documents", "background", "integrations"/.test(PROFILE), true);

// What stays. Removing too much would be its own bug.
for (const kept of ["npn_number", "street_address", "eo_certificate", "aml_certificate", "BackgroundTab"]) {
  check(`${kept} still on the profile`, PROFILE.includes(kept), true);
}

// ── Gone from the write paths ───────────────────────────────────────────────

console.log("");

const ACCOUNT = read("src/lib/account.functions.ts");
check("the SSN server functions are gone",
  /export const setSsn|export const revealSsn/.test(ACCOUNT), false);
check("the banking server functions are gone",
  /export const upsertProducerBanking|export const revealBankingAccount/.test(ACCOUNT), false);
check("the profile patch no longer accepts the retired fields",
  /date_of_birth:|gender:|marital_status:|drivers_license_/.test(strip(ACCOUNT)), false);
check("…and no longer reads them back to the browser",
  /ssn_last4|producer_banking/.test(strip(ACCOUNT)), false);
// Neighbours that share the file must survive the removal.
for (const kept of ["getProducerProfile", "updateProducerProfile", "upsertProducerDocument", "lookupNpnLicenses"]) {
  check(`${kept} survived`, ACCOUNT.includes(`export const ${kept}`), true);
}

const SETTINGS = read("src/routes/admin.settings.tsx");
check("the Collect SSN toggle is gone",
  /collect_contracting_pii|Contracting paperwork/.test(SETTINGS), false);
check("…and the neighbouring settings cards are not",
  /Onboarding Defaults/.test(SETTINGS) && /Automated Notifications/.test(SETTINGS), true);

const ORG = read("src/lib/org-settings.functions.ts");
check("org settings no longer carry the flag", /collect_contracting_pii/.test(ORG), false);

// ── Nobody is punished for data we no longer ask for ────────────────────────

console.log("");

const MIG = read("supabase/migrations/20260814170000_completeness-without-pii.sql");
check("completeness no longer scores a date of birth",
  /date_of_birth/.test(MIG.split("as $$")[1] ?? ""), false);
check("…nor an SSN, government ID or voided cheque",
  /ssn_last4|v_has_gov_id|v_has_banking/.test(MIG.split("as $$")[1] ?? ""), false);
check("…nor consults the PII flag", /collect_contracting_pii/.test(MIG.split("as $$")[1] ?? ""), false);
// 15 + 15 + 15 + 10 + 20 + 15 + 10. A denominator that does not reach 100 is
// the same bug in a different direction.
check("the remaining weights still sum to 100",
  (MIG.match(/v_total := v_total \+ (\d+)/g) ?? [])
    .map((m) => Number(m.replace(/\D/g, "")))
    .reduce((a, b) => a + b, 0),
  100);
check("the function is replaced, not dropped", /create or replace function public\.agent_completion/.test(MIG), true);
check("no column or table is dropped anywhere in it",
  /drop\s+(column|table)/i.test(MIG), false);

const ONB = read("src/lib/agent-onboarding.functions.ts");
check("identity no longer requires an SSN or date of birth",
  /p\.ssn_last4|agent\.ssn_last4|agent\.date_of_birth/.test(ONB), false);
check("the driver's licence step is gone", /key: "identification"/.test(ONB), false);
check("the bank details step is gone", /key: "banking"/.test(ONB), false);
check("…and nothing still reads producer_banking here", /producer_banking/.test(ONB), false);

const OVERVIEW = read("src/lib/agency-overview.functions.ts");
check("the ready/not-ready count drops them too",
  /ssn_last4|date_of_birth/.test(OVERVIEW), false);

// ── Hide, but keep ──────────────────────────────────────────────────────────

console.log("");

// The whole point of the change: stop asking, without destroying what was
// already given. A destructive migration would make this irreversible and
// would take the contracting packet's one real consumer with it.
const ALL_MIGRATIONS = read("supabase/migrations/20260814170000_completeness-without-pii.sql");
check("the migration says plainly that nothing is dropped",
  /Nothing is dropped or deleted/.test(ALL_MIGRATIONS), true);
check("…and names the consumer the columns still serve",
  /contracting packet/.test(ALL_MIGRATIONS), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
