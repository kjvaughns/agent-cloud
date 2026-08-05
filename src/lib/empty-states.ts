/**
 * The words each empty list says, in one place.
 *
 * Scattered across twelve routes this drifts within a month — one page
 * apologises, one makes a joke, one says "No records found." Here it can be
 * read end to end and kept in one voice, and `scripts/onboarding-check.ts`
 * can hold it to the rules below.
 *
 * ── The rules, restated so they are checkable ───────────────────────────────
 *
 * - The title states an outcome, not the absence of one. "Your book of
 *   business lives here", never "No policies".
 * - Two sentences of body, maximum.
 * - The CTA starts with a verb.
 * - No apology, no "Oops", no "yet" doing the work of an explanation.
 * - The ghost row is a plausible record, not lorem ipsum — it is there to
 *   demonstrate the schema, so `7841102` teaches and `XXXXXXX` does not.
 *
 * Ghost rows deliberately reuse the demo agency's cast — Marcus Webb, Mutual
 * of Omaha, the same carriers `demo-seed.server.ts` writes. Somebody who turns
 * on sample data then clears it should not meet a different fictional agency
 * on the way out.
 */

export type EmptyCopy = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaRoute?: string;
  /** Shown behind the copy, dimmed and aria-hidden. */
  ghost: string[][];
  /** What it says once somebody has cleared the list themselves. */
  clearedTitle: string;
  clearedBody: string;
};

export const EMPTY_STATES = {
  pipeline: {
    title: "Your pipeline starts here",
    body: "Every lead, from first call to sold, on one board you can drag. Add one and the rest of the product follows it.",
    ctaLabel: "Add your first client",
    ctaRoute: "/pipeline",
    ghost: [
      ["Gloria Delgado", "Houston, TX", "Age 67", "Warm"],
      ["Ernest Boudreaux", "Tulsa, OK", "Age 71", "Hot"],
    ],
    clearedTitle: "Nothing left in this stage",
    clearedBody: "Everything here has moved on. Drag a card back if that was not what you meant.",
  },

  clients: {
    title: "Your clients live here",
    body: "Names, households, policies and every note anybody took. One record per person, not one per policy.",
    ctaLabel: "Add a client",
    ctaRoute: "/pipeline",
    ghost: [
      ["Gloria Delgado", "(713) 555-0148", "2 policies", "Last opened 3d ago"],
      ["Willie Jenkins", "(918) 555-0132", "1 policy", "Last opened 11d ago"],
    ],
    clearedTitle: "No clients match",
    clearedBody: "Nothing fits the filters you have set. Clear them to see the whole book.",
  },

  "book-of-business": {
    title: "Your book of business",
    body: "Every policy you have written, what it pays, and which ones are about to lapse. Import a spreadsheet or post a deal to start it.",
    ctaLabel: "Import your book",
    ctaRoute: "/import",
    ghost: [
      ["Delgado, Gloria", "Mutual of Omaha", "Final Expense", "MUT-4820193", "Active"],
      ["Jenkins, Willie", "Americo", "Mortgage Protection", "AME-7719044", "Lapse pending"],
    ],
    clearedTitle: "No policies match",
    clearedBody: "Nothing fits the filters you have set. Clear them to see the whole book.",
  },

  policies: {
    title: "Policies for this client",
    body: "Post a deal and it appears here with its commission schedule already worked out.",
    ctaLabel: "Post a deal",
    ctaRoute: "/post-deal",
    ghost: [["Mutual of Omaha", "Final Expense", "$14,000", "$62/mo", "Active"]],
    clearedTitle: "No policies left on this client",
    clearedBody: "Every policy has been removed or moved to another record.",
  },

  commissions: {
    title: "Commissions land here",
    body: "Advances, renewals and chargebacks, computed from your comp grid so you can check one against the other.",
    ctaLabel: "Post a deal",
    ctaRoute: "/post-deal",
    ghost: [
      ["Delgado, Gloria", "Mutual of Omaha", "Advance", "$558.00", "Paid"],
      ["Jenkins, Willie", "Americo", "Advance", "$392.00", "Pending"],
    ],
    clearedTitle: "Nothing in this period",
    clearedBody: "No commission rows fall inside the dates you picked.",
  },

  tasks: {
    title: "Follow-ups that are not in your head",
    body: "Anything with a due date and a name on it. Overdue rises to the top on its own.",
    ctaLabel: "Create a task",
    ctaRoute: "/tasks",
    ghost: [
      ["Call Willie Jenkins about the lapse notice", "Today", "Urgent"],
      ["Chase Foresters on Tanya's transfer", "Overdue by 3d", "High"],
    ],
    clearedTitle: "Nothing due",
    clearedBody: "No open tasks match this filter. That is usually good news.",
  },

  contracts: {
    title: "Your carrier contracts",
    body: "Which carriers you are appointed with, at what level, and what is still in flight.",
    ctaLabel: "Request a contract",
    ctaRoute: "/contracting",
    ghost: [
      ["Mutual of Omaha", "Senior Agent 90", "Active", "Writing #7841102"],
      ["Foresters", "Agent 80", "Submitted 6d ago", "—"],
    ],
    clearedTitle: "No contracts match",
    clearedBody: "Nothing fits the filters you have set.",
  },

  "contracting-requests": {
    title: "Contracting work in one queue",
    body: "Every request waiting on somebody, oldest first, with what is blocking it. Nothing has to be chased through email.",
    ctaLabel: "Start a request",
    ctaRoute: "/contracting-ops/requests",
    ghost: [
      ["Tanya Bright", "Foresters", "Missing documents", "Due in 4d"],
      ["Priya Raman", "Americo", "Submitted", "Overdue by 5d"],
    ],
    clearedTitle: "Queue is clear",
    clearedBody: "Nothing is waiting on anybody right now.",
  },

  "writing-numbers": {
    title: "Your carrier writing numbers live here",
    body: "Every application needs one. Keeping them in one place stops anybody digging through email for it.",
    ctaLabel: "Add a writing number",
    ctaRoute: "/contracting-ops/requests?tab=numbers",
    ghost: [
      ["Marcus Webb", "Mutual of Omaha", "7841102", "Issued Mar 2026"],
      ["Denise Okafor", "Americo", "AM-559104", "Issued Jan 2026"],
    ],
    clearedTitle: "No writing numbers match",
    clearedBody: "Nothing fits the filters you have set.",
  },

  documents: {
    title: "Documents waiting on review",
    body: "E&O and AML certificates, checked against what each carrier asks for. Approve or reject, and the agent's readiness updates.",
    ctaLabel: "Open producer profiles",
    ctaRoute: "/contracting-ops/licensing",
    ghost: [
      ["Priya Raman", "AML certificate", "LIMRA", "Uploaded 2d ago"],
      ["Curtis Nolan", "E&O certificate", "NAPA", "Expires in 21d"],
    ],
    clearedTitle: "Nothing to review",
    clearedBody: "Every document that has been uploaded has already been looked at.",
  },

  hierarchy: {
    title: "Your downline, drawn out",
    body: "Who reports to whom, and where the override on each sale goes. It builds itself as you invite people.",
    ctaLabel: "Invite a producer",
    ctaRoute: "/contracting/invite",
    ghost: [
      ["Denise Okafor", "Manager 105", "4 direct", "Reports to you"],
      ["Tanya Bright", "Senior Agent 90", "0 direct", "Reports to Denise"],
    ],
    clearedTitle: "Nobody below you yet",
    clearedBody: "Your downline is empty. Invites are what fill it.",
  },

  leaderboard: {
    title: "The leaderboard fills as deals post",
    body: "Ranked by premium written, with last month alongside so the number means something.",
    ctaLabel: "Post a deal",
    ctaRoute: "/post-deal",
    ghost: [
      ["1", "Tanya Bright", "$18,400 ALP", "12 policies"],
      ["2", "Curtis Nolan", "$14,100 ALP", "9 policies"],
    ],
    clearedTitle: "Nothing in this period",
    clearedBody: "No deals were posted inside the dates you picked.",
  },
} as const satisfies Record<string, EmptyCopy>;

export type EmptyStateKey = keyof typeof EMPTY_STATES;

/** Ghost rows in the shape the component wants. */
export function ghostFor(key: EmptyStateKey) {
  return EMPTY_STATES[key].ghost.map((cells) => ({ cells: [...cells] }));
}
