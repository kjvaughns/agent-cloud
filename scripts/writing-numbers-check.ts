/**
 * Checks the two decisions `src/lib/writing-numbers.ts` makes without a
 * database: which of several numbers an agent holds at one carrier is the one
 * to show, and whether a write that failed because the migration has not been
 * applied yet is reported as a failure or absorbed.
 *
 * `npx tsx scripts/writing-numbers-check.ts`
 *
 * The ranking matters more than it looks. An agent can legitimately hold
 * several numbers at one carrier, and until now the app showed whichever the
 * database happened to return first. A self-reported number outranking a
 * carrier confirmation would mean the screen shows the agent's typo instead of
 * the number the carrier actually pays against.
 *
 * Run alongside `import-check.ts` and `nav-snapshot.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadWritingNumbers, recordWritingNumber, resolveOrgCarrierId, writingNumberKey } from "../src/lib/writing-numbers";

const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

/** A stand-in for the PostgREST builder, narrow enough for these paths. */
function fakeDb(handlers: Record<string, any>) {
  return {
    from(table: string) {
      const h = handlers[table] ?? {};
      const builder: any = {
        _rows: h.rows ?? [],
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        maybeSingle() { return Promise.resolve(h.single ?? { data: null, error: null }); },
        insert(row: any) {
          (h.inserted ??= []).push(row);
          const res = h.insertResult ?? { data: { id: "new-id" }, error: null };
          return Object.assign(Promise.resolve(res), {
            select: () => ({ maybeSingle: () => Promise.resolve(res) }),
          });
        },
        then(resolve: any) { return Promise.resolve({ data: h.rows ?? [], error: h.error ?? null }).then(resolve); },
      };
      return builder;
    },
  };
}

// ── Which number wins ──────────────────────────────────────────────────

const AGENT = "agent-1";
const CARRIER = "carrier-1";
const key = writingNumberKey(AGENT, CARRIER);

async function pick(rows: any[]) {
  const db = fakeDb({ writing_numbers: { rows } });
  const map = await loadWritingNumbers(db as any, [AGENT]);
  return map.get(key) ?? null;
}

const row = (writing_number: string, source: string, status = "active") => ({
  agent_id: AGENT, writing_number, source, status, org_carriers: { carrier_id: CARRIER },
});

check("single row wins by default",
  await pick([row("WN-1", "self_reported")]), "WN-1");

// The one that matters: the carrier's own confirmation beats what the agent
// typed, whichever order the database returned them in.
check("carrier confirmation beats self-reported",
  await pick([row("TYPO", "self_reported"), row("WN-REAL", "carrier_confirmation")]), "WN-REAL");
check("…and the same the other way round",
  await pick([row("WN-REAL", "carrier_confirmation"), row("TYPO", "self_reported")]), "WN-REAL");

check("a workflow outcome beats self-reported",
  await pick([row("TYPO", "self_reported"), row("WN-ISSUED", "request_outcome")]), "WN-ISSUED");
check("carrier confirmation beats a workflow outcome",
  await pick([row("WN-ISSUED", "request_outcome"), row("WN-REAL", "carrier_confirmation")]), "WN-REAL");

// Status outranks source entirely: a terminated number is not the answer even
// when the carrier confirmed it, because the agent cannot write on it today.
check("an active self-report beats a terminated confirmation",
  await pick([row("WN-DEAD", "carrier_confirmation", "terminated"), row("WN-LIVE", "self_reported")]), "WN-LIVE");

// A backfilled row is the weakest claim there is — it came from a column
// nothing reconciled.
check("anything beats a legacy backfill",
  await pick([row("WN-OLD", "legacy_backfill"), row("WN-NEW", "self_reported")]), "WN-NEW");
check("a staff entry beats a legacy backfill",
  await pick([row("WN-OLD", "legacy_backfill"), row("WN-STAFF", "manual_entry")]), "WN-STAFF");
check("…and the same the other way round",
  await pick([row("WN-STAFF", "manual_entry"), row("WN-OLD", "legacy_backfill")]), "WN-STAFF");

// Staff entering a number on an agent's behalf outranks the agent's own claim.
check("a staff entry beats self-reported",
  await pick([row("TYPO", "self_reported"), row("WN-STAFF", "manual_entry")]), "WN-STAFF");

// An unrecognised source must not outrank a known one just by being unknown.
check("an unknown source ranks at the bottom",
  await pick([row("WN-???", "something_new"), row("WN-STAFF", "manual_entry")]), "WN-STAFF");

// Where the two legacy stores disagreed the backfill kept both, and they rank
// identically. The answer is arbitrary; what matters is that it is the same on
// every load rather than dependent on row order.
check("a tie resolves the same way regardless of order (a)",
  await pick([row("WN-AAA", "legacy_backfill"), row("WN-BBB", "legacy_backfill")]), "WN-AAA");
check("a tie resolves the same way regardless of order (b)",
  await pick([row("WN-BBB", "legacy_backfill"), row("WN-AAA", "legacy_backfill")]), "WN-AAA");

check("no rows → nothing, so the caller falls back to the legacy column",
  await pick([]), null);
check("no agents → empty map, and no query",
  (await loadWritingNumbers(fakeDb({}) as any, [])).size, 0);

// A row whose org carrier did not resolve cannot be attributed to a carrier,
// so it must be dropped rather than keyed against undefined.
check("row with no carrier is skipped",
  await pick([{ agent_id: AGENT, writing_number: "WN-X", source: "self_reported", status: "active", org_carriers: null }]),
  null);

// ── Writes in the window before the migration is applied ───────────────

console.log("");

async function write(insertResult: any, existingLink: any = { data: { id: "oc-1" }, error: null }) {
  const db = fakeDb({
    org_carriers: { single: existingLink },
    writing_numbers: { insertResult },
  });
  return recordWritingNumber(db as any, {
    agentId: AGENT, orgId: "org-1", carrierId: CARRIER, writingNumber: "WN-1",
  });
}

check("a clean insert reports success",
  await write({ data: null, error: null }), true);

// 23505 means the number is already recorded, which is the end state wanted.
check("a duplicate is success, not failure",
  await write({ data: null, error: { code: "23505" } }), true);

// 23514 and 42501 are what the unapplied migration looks like from here: the
// `self_reported` source is not yet a permitted value and the agent write
// policy does not exist. Neither may be raised to the caller — the legacy
// column still holds the number in that window.
check("check violation is absorbed",
  await write({ data: null, error: { code: "23514" } }), false);
check("RLS violation is absorbed",
  await write({ data: null, error: { code: "42501" } }), false);

check("an empty number is never written",
  await recordWritingNumber(fakeDb({}) as any, {
    agentId: AGENT, actorId: AGENT, orgId: "org-1", carrierId: CARRIER, writingNumber: "   ",
  }), false);

// A personal account with no organization has nothing to attach a row to.
// That is a normal state, not an error.
check("no organization → no row, no throw",
  await recordWritingNumber(fakeDb({}) as any, {
    agentId: AGENT, actorId: AGENT, orgId: null, carrierId: CARRIER, writingNumber: "WN-1",
  }), false);

check("no organization → org carrier resolves to null",
  await resolveOrgCarrierId(fakeDb({}) as any, null, CARRIER), null);

// The link is created when it is missing, which is what keeps a carrier the
// agency never linked from silently losing its writing numbers.
check("a missing org carrier link is created",
  await resolveOrgCarrierId(
    fakeDb({ org_carriers: { single: { data: null, error: null }, insertResult: { data: { id: "oc-new" }, error: null } } }) as any,
    "org-1", CARRIER,
  ), "oc-new");

// ── A writing number that appears has somebody's name against it ────────────
//
// `writing_number.created` has been in the audit vocabulary since the log was
// built, and the staff editor always wrote it. The four other paths that
// record a number did not, so a number could appear against an agent with
// nothing saying who put it there — one of the seven changes the recovery
// brief names as needing a trail.

const WN = strip(readFileSync(join(process.cwd(), "src/lib/writing-numbers.ts"), "utf8"));

check("recording a number writes the audit row",
  /action: "writing_number\.created"/.test(WN), true);
check("…naming the agent it is about",
  /subjectAgentId: args\.agentId/.test(WN), true);
check("…and who did it", /actorId: args\.actorId/.test(WN), true);
// A duplicate is the desired end state, not a change. Auditing it would fill
// the trail with entries for writes that did not happen.
check("a duplicate is not audited",
  WN.indexOf('recordAudit') < WN.indexOf('error.code === "23505"'), true);

// The whole point of putting it in the recorder: a call site cannot record a
// number without recording that they did.
for (const f of ["src/lib/contracting.functions.ts", "src/lib/admin.functions.ts"]) {
  const src = strip(readFileSync(join(process.cwd(), f), "utf8"));
  const calls = src.split("recordWritingNumber(").slice(1);
  check(`every call site in ${f.split("/").pop()} names an actor`,
    calls.every((c) => /actorId:/.test(c.slice(0, 400))), true);
}

// ── "I already have a writing number" ───────────────────────────────────────
//
// One of the two ways an agent adds a carrier is to say they already hold the
// contract and type the number. That number went into the request's note text
// and nowhere else: `existing_writing_number` on the packet was hard-coded
// null, the readiness rule keyed to it could never be satisfied, and whoever
// verified the contract read a sentence and retyped the digits out of it.
//
// `writing_numbers` was already the authoritative store and already allowed
// `source = 'self_reported'`, with an RLS policy written for exactly this row.
// The mechanism existed and nothing used it.

console.log("");

const CONTRACTING = readFileSync(join(process.cwd(), "src/lib/contracting.functions.ts"), "utf8");
check("an agent-reported number is recorded as a row",
  /\.from\("writing_numbers"\)\.insert\(\{[\s\S]{0,400}source: "self_reported"/.test(CONTRACTING), true);
// The point of the whole path: recorded AND explicitly not trusted.
check("…as pending, not active",
  /source: "self_reported",\s*\n\s*status: "pending"/.test(CONTRACTING), true);
check("…tied to the request it came in on",
  /request_id: created\[0\]\.requestId/.test(CONTRACTING), true);
check("…and saying on the row that nobody has checked it",
  /Not verified with the carrier/.test(CONTRACTING), true);
// The request is already saved by this point. Losing it because a supporting
// row would not write is the worse outcome of the two.
check("a failure here does not lose the request",
  /could not record the agent-reported writing number/.test(CONTRACTING), true);

const OPS2 = readFileSync(join(process.cwd(), "src/lib/contracting-ops.functions.ts"), "utf8");
check("the packet reads it back rather than hard-coding null",
  /existing_writing_number: selfReportedNumber/.test(OPS2), true);
check("…only the self-reported, still-unverified one",
  /\.eq\("source", "self_reported"\)\s*\n\s*\.eq\("status", "pending"\)/.test(OPS2), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
