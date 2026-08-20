/**
 * A half-typed policy survives the walk from the pipeline to Post a Deal.
 *
 *   npx tsx scripts/policy-draft-check.ts
 *
 * ── The defect ──
 *
 * "Whenever someone types in policy info in pipeline then clicks post deal,
 * the information isn't transferred. They have to redo it every single time."
 *
 * The drawer's Policy Information tab opens an Add Policy form automatically
 * for any client with no policies yet — which is every client an agent is
 * about to sell. Two inches above it, in the drawer header, sits the most
 * prominent button on the screen: "Post Deal". It navigated to `/post-deal`
 * with nothing but the client id.
 *
 * Everything typed into the form was component state, so it went in the bin,
 * and `getClientDealPrefill` had nothing to restore because it reads the
 * `policies` table and the form was never submitted. Nothing warned anybody,
 * because from the code's side nothing was lost — it had never been saved.
 *
 * Two forms for one job, and the louder one silently discarded the other.
 *
 * ── What is asserted ──
 *
 * The encoding both ways, and then the wiring, because the wiring is where
 * this failed: the button that navigates and the form that holds the values
 * were siblings who could not see each other.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  encodePolicyDraft,
  decodePolicyDraft,
  draftHasContent,
  postDealStatus,
  type PolicyDraft,
} from "../src/lib/deals/policy-draft";

const ROOT = join(import.meta.dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// What the drawer's form holds when the agent has typed a real policy.
const TYPED = {
  carrier_id: "c1e1f1a1-0000-0000-0000-000000000001",
  policy_number: "ETH-4471",
  product: "Ethos Term Life",
  status: "active",
  monthly_premium: "129.40",
  face_amount: "50000",
  effective_date: "2026-09-01",
  sale_date: "2026-08-18",
};

// The drawer's untouched form: a status and a sale date it filled in itself.
const UNTOUCHED = {
  carrier_id: "", policy_number: "", product: "", status: "active",
  monthly_premium: "", face_amount: "", effective_date: "", sale_date: "2026-08-18",
};

// ── Content, not defaults ───────────────────────────────────────────────────

check("an untouched form has no content", draftHasContent(UNTOUCHED as PolicyDraft), false);
check("…so pressing Post Deal on one navigates exactly as before",
  encodePolicyDraft(UNTOUCHED as PolicyDraft), {});
check("one field is enough to count as started",
  draftHasContent({ carrier_id: "x" }), true);
check("…and a lone premium counts too",
  draftHasContent({ monthly_premium: "40" }), true);
// The two the drawer fills in by itself must never make an empty form look
// half-filled, or every navigation would carry a phantom draft.
check("a status alone is not content", draftHasContent({ status: "issued_not_paid" }), false);
check("a sale date alone is not content", draftHasContent({ sale_date: "2026-08-18" }), false);

// ── The round trip ──────────────────────────────────────────────────────────

const wire = encodePolicyDraft({ ...TYPED, status: postDealStatus(TYPED.status) });
check("every typed field is carried", Object.keys(wire).sort(), [
  "d_carrier_id", "d_effective_date", "d_face_amount",
  "d_monthly_premium", "d_policy_number", "d_product", "d_sale_date", "d_status",
]);
check("…namespaced so they cannot collide with client_id",
  Object.keys(wire).every((k) => k.startsWith("d_")), true);

const back = decodePolicyDraft(wire);
check("the policy comes out the other side intact", back, {
  carrier_id: TYPED.carrier_id,
  product: TYPED.product,
  policy_number: TYPED.policy_number,
  effective_date: TYPED.effective_date,
  face_amount: TYPED.face_amount,
  monthly_premium: TYPED.monthly_premium,
  status: "issued_not_paid",
  sale_date: TYPED.sale_date,
});

check("a partial draft carries only what was filled",
  decodePolicyDraft(encodePolicyDraft({ carrier_id: "abc", product: "Term" })),
  { carrier_id: "abc", product: "Term" });
check("unrelated search params are ignored",
  decodePolicyDraft({ client_id: "not-a-draft", scope: "agency" }), {});
check("an empty string is absent rather than blanking a prefilled field",
  decodePolicyDraft({ d_product: "", d_carrier_id: "abc" }), { carrier_id: "abc" });

// ── The status a live policy must not preselect ─────────────────────────────

check("in_review survives", postDealStatus("in_review"), "in_review");
check("active becomes the form's own default", postDealStatus("active"), "issued_not_paid");
check("…as does anything past submission", postDealStatus("lapsed"), "issued_not_paid");
check("…and a missing status", postDealStatus(null), "issued_not_paid");
check("a draft cannot smuggle a status the form does not offer",
  decodePolicyDraft({ d_carrier_id: "x", d_status: "lapsed" }).status, "issued_not_paid");

// ── The wiring, which is where this actually broke ──────────────────────────

const DRAWER = strip(read("src/components/pipeline/client-detail-drawer.tsx"));
const DEAL = strip(read("src/routes/_authenticated/post-deal.tsx"));
const FNS = strip(read("src/lib/post-deal.functions.ts"));

check(
  "the header's Post Deal button carries the draft",
  /search: \{ client_id: client\.id, \.\.\.encodePolicyDraft\(draft\?\.current\) \}/.test(DRAWER),
  true,
);
check(
  "…and no longer navigates with the client id alone",
  /search: \{ client_id: client\.id \}\s*\)/.test(DRAWER),
  false,
);
check(
  "the add-policy form publishes what is typed",
  /const next: PolicyDraft = \{ \.\.\.form/.test(DRAWER) && /draft\.current = next/.test(DRAWER),
  true,
);
// And keeps it for the tab, so arriving at Post a Deal by any other door
// (sidebar, top bar, a pipeline row) restores it too.
check("…and stashes it for the tab", /stashPolicyDraft\(clientId, next\)/.test(DRAWER), true);
check("post a deal falls back to the stash", /readStashedPolicyDraft\(/.test(DEAL), true);
check("…only for the client it was typed against", /stashed\.clientId === client_id/.test(DEAL), true);
check("…and clears it once the deal is posted", /clearStashedPolicyDraft\(\)/.test(DEAL), true);
check(
  "the draft is cleared when the drawer moves to another client",
  /policyDraft\.current = \{\};/.test(DRAWER),
  true,
);
check("nothing writes a draft to the database", /from\("policies"\)\s*\.insert/.test(DRAWER), false);

check("post a deal accepts the draft params", /k\.startsWith\("d_"\)/.test(DEAL), true);
check("…and applies them", /decodePolicyDraft\(/.test(DEAL), true);
// Order matters: the prefill is what the database remembers, the draft is what
// the agent typed seconds ago, and where they disagree the agent is right.
check(
  "…after the server prefill, so the agent's own typing wins",
  DEAL.indexOf("decodePolicyDraft(") > DEAL.indexOf("prefill.beneficiaries"),
  true,
);

// One definition of which statuses this form may preselect.
check(
  "the prefill shares the status rule rather than restating it",
  /status: postDealStatus\(policy\.status\)/.test(FNS),
  true,
);
check(
  "…so the inline ternary is gone",
  /policy\.status === "in_review" \? "in_review" : "issued_not_paid"/.test(FNS),
  false,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
