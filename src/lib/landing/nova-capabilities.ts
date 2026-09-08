/**
 * What Nova does today, and what it does not.
 *
 * ── Why this is data in its own file ──
 *
 * These labels are the most consequential words on the marketing page. An
 * agency owner who buys the licence for "pipeline autopilot" and finds nothing
 * there does not come back, and in this market they tell people.
 *
 * Keeping them beside the JSX meant the only way to check them was a regular
 * expression over a component, which is how the first attempt at that check
 * passed while matching the wrong group entirely. As data they can be asserted
 * directly, and the assertion is worth having: `scripts/landing-check.ts`
 * requires every capability to carry a state, and requires the groups with no
 * code behind them to be marked `soon`.
 *
 * ── Where the states come from ──
 *
 * Read off the implementation, not the roadmap:
 *
 *   available   `lapse_scan`, `review_prep` and `compliance_screen` are the
 *               three gated features in `src/lib/nova-features.ts`. The
 *               automation worker sends on `birthday`, `policy_anniversary`,
 *               `lapse_follow_up` and `custom_date`
 *               (`src/lib/automation/nova-sends.server.ts`). `askAiAssistant`
 *               answers against records the asker may already see.
 *
 *   soon        Everything with no code behind it. An explicit "not yet"
 *               rather than a soft claim.
 *
 * When a capability ships, move it here and the page follows.
 */

export type CapabilityState = "available" | "soon";

export type Capability = { text: string; state: CapabilityState };

export type NovaGroup = {
  /** Matches the icon chosen in the component; kept out of the data. */
  key: "retention" | "relationships" | "pipeline" | "intelligence";
  title: string;
  blurb: string;
  items: Capability[];
};

export const NOVA_GROUPS: NovaGroup[] = [
  {
    key: "retention",
    title: "Retention autopilot",
    blurb: "The policies you are about to lose, before you lose them.",
    items: [
      { text: "Ranks your in-force book by lapse risk, with the reason for each", state: "available" },
      { text: "Follow-up when a policy goes into grace", state: "available" },
      { text: "Conservation tasks created from the scan, one per client", state: "available" },
      { text: "Missed drafts prioritised above everything else", state: "soon" },
      { text: "Retention outcomes tracked back to the action that saved them", state: "soon" },
    ],
  },
  {
    key: "relationships",
    title: "Client relationship automation",
    blurb: "The messages that keep a policy alive, sent without you remembering.",
    items: [
      { text: "Birthday messages", state: "available" },
      { text: "Policy anniversary messages", state: "available" },
      { text: "Any date you choose, on your own schedule", state: "available" },
      { text: "Annual policy review agendas, written from the client's book", state: "available" },
      { text: "Welcome sequences for a new client", state: "soon" },
      { text: "Draft-day reminders", state: "soon" },
      { text: "Re-engagement for clients who have gone quiet", state: "soon" },
    ],
  },
  {
    // Nothing in this group has code behind it. It is on the page because it
    // is genuinely coming and an owner deciding between products should know
    // it is planned — but every line says so.
    key: "pipeline",
    title: "Pipeline autopilot",
    blurb: "The follow-up you meant to do, on the leads you meant to call.",
    items: [
      { text: "Cold lead detection", state: "soon" },
      { text: "The recommended next action on a lead", state: "soon" },
      { text: "Follow-up tasks created for you", state: "soon" },
      { text: "Drafted messages you approve before they send", state: "soon" },
      { text: "Missed appointments surfaced", state: "soon" },
    ],
  },
  {
    key: "intelligence",
    title: "Daily agent intelligence",
    blurb: "Ask about your own book and get an answer, not a search result.",
    items: [
      { text: "Answers grounded in the records you are allowed to see", state: "available" },
      { text: "Compliance screening on AI-drafted client messages", state: "available" },
      { text: "A daily list of what needs doing", state: "soon" },
      { text: "Book of business summaries", state: "soon" },
      { text: "Plain-English explanations of how a commission was worked out", state: "soon" },
    ],
  },
];

/** Groups where nothing has shipped yet — every item must be marked `soon`. */
export const UNSHIPPED_GROUPS: NovaGroup["key"][] = ["pipeline"];
