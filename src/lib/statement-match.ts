/**
 * Matching a statement line to a policy when the policy number does not.
 *
 * ── Why there has to be a second pass ───────────────────────────────────────
 *
 * `reconcile_statement` matches on `normalize_policy_number` and nothing else.
 * That is the right *first* pass — a policy number is an identifier and an
 * exact hit needs no further argument — but it leaves a pile labelled
 * "unmatched" that is mostly not unmatched at all:
 *
 *   - The carrier prints a base number and the platform stores the number with
 *     a suffix, or vice versa (`4820193` against `MUT-4820193-01`).
 *   - The statement's policy column is blank on adjustment and chargeback
 *     lines, which are exactly the lines worth reconciling.
 *   - A statement is a printed ledger and somebody retyped the number.
 *
 * Every one of those has a name, an amount and a date on it, and a person
 * reconciling by hand uses those three. This is that, made explicit.
 *
 * ── The stance ─────────────────────────────────────────────────────────────
 *
 * Nothing here writes. It returns *suggestions*, ranked, with the reason
 * spelled out, and a person applies them. That is deliberate and it is the same
 * decision as the carrier confirmation list: the cost of a wrong automatic
 * match is a commission attributed to the wrong producer and a variance
 * reported against a policy that never had one — silent, plausible, and
 * discovered a quarter later. The cost of asking is a click.
 *
 * A suggestion below `SUGGEST_FLOOR` is not shown at all. "Here are eleven
 * things it might be" is not help.
 */

import { normName } from "./import-match";
import { similarity } from "./carrier-match";

/** Below this, say nothing rather than offer a list. */
export const SUGGEST_FLOOR = 0.55;

/**
 * At or above this the evidence is strong enough that the UI pre-ticks it.
 * Still a tick, never a write — see the note above.
 */
export const STRONG_MATCH = 0.85;

export type MatchCandidate = {
  policyId: string;
  policyNumber: string | null;
  insuredName: string | null;
  agentId: string | null;
  agentName: string | null;
  monthlyPremium: number | null;
  annualPremium: number | null;
  effectiveDate: string | null;
  /** Sum of commission_schedule for this policy — what we expected to be paid. */
  expected: number | null;
};

export type MatchLine = {
  lineId: string;
  policyNumber: string | null;
  insuredName: string | null;
  agentName: string | null;
  paidAmount: number;
  paidDate: string | null;
};

export type MatchSuggestion = {
  lineId: string;
  policyId: string;
  confidence: number;
  /** Written for a person deciding, not for a log. */
  reasons: string[];
  expected: number | null;
  variance: number | null;
};

// ── Signals ─────────────────────────────────────────────────────────────────

/**
 * Policy numbers that differ only by decoration.
 *
 * Carriers print `4820193`, `MUT-4820193` and `MUT-4820193-01` for the same
 * contract. Stripping to digits and asking whether one contains the other
 * catches all three without matching two genuinely different policies — a
 * seven-digit number appearing inside another seven-digit number means they
 * are the same number.
 *
 * Guarded on length: `1` is contained in `41`, and a short numeric fragment
 * would otherwise match half the book.
 */
function policyNumberAffinity(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  // Too short to identify anything. Not "no match" — *no signal*, which is a
  // different thing and must not count against the candidate.
  if (!da || !db || da.length < 5 || db.length < 5) return null;
  if (da === db) return 1;
  if (da.includes(db) || db.includes(da)) return 0.85;
  return 0;
}

/**
 * "Jenkins, Willie" and "Willie Jenkins" are one person.
 *
 * Compared as a sorted bag of words rather than a string, because a statement
 * prints surname-first as often as not and an edit-distance comparison of the
 * two orderings scores about as low as two unrelated people.
 */
function nameAffinity(a: string | null, b: string | null): number | null {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return null;
  if (na === nb) return 1;

  const bag = (s: string) => s.split(" ").filter(Boolean).sort().join(" ");
  const ba = bag(na);
  const bb = bag(nb);
  if (ba === bb) return 1;

  // Every word of the shorter name present in the longer one — a middle name
  // or a suffix on one side only.
  const wa = new Set(ba.split(" "));
  const wb = new Set(bb.split(" "));
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (small.size >= 2 && [...small].every((w) => large.has(w))) return 0.95;

  return similarity(ba, bb);
}

/**
 * Does the amount look like commission on this policy?
 *
 * Compared against the *expected* commission when we have one, and not at all
 * when we do not — a first-year commission is a large multiple of a modal
 * premium and a renewal is a small one, so the premium alone cannot confirm an
 * amount. It can only fail to contradict it, which is why the no-expectation
 * case returns a neutral 0 rather than a positive score.
 *
 * Magnitudes are compared, not signed values, and that is the point rather
 * than a shortcut: a chargeback is the expected commission coming back, so
 * −$1,890 against an expected $1,890 is evidence *for* this being the policy,
 * not against it. Signing the comparison would make every chargeback look like
 * the wrong policy — which is the opposite of what reconciliation is for.
 */
function amountAffinity(paid: number, c: MatchCandidate): number | null {
  if (c.expected === null) return null;
  const paidAbs = Math.abs(paid);
  const expAbs = Math.abs(c.expected);
  if (expAbs === 0) return null;
  const ratio = Math.min(paidAbs, expAbs) / Math.max(paidAbs, expAbs);
  if (ratio >= 0.995) return 1;
  if (ratio >= 0.9) return 0.7;
  if (ratio >= 0.6) return 0.3;
  return 0;
}

/**
 * Commission is paid in the months after a policy takes effect, never before.
 *
 * A payment dated before the effective date is evidence *against* the match and
 * scores negative — that is the signal that stops a name-only match attaching a
 * July payment to a policy written in September.
 */
function dateAffinity(paidDate: string | null, effective: string | null): number | null {
  if (!paidDate || !effective) return null;
  const paid = Date.parse(paidDate);
  const eff = Date.parse(effective);
  if (Number.isNaN(paid) || Number.isNaN(eff)) return null;

  const days = (paid - eff) / 86_400_000;
  if (days < -31) return -1;      // paid before written: wrong policy
  if (days < 0) return 0;         // within a month either way, ledgers do this
  if (days <= 120) return 1;      // first-year commission window
  if (days <= 550) return 0.5;    // renewal
  return 0.2;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

/**
 * How much each signal is worth *relative to the others present*.
 *
 * The name carries the most because it is the only field a human reconciler
 * treats as identifying. But the weights are renormalised over the signals that
 * actually apply, and that is the load-bearing part: a missing signal must not
 * drag the score down, or a statement line with no insured name — which is
 * every adjustment line on every statement — could never clear the floor no
 * matter how exactly its policy number and amount matched.
 *
 * The first version of this scored a bare-number match with an exact amount and
 * an in-window date at 0.55, one thousandth under its own floor, purely because
 * the name column was empty.
 */
const WEIGHTS = { policy: 0.35, name: 0.4, amount: 0.15, date: 0.1 };

export function scoreCandidate(line: MatchLine, c: MatchCandidate): MatchSuggestion | null {
  const policy = policyNumberAffinity(line.policyNumber, c.policyNumber);
  const name = nameAffinity(line.insuredName, c.insuredName);
  const amount = amountAffinity(line.paidAmount, c);
  const date = dateAffinity(line.paidDate, c.effectiveDate);

  // A payment dated well before the policy existed disqualifies it outright,
  // however well the name reads. Two clients share a name far more often than
  // a carrier pays a commission on a policy that had not been written.
  if (date !== null && date < 0) return null;

  // Something has to identify the policy. An amount and a date alone describe
  // half the book, and a suggestion built on them is a coincidence with a
  // percentage next to it.
  const identified = (policy !== null && policy > 0) || (name !== null && name >= 0.6);
  if (!identified) return null;

  const parts: [number | null, number][] = [
    [policy, WEIGHTS.policy], [name, WEIGHTS.name],
    [amount, WEIGHTS.amount], [date, WEIGHTS.date],
  ];
  let score = 0;
  let total = 0;
  for (const [value, weight] of parts) {
    if (value === null) continue;
    score += value * weight;
    total += weight;
  }
  if (total === 0) return null;
  const confidence = score / total;

  if (confidence < SUGGEST_FLOOR) return null;

  const reasons: string[] = [];
  if (policy === 1) reasons.push("Policy number matches once punctuation is ignored");
  else if (policy !== null && policy > 0) reasons.push(`Policy number ${c.policyNumber} contains the number on the statement`);
  if (name === 1) reasons.push("Insured name matches");
  else if (name !== null && name >= 0.9) reasons.push(`Insured name is close to ${c.insuredName}`);
  else if (name !== null && name >= 0.6) reasons.push(`Insured name resembles ${c.insuredName}`);
  if (amount !== null && amount >= 0.995) reasons.push("Amount is what we expected on this policy");
  else if (amount !== null && amount >= 0.7) reasons.push("Amount is within 10% of what we expected");
  if (date === 1) reasons.push("Paid inside the first-year commission window");
  else if (date === 0.5) reasons.push("Paid in the renewal window");

  const variance = c.expected === null ? null : Math.round((line.paidAmount - c.expected) * 100) / 100;

  return { lineId: line.lineId, policyId: c.policyId, confidence, reasons, expected: c.expected, variance };
}

/**
 * The best suggestions for one line, best first.
 *
 * Capped at three. A person deciding between three candidates is choosing; a
 * person deciding between eleven is being asked to do the work themselves.
 */
export function suggestForLine(
  line: MatchLine,
  candidates: MatchCandidate[],
  limit = 3,
): MatchSuggestion[] {
  return candidates
    .map((c) => scoreCandidate(line, c))
    .filter((s): s is MatchSuggestion => s !== null)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

/**
 * Suggestions across a whole statement.
 *
 * A policy that is the top suggestion for two different lines keeps both — a
 * carrier really does pay twice against one policy in a month (an advance and a
 * chargeback, or two modal payments), and silently dropping the second would
 * hide the case most worth looking at. Deduplication here would be the system
 * deciding something it cannot know.
 */
export function suggestForStatement(
  lines: MatchLine[],
  candidates: MatchCandidate[],
): Record<string, MatchSuggestion[]> {
  const out: Record<string, MatchSuggestion[]> = {};
  for (const line of lines) {
    const s = suggestForLine(line, candidates);
    if (s.length) out[line.lineId] = s;
  }
  return out;
}

/** Would the UI pre-tick this one? */
export function isStrong(s: MatchSuggestion): boolean {
  return s.confidence >= STRONG_MATCH;
}
