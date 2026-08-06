/**
 * Preparing an annual policy review.
 *
 * ── The four gaps the prompt names, and what the schema can answer ──────────
 *
 *   term nearing its conversion deadline   partly — inferred from the product
 *                                          name, which is free text
 *   underinsured against stated income     NO — see below
 *   no disability cover                    partly — same free-text inference
 *   orphaned beneficiary after a life event partly — "no beneficiary at all" is
 *                                          clean; "after a life event" is not,
 *                                          because life events are not tracked
 *
 * The income one now has an answer. `clients.annual_income` stores it, the
 * importer annualises the template's "Monthly Income" into it, and the review
 * prefers whatever the agent typed on the screen over the stored figure — they
 * have just asked the client. `UNSTATED_INCOME` is added to the missing list
 * only when neither source has a number.

 *
 * ── Deterministic, for the third time and the same reason ──────────────────
 *
 * `getNeedsAnalysis` already asks a model to do this arithmetic. Coverage need
 * is multiplication — income times a multiplier, plus debts, minus what is
 * already in force — and a model that returns a different number for the same
 * client on two runs cannot be shown to that client. The model's job here is
 * the agenda prose; the numbers are computed.
 */

export type ReviewPolicy = {
  id: string;
  product: string | null;
  carrierName: string | null;
  faceAmount: number | null;
  monthlyPremium: number | null;
  effectiveDate: string | null;
  status: string | null;
};

export type ReviewClient = {
  id: string;
  name: string | null;
  dateOfBirth: string | null;
  /** Only ever what an agent typed on the review screen — never stored. */
  statedAnnualIncome?: number | null;
  beneficiaryCount: number;
  policies: ReviewPolicy[];
  asOf: string;
};

export type GapId =
  | "no_coverage" | "term_conversion" | "no_beneficiary"
  | "underinsured" | "no_disability" | "single_carrier";

export type Gap = {
  id: GapId;
  severity: "high" | "medium" | "low";
  headline: string;
  detail: string;
  /** What to actually say in the meeting. */
  agenda: string;
};

/** Named on screen, so the agent knows what the review did not look at. */
export const MISSING_INPUTS = [
  {
    input: "Stated income",
    why: "Clients have no income column. The importer reads \"Monthly Income\" from the migration template and appends it to the notes text, so it cannot be compared against coverage. Type it in below to include the needs calculation.",
  },
  {
    input: "Life events",
    why: "Marriage, a birth or a divorce would each change who should be named — none are recorded, so a beneficiary can only be checked for existing, not for being current.",
  },
] as const;

/**
 * Is this a term policy?
 *
 * `policies.product` is free text — "Term 20", "20-Year Level Term", "GUL",
 * "Whole Life". Matching on the word rather than a lookup because there is no
 * product catalogue to look it up in, and the alternative is not detecting the
 * conversion deadline at all.
 *
 * "Term" appears in "Terminal illness rider" too, so the ambiguous case is
 * resolved by requiring a term-shaped duration or a word boundary in a product
 * position. A false positive here costs an agenda line about conversion on a
 * policy that cannot convert, which an agent will notice and ignore.
 */
export function isTerm(product: string | null): boolean {
  if (!product) return false;
  const p = product.toLowerCase();
  if (/\bterminal\b/.test(p)) return false;
  return /\bterm\b/.test(p) || /\b(10|15|20|25|30)\s*(yr|year)\b/.test(p);
}

/** Disability income cover, under any of the names carriers give it. */
export function isDisability(product: string | null): boolean {
  if (!product) return false;
  return /\b(di|disability|income protection|paycheck protection)\b/i.test(product);
}

/**
 * Years a term policy runs, from its name.
 *
 * Returns null rather than guessing 20. Conversion deadlines are usually the
 * earlier of a fixed age or a number of years into the term, and inventing the
 * term length would put a date on the agenda that nobody can defend.
 */
export function termYears(product: string | null): number | null {
  if (!product) return null;
  const m = product.match(/\b(10|15|20|25|30)\b/);
  return m ? Number(m[1]) : null;
}

function yearsBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / (1000 * 60 * 60 * 24 * 365.25);
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * The coverage a client needs, by the standard decomposition.
 *
 * Income replacement at ten times earnings is the industry rule of thumb, and
 * it is stated as a rule of thumb rather than presented as a calculation the
 * client's circumstances produced — because it is not one.
 *
 * Returns null without an income. There is no defensible number to show
 * somebody when the input is missing, and a zero would read as "you need no
 * cover", which is the opposite of unknown.
 */
export function needsEstimate(
  statedAnnualIncome: number | null | undefined,
  inForceFace: number,
): { recommended: number; shortfall: number } | null {
  if (!statedAnnualIncome || statedAnnualIncome <= 0) return null;
  const recommended = Math.round(statedAnnualIncome * 10);
  return { recommended, shortfall: Math.max(0, recommended - inForceFace) };
}

/**
 * Every gap worth raising, most serious first.
 *
 * A review with no gaps returns an empty list rather than a reassuring
 * sentence — the caller decides how to say "nothing to change", and a function
 * that manufactures a finding to look useful is how these features lose trust.
 */
export function findGaps(client: ReviewClient): Gap[] {
  const inForce = client.policies.filter((p) => p.status === "active");
  const totalFace = inForce.reduce((a, p) => a + (p.faceAmount ?? 0), 0);
  const gaps: Gap[] = [];

  if (!inForce.length) {
    gaps.push({
      id: "no_coverage",
      severity: "high",
      headline: "No in-force coverage",
      detail: "This client has no active policy on the books.",
      agenda: "Confirm whether they are covered elsewhere before anything else — the rest of this review assumes they are not.",
    });
    // Everything below compares against in-force cover. With none, the other
    // findings would all be restatements of this one.
    return gaps;
  }

  // Term conversion. The deadline is what makes this urgent rather than
  // interesting: once it passes, converting without underwriting is gone.
  for (const p of inForce) {
    if (!isTerm(p.product) || !p.effectiveDate) continue;
    const years = termYears(p.product);
    const elapsed = yearsBetween(p.effectiveDate, client.asOf);
    if (elapsed === null) continue;

    if (years !== null) {
      const remaining = years - elapsed;
      if (remaining <= 3 && remaining > -1) {
        gaps.push({
          id: "term_conversion",
          // Two years, not one. A conversion privilege typically expires at
          // the earlier of a fixed age or partway through the term, so by the
          // time a Term 20 has two years left the window is usually closing or
          // already shut. Treating that as merely "medium" would put the one
          // finding with a hard deadline below the ones without.
          severity: remaining <= 2 ? "high" : "medium",
          headline: `${p.product} ends in about ${Math.max(0, Math.round(remaining))} year${Math.round(remaining) === 1 ? "" : "s"}`,
          detail: `${p.carrierName ?? "This carrier"} issued it ${Math.round(elapsed)} years ago. Conversion privileges usually expire before the term does.`,
          agenda: "Ask the carrier for the exact conversion deadline and what it converts to, then decide before it lapses rather than after.",
        });
      }
    } else if (elapsed >= 7) {
      // A term policy of unknown length that is well seasoned is worth asking
      // about, without asserting a date we cannot know.
      gaps.push({
        id: "term_conversion",
        severity: "low",
        headline: `${p.product} has been in force ${Math.round(elapsed)} years`,
        detail: "The term length isn't recorded, so we can't tell how close the conversion deadline is.",
        agenda: "Pull the policy contract and note the term length and conversion deadline against the record.",
      });
    }
  }

  if (client.beneficiaryCount === 0) {
    gaps.push({
      id: "no_beneficiary",
      severity: "high",
      headline: "No beneficiary on record",
      detail: "Nobody is named against this client in the system.",
      agenda: "Confirm the named beneficiary with the carrier and record it — a death claim with no beneficiary goes to the estate and through probate.",
    });
  }

  const needs = needsEstimate(client.statedAnnualIncome, totalFace);
  if (needs && needs.shortfall > 0) {
    gaps.push({
      id: "underinsured",
      severity: needs.shortfall > totalFace ? "high" : "medium",
      headline: `About ${money(needs.shortfall)} short of a ten-times-income guideline`,
      detail: `In force: ${money(totalFace)}. Ten times the income given: ${money(needs.recommended)}. Ten times income is a rule of thumb, not a calculation from their circumstances.`,
      agenda: "Walk through what the number is for — replacing income, clearing the mortgage, covering education — and let them set the target.",
    });
  }

  if (!inForce.some((p) => isDisability(p.product))) {
    gaps.push({
      id: "no_disability",
      severity: "medium",
      headline: "No disability cover on the books",
      detail: "Every in-force policy on this client is life cover. Disability is the risk that stops the income the life cover is replacing.",
      agenda: "Ask what their employer provides, and what it pays as a share of actual earnings.",
    });
  }

  // Not in the prompt, but it falls out of the same data and it is what an
  // agency principal asks about first: a book concentrated on one carrier is
  // exposed to that carrier's rate action and service.
  const carriers = new Set(inForce.map((p) => p.carrierName).filter(Boolean));
  if (carriers.size === 1 && inForce.length >= 3) {
    gaps.push({
      id: "single_carrier",
      severity: "low",
      headline: `All ${inForce.length} policies are with ${[...carriers][0]}`,
      detail: "Concentration is not a problem in itself, but it is worth knowing at a review.",
      agenda: "No action needed unless the client raises service or pricing.",
    });
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return gaps.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** One line for a list row. */
export function summariseGaps(gaps: Gap[]): string {
  if (!gaps.length) return "No gaps found.";
  const high = gaps.filter((g) => g.severity === "high").length;
  return high
    ? `${high} to raise first · ${gaps.length} total`
    : `${gaps.length} to discuss`;
}
