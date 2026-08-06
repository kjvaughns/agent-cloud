/**
 * Does the lapse-risk scan rank the right policies, and admit what it cannot see?
 *
 *   npm run check:lapse-risk
 *
 * The existing `sync_retention_cases` scores with
 * `least(100, round(monthly_premium) + least(50, days_since_update))` — dollars
 * added to days — and only ever surfaces policies already in `lapse_pending` or
 * `nsf`, which is a list of failures rather than a prediction. Several cases
 * below are that comparison made explicit: a small premium in the month where
 * lapses actually happen must outrank a large premium that is seasoned and
 * healthy, and under the old arithmetic it could not.
 */

import {
  scoreLapseRisk, rankLapseRisk, summarise, MISSING_SIGNALS,
  HIGH_BAND, WATCH_BAND, type RiskInput,
} from "../src/lib/lapse-risk";

let pass = 0;
const failures: string[] = [];
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else {
    failures.push(name);
    console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  }
}

const TODAY = "2026-08-06";
const policy = (over: Partial<RiskInput> = {}): RiskInput => ({
  policyId: "p1", clientId: "c1", clientName: "Willie Jenkins",
  monthlyPremium: 62.4, faceAmount: 250_000,
  effectiveDate: "2024-01-01", lastContactAt: "2026-07-15",
  asOf: TODAY, ...over,
});

console.log("\n1. Months in force — the strongest signal");

// Months 2-4 is where first-year lapses concentrate: sold, first draft
// cleared, second or third did not.
const monthTwo = scoreLapseRisk(policy({ effectiveDate: "2026-06-01" }));
check("months 1-4 score highest", monthTwo.factors.some((f) => f.label === "Months 1–4"), true);

// Brand-new business scores LOWER, deliberately — it has not had the chance to
// fail a draft yet, and a save call on a two-week-old policy wastes the call.
const brandNew = scoreLapseRisk(policy({ effectiveDate: "2026-07-25" }));
check("a policy issued last week scores below one at month three",
  brandNew.score < monthTwo.score, true);

const seasoned = scoreLapseRisk(policy({ effectiveDate: "2021-01-01" }));
check("a seasoned policy has no months-in-force points",
  seasoned.factors.some((f) => f.label === "Seasoned"), false);

console.log("\n2. Premium relative to face, not premium");

// The point of the ratio: it means the same thing on a $50k policy and a
// $500k one, where raw premium ranks the agency's exposure instead.
const pricey = scoreLapseRisk(policy({ monthlyPremium: 140, faceAmount: 25_000 }));
check("a high premium against a small benefit is flagged",
  pricey.factors.some((f) => f.label === "Expensive per dollar of cover"), true);

const cheapPerDollar = scoreLapseRisk(policy({ monthlyPremium: 300, faceAmount: 2_000_000 }));
check("a large premium buying a lot of cover is not",
  cheapPerDollar.factors.some((f) => /per dollar of cover/.test(f.label)), false);

// The comparison the old arithmetic could not make.
const smallAndFragile = scoreLapseRisk(policy({
  monthlyPremium: 18, faceAmount: 10_000, effectiveDate: "2026-06-01", lastContactAt: null,
}));
const bigAndHealthy = scoreLapseRisk(policy({
  monthlyPremium: 95, faceAmount: 500_000, effectiveDate: "2021-01-01", lastContactAt: "2026-08-01",
}));
check("a small fragile policy outranks a large healthy one",
  smallAndFragile.score > bigAndHealthy.score, true);

console.log("\n3. Days since anyone spoke to them");

// An empty contact history is the thing being measured, not missing data —
// treating it as unknown would exempt exactly the clients nobody looks after.
const never = scoreLapseRisk(policy({ lastContactAt: null }));
check("never contacted is scored, not skipped",
  never.factors.some((f) => f.label === "Never contacted"), true);

const stale = scoreLapseRisk(policy({ lastContactAt: "2025-06-01" }));
check("nine months of silence scores the same as never",
  stale.factors.find((f) => /No contact in 9/.test(f.label))?.points,
  never.factors.find((f) => f.label === "Never contacted")?.points);

const recent = scoreLapseRisk(policy({ lastContactAt: "2026-08-01" }));
check("a call last week is not a risk factor",
  recent.factors.some((f) => /contact/i.test(f.label)), false);

console.log("\n4. The score is only ever the sum of its reasons");

const many = scoreLapseRisk(policy({
  monthlyPremium: 140, faceAmount: 25_000, effectiveDate: "2026-06-01", lastContactAt: null,
}));
check("the score equals its factors",
  many.score, Math.min(100, many.factors.reduce((a, f) => a + f.points, 0)));
check("and it is capped at 100", many.score <= 100, true);
check("every point traces to a sentence",
  many.factors.every((f) => f.detail.length > 0 && f.points > 0), true);
check("a high score bands as high", many.band, "high");

const quiet = scoreLapseRisk(policy({ effectiveDate: "2021-01-01", lastContactAt: "2026-08-01" }));
check("a healthy policy scores zero", quiet.score, 0);
check("and bands low", quiet.band, "low");

console.log("\n5. The queue is a queue, not the book");

const ranked = rankLapseRisk([many, quiet, smallAndFragile, bigAndHealthy]);
check("healthy policies are dropped, not ranked last",
  ranked.some((r) => r.score < WATCH_BAND), false);
check("ranked by score, highest first",
  ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score), true);
check("high-only narrows further",
  rankLapseRisk([many, quiet, smallAndFragile, bigAndHealthy], { minBand: "high" })
    .every((r) => r.score >= HIGH_BAND), true);
check("an empty book is an empty queue", rankLapseRisk([]), []);

// The tie-break is the ONLY place policy size decides anything, and only
// between two policies already scored equally likely to lapse.
const tieA = { ...many, policyId: "a", premiumAtRisk: 100 };
const tieB = { ...many, policyId: "b", premiumAtRisk: 900 };
check("equal scores break toward the larger premium",
  rankLapseRisk([tieA, tieB]).map((r) => r.policyId), ["b", "a"]);

console.log("\n6. Payment mode, now that policies store one");

check("weekly draft outscores annual",
  scoreLapseRisk(policy({ premiumMode: "weekly" })).score >
  scoreLapseRisk(policy({ premiumMode: "annual" })).score, true);
check("monthly outscores quarterly",
  scoreLapseRisk(policy({ premiumMode: "monthly" })).score >
  scoreLapseRisk(policy({ premiumMode: "quarterly" })).score, true);
check("an unknown mode scores nothing rather than assuming monthly",
  scoreLapseRisk(policy({ premiumMode: null })).score,
  scoreLapseRisk(policy({ premiumMode: "somethingelse" })).score);

console.log("\n6b. Saying what it could not look at");

check("one signal is named as missing", MISSING_SIGNALS.length, 1);
check("prior NSF is it",
  MISSING_SIGNALS.some((m) => /NSF/i.test(m.signal)), true);
check("each says why", MISSING_SIGNALS.every((m) => m.why.length > 20), true);


console.log("\n7. The one-line reason");

check("names the two biggest factors", summarise(many).split(" · ").length, 2);
check("and nothing is claimed when there is nothing",
  summarise(quiet), "No risk factors found.");

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
