/**
 * The contracting handoff: which door, which URL, and whether the click left
 * a record.
 *
 *   npx tsx scripts/handoff-check.ts
 *
 * Two halves. The first is real: `contracting-ops/handoff.ts` is pure, so
 * method resolution and URL templating are exercised against actual inputs —
 * including the two behaviours the old inline code got wrong (ignoring
 * `applies_to`, and falling back to legacy columns for some method kinds but
 * not others). The second half is string assertions over the wiring, which
 * prove the pieces are still connected rather than that they work — worth
 * having here specifically, because `portal_handoff`, `submission_method` and
 * `marked_submitted_at` all existed in the schema for weeks with no writer and
 * nothing anywhere noticed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveHandoffMethod, legacyFallbackUrl, buildHandoffUrl, hostOf,
  type HandoffMethod,
} from "../src/lib/contracting-ops/handoff";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── Method resolution ───────────────────────────────────────────────────────

const m = (over: Partial<HandoffMethod>): HandoffMethod => ({
  id: over.id ?? "m0", method: "surelc", applies_to: [], target_url: "https://x",
  target_email: null, instructions: null, is_default: false, sort_order: 0, ...over,
});

const METHODS: HandoffMethod[] = [
  m({ id: "m1", method: "email", applies_to: ["transfer"], target_email: "t@x.com", sort_order: 0 }),
  m({ id: "m2", method: "surelc", applies_to: [], is_default: true, sort_order: 1 }),
  m({ id: "m3", method: "carrier_portal", applies_to: [], sort_order: 2 }),
];

// The bug the resolver replaces: the packet picked `default ?? first` with no
// regard for applies_to, so "email for transfers, SureLC for the rest" showed
// SureLC on transfer packets.
check("a transfer prefers the transfer-scoped method over the default",
  resolveHandoffMethod(METHODS, "transfer")?.id, "m1");
check("everything else gets the default", resolveHandoffMethod(METHODS, "new_contract")?.id, "m2");
check("empty applies_to means all types, not no types",
  resolveHandoffMethod([m({ id: "m9", applies_to: [] })], "release")?.id, "m9");
check("null applies_to is treated as empty",
  resolveHandoffMethod([m({ id: "m9", applies_to: null })], "release")?.id, "m9");
check("without a default, sort_order decides",
  resolveHandoffMethod([m({ id: "b", sort_order: 2 }), m({ id: "a", sort_order: 1 })], "new_contract")?.id, "a");
check("an explicit method id wins over everything",
  resolveHandoffMethod(METHODS, "transfer", "m3")?.id, "m3");
// The explicit id comes from a browser. One that is not among this carrier's
// methods resolves to null rather than being trusted.
check("a foreign method id resolves to null", resolveHandoffMethod(METHODS, "transfer", "not-ours"), null);
check("no methods, no answer", resolveHandoffMethod([], "new_contract"), null);
check("nothing applies, no answer",
  resolveHandoffMethod([m({ applies_to: ["release"] })], "transfer"), null);

// ── Legacy fallback — all four kinds, which is the point ────────────────────

console.log("");

const CARRIER = {
  surelc_url: "https://surelc.example/x",
  contracting_portal_url: "https://portal.example/x",
  invitation_link: "https://invite.example/x",
  contracting_email: "paperwork@example.com",
};

check("surelc falls back", legacyFallbackUrl(CARRIER, "surelc"), CARRIER.surelc_url);
check("portal falls back", legacyFallbackUrl(CARRIER, "carrier_portal"), CARRIER.contracting_portal_url);
check("invitation falls back", legacyFallbackUrl(CARRIER, "invitation_link"), CARRIER.invitation_link);
check("email falls back to a mailto", legacyFallbackUrl(CARRIER, "email"), "mailto:paperwork@example.com");
check("kinds with no legacy home yield null", legacyFallbackUrl(CARRIER, "spreadsheet"), null);
check("a missing carrier yields null", legacyFallbackUrl(null, "surelc"), null);

// ── URL templating ──────────────────────────────────────────────────────────

console.log("");

const AGENT = { npn: "1234567", first_name: "Seán", last_name: "O'Brien", email: "sean+ac@x.com" };

check("placeholders are filled",
  buildHandoffUrl("https://s.example/apply?npn={npn}", AGENT),
  "https://s.example/apply?npn=1234567");
// The agent's own name must not be able to change the URL's shape.
check("values are URL-encoded",
  buildHandoffUrl("https://s.example/?ln={last_name}&e={email}", AGENT),
  "https://s.example/?ln=O'Brien&e=sean%2Bac%40x.com".replace("O'Brien", encodeURIComponent("O'Brien")));
check("a URL with no placeholders passes through untouched",
  buildHandoffUrl("https://plain.example/path?fixed=1", AGENT), "https://plain.example/path?fixed=1");
// A carrier's form reading the literal "{npn}" as an NPN is worse than blank.
check("a placeholder with no value is removed, not sent literally",
  buildHandoffUrl("https://s.example/?npn={npn}", { npn: null }), "https://s.example/?npn=");
check("unknown placeholders are left alone — they may be the carrier's own",
  buildHandoffUrl("https://s.example/?x={session_token}", AGENT), "https://s.example/?x={session_token}");

check("hostOf extracts the host", hostOf("https://surelc.surancebay.com/a/b?c=1"), "surelc.surancebay.com");
check("hostOf refuses a non-URL without throwing", hostOf("not a url"), null);

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const HANDOFF_FN = readFileSync(join(ROOT, "src/lib/contracting-handoff.functions.ts"), "utf8");
const OPS = readFileSync(join(ROOT, "src/lib/contracting-ops.functions.ts"), "utf8");
const AUDIT = readFileSync(join(ROOT, "src/lib/contracting-ops/audit.ts"), "utf8");
const DETAIL = readFileSync(join(ROOT, "src/routes/_authenticated/contracting-ops/requests/$requestId.tsx"), "utf8");
// The carrier setup UI moved out of the route tree in the Settings
// consolidation; the route file is a redirect stub now.
const CARRIERS_UI = readFileSync(join(ROOT, "src/components/contracting/carrier-setup.tsx"), "utf8");
const MIGRATION = readFileSync(join(ROOT, "supabase/migrations/20260814100000_contracting-gateway-consolidation.sql"), "utf8");

// The departure is recorded. These three schema slots sat unwritten for weeks.
check("the handoff writes a portal_handoff submission",
  /artifact_type: "portal_handoff"/.test(HANDOFF_FN), true);
check("the handoff stamps submission_method",
  /update\(\{ submission_method: methodKind \}\)/.test(HANDOFF_FN), true);
check("mark-submitted confirms the open handoff",
  /marked_submitted_at: now,\s*\n\s*marked_submitted_by: userId/.test(OPS), true);
check("handoff.opened is an audit action", /"handoff\.opened"/.test(AUDIT), true);
check("the audit row carries ip and user agent",
  /ip_address: input\.ipAddress \?\? null/.test(AUDIT) && /ipAddress: getRequestIP/.test(HANDOFF_FN), true);

// The snapshot must hold the template, never the substituted URL — the
// substituted URL carries the agent's NPN and email.
check("the telemetry snapshot stores the template, not the built URL",
  /payload_snapshot: \{[\s\S]{0,200}template,/.test(HANDOFF_FN)
  && !/payload_snapshot: \{[\s\S]{0,200}\burl\b,/.test(HANDOFF_FN), true);

// One resolver, both callers.
check("the packet resolves through the shared resolver",
  /const method = resolveHandoffMethod\(/.test(OPS), true);
check("the packet no longer ignores applies_to via default-or-first",
  /find\(\(m: any\) => m\.is_default\) \?\? \(methods \?\? \)\[0\]/.test(strip(OPS)), false);
check("the packet falls back to legacy columns through the shared mapping",
  /legacyFallbackUrl\(facts\.carrier, "carrier_portal"\)/.test(OPS), true);

// The request page departs through the server, not a raw anchor.
const DETAIL_CODE = strip(DETAIL);
check("no raw anchor on the surelc url remains",
  /<a href=\{packet\.carrier\.surelc_url\}/.test(DETAIL_CODE), false);
check("no raw anchor on the portal url remains",
  /<a href=\{packet\.carrier\.portal_url\}/.test(DETAIL_CODE), false);
check("no raw anchor on the invitation link remains",
  /<a href=\{packet\.carrier\.invitation_link\}/.test(DETAIL_CODE), false);
check("the page calls beginContractingHandoff", /beginContractingHandoff/.test(DETAIL), true);
// window.open must not get "noopener" in the features string — it would return
// null and there would be no window to point at the resolved URL.
check("the popup is opened synchronously and retargeted",
  /window\.open\("about:blank", "_blank"\)/.test(DETAIL) && /w\.opener = null/.test(DETAIL), true);
check("the page shows the handoff history", /not yet marked submitted/.test(DETAIL), true);

// One store for gateways.
const CARRIERS_CODE = strip(CARRIERS_UI);
check("the carrier dialog no longer offers a surelc_url field",
  /\["surelc_url"/.test(CARRIERS_CODE), false);
check("the carrier dialog no longer offers a portal field",
  /\["contracting_portal_url"/.test(CARRIERS_CODE), false);
check("saveOrgCarrier no longer accepts the gateway columns",
  /surelc_url: z\.string/.test(strip(OPS)), false);
check("the card chips read method rows first", /org_carrier_methods \?\? \[\]/.test(CARRIERS_UI), true);

// The migration's three load-bearing properties.
check("the backfill skips kinds that already have a row",
  /not exists \(\s*select 1 from public\.org_carrier_methods m/.test(MIGRATION), true);
check("blank legacy urls are not promoted into rows", /btrim\(kind\.url\) <> ''/.test(MIGRATION), true);
check("default promotion respects the one-default index",
  /not exists \(\s*select 1 from public\.org_carrier_methods d/.test(MIGRATION), true);
check("the legacy columns are deprecated, not dropped",
  /comment on column public\.org_carriers\.surelc_url/.test(MIGRATION) && !/drop column/i.test(MIGRATION), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
