/**
 * Every user-facing delete must be able to tell you it deleted nothing.
 *
 * `npx tsx scripts/delete-check.ts`
 *
 * Postgres does not treat "matched no rows" as an error, and PostgREST returns
 * no error either. So a `DELETE` that row-level security filtered out comes
 * back looking exactly like one that worked:
 *
 *   const { error } = await supabase.from("tasks").delete().eq("id", id);
 *   if (error) throw new Error(error.message);   // never fires
 *   return { ok: true };                          // always
 *
 * The screen then removes the row optimistically and the next refresh brings it
 * back. This is what produced the "Not found" report on contract deletion — the
 * one place that *had* been given a check, so it was the only one loud enough to
 * notice.
 *
 * The fix is `.select("id")` and an assertion on the length. This script fails
 * if a delete that names a single row by id lands without one.
 *
 * Deliberately not covered — a delete whose whole purpose is to clear whatever
 * is there, where zero rows is the state the caller asked for:
 *
 *   replace-all writes (delete then insert: background questions, field
 *   mappings, role rows), toggles (favourites), clear-all (notifications),
 *   idempotent disconnects (Discord, a stored API key), and bulk grid rebuilds
 *   that report their own count.
 *
 * These are listed in ALLOWED below with the reason, so the exemption is a
 * decision on the record rather than an omission.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LIB = join(process.cwd(), "src/lib");

/** `file:table` → why a row-count assertion would be wrong here. */
const ALLOWED: Record<string, string> = {
  "account.functions.ts:background_questions":
    "delete-then-insert: the answers are replaced wholesale, and a first-time save has nothing to remove",
  "admin.functions.ts:user_roles":
    "demotion to plain agent: an agent who held no role row is already in the requested state",
  "admin.functions.ts:commission_grids":
    "bulk rebuild scoped to the platform's own rows; the insert that follows is what the caller is told about",
  "permissions.functions.ts:user_roles":
    "reconciliation sweep over rows that may legitimately not exist",
  "contracting-templates.functions.ts:contracting_field_mappings":
    "delete-then-insert against the template being saved",
  "contracting.functions.ts:producer_documents":
    "replaces the AML certificate; there may not be one yet",
  "contracting.functions.ts:agent_commission_levels":
    "already selects and returns the number cleared",
  "favorites.functions.ts:favorites":
    "toggle off: not currently favourited is the state the caller asked for",
  "notifications.functions.ts:notifications":
    "clear-all and clear-read: an empty list is a valid starting point",
  "discord.functions.ts:discord_integrations":
    "disconnect: no integration is the state the caller asked for",
  "book-import.functions.ts:agent_integrations":
    "removing a stored key that may never have been saved; the error is checked",
  "comp-grid.functions.ts:commission_grids":
    "replaces a carrier's grid wholesale before reinserting",
  "comp-grid.functions.ts:carrier_comp_levels":
    "replaces a carrier's levels wholesale before reinserting",
  // There is no `academy_lessons` table and there never was — the entry that
  // used to sit here excused a delete against `academy_modules`, which is in
  // fact asserted like everything else. A named exemption for a table that does
  // not exist excuses nothing and hides that fact.
  "resources-admin.functions.ts:<table>":
    "rollback inside forkInto: undoes the copy this call just made when its "
    + "lessons fail to copy. The row is one nobody has seen and the failure is "
    + "already being thrown; a second error about the cleanup would replace the "
    + "one that matters",
};

let pass = 0;
let fail = 0;

for (const file of readdirSync(LIB).filter((f) => f.endsWith(".ts")).sort()) {
  const src = readFileSync(join(LIB, file), "utf8");

  // Anchored on `.delete()`, not on `.from(...)`.
  //
  // Matching forwards from `.from("x")` to a nearby `.delete()` reads across
  // unrelated statements: a `.from("profiles").select(...).eq("id", userId)`
  // sitting a few lines above a delete made this script report a delete against
  // `profiles` filtered by id, and there is no such delete anywhere in the tree.
  // The table is whichever `.from(...)` is nearest *behind* the delete, and the
  // filters are whatever is chained *after* it.
  const re = /\.delete\(\)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 200), m.index);
    const froms = [...before.matchAll(/\.from\(\s*(?:"([a-z_]+)"|(\w+))\s*\)/g)];
    const last = froms[froms.length - 1];
    if (!last) continue;
    const table = last[1] ?? `<${last[2]}>`;
    const key = `${file}:${table}`;

    // The chained call up to the end of the statement.
    const after = src.slice(m.index, m.index + 700);
    const stmtEnd = after.indexOf(";");
    const chain = stmtEnd === -1 ? after : after.slice(0, stmtEnd);

    // Only deletes that name one row. A delete with no `id` filter is a sweep,
    // and "how many did it clear" is not a question with a wrong answer.
    if (!/\.eq\(\s*"id"\s*,/.test(chain)) continue;

    if (ALLOWED[key]) { pass++; continue; }

    const selects = /\.select\(\s*"id"\s*\)/.test(chain);
    const asserts = /if\s*\(\s*!\w+\?\.length\s*\)/.test(after);

    if (selects && asserts) { pass++; console.log(`ok    ${key}`); }
    else {
      fail++;
      console.log(`FAIL  ${key}`);
      console.log(`        no row-count assertion on a delete that names one row by id`);
      console.log(`        add .select("id") and throw when nothing came back,`);
      console.log(`        or add an entry to ALLOWED in this script saying why not`);
    }
  }
}

// ── The other half: does anybody show the refusal? ─────────────────────────
//
// A server that throws and a screen that ignores it is still a silent failure —
// the row disappears optimistically and comes back on the next refresh, which
// is exactly the symptom. Three call sites were like this: two `useMutation`s
// with an `onSuccess` and no `onError`, and one bare `.then()` with no `.catch`,
// where a rejection was an unhandled promise rejection and nothing reached the
// user at all.

console.log("");

const UI_DIRS = [join(process.cwd(), "src/routes"), join(process.cwd(), "src/components")];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const DELETE_FNS =
  /(delete|remove)(Task|CalendarEvent|LandingPage|Funnel|Prospect|Beneficiary|LifeEvent|ChangeRequest|NovaConversation|Automation|Announcement)/i;

for (const dir of UI_DIRS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, "utf8");
    if (!DELETE_FNS.test(src)) continue;
    const rel = file.slice(process.cwd().length + 1);

    // useMutation blocks whose mutationFn calls a delete server fn.
    for (const m of src.matchAll(/useMutation\(\{[\s\S]{0,400}?\n\s*\}\);/g)) {
      const block = m[0];
      if (!/mutationFn/.test(block)) continue;
      if (!/del(ete)?\w*Fn|remove\w*Fn/i.test(block)) continue;
      if (/onError/.test(block)) { pass++; continue; }
      fail++;
      console.log(`FAIL  ${rel}`);
      console.log(`        a delete mutation with no onError — the server's refusal is swallowed`);
    }

    // Bare promise chains on a delete fn with no .catch.
    //
    // Matched on the call site and then checked over a fixed forward window,
    // rather than trying to make one regex span the whole chain: a lazy
    // quantifier ends the match at the first `)`, which is before the `.catch`
    // it is looking for, so a guarded chain reported as unguarded.
    for (const m of src.matchAll(/\b(?:del\w*Fn|remove\w*Fn)\(\{/g)) {
      const window = src.slice(m.index!, m.index! + 400);
      if (!/\.then\(/.test(window)) continue;
      if (/\.catch\(/.test(window)) { pass++; continue; }
      fail++;
      console.log(`FAIL  ${rel}`);
      console.log(`        a delete .then() with no .catch — a rejection reaches nobody`);
    }
  }
}

console.log(`\n${pass} site(s) accounted for, ${fail} unguarded`);
if (fail) process.exit(1);
