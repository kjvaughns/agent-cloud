/**
 * What each kind of person needs to do first.
 *
 * One config, four roles. The alternative — a checklist component per role —
 * is how you end up with an agent being told to "set carrier commission
 * levels" because somebody copied the owner's list and edited half of it.
 *
 * ── Two rules this file exists to enforce ───────────────────────────────────
 *
 * **Completion is derived, never recorded.** Every step names a `completion`
 * key that the server resolves from real data. "Invite an agent" is done when
 * the org has more than one member — not when somebody clicked the button. So
 * the list self-completes for a person who did the thing on their own, which
 * is the correct behaviour and the main reason to build this rather than buy
 * it. A stored "step 3 complete" flag is a lie waiting to happen.
 *
 * **Never show somebody a house that is already built.** An invited agent
 * joins an organization that has carriers, a comp grid and forty policies
 * already. Telling them to "add your agency's carriers" is the most common
 * role-onboarding bug there is, and it makes the product look like it has not
 * noticed where they are. Steps carry `agencySetup: true` when they are about
 * standing an agency up, and the server drops those for anyone who did not
 * create it.
 *
 * This file is deliberately pure — no imports, no queries — so
 * `scripts/onboarding-check.ts` can assert things about it without a database.
 */

export type ChecklistRole = "owner" | "manager" | "staff" | "agent";

/**
 * The completion signals the server knows how to resolve. Keeping this a
 * closed union means a step cannot name a query that does not exist — the
 * failure mode would be a step that can never be completed, which is exactly
 * the bug that made `agent_completion()` cap every agent at 80%.
 */
export type CompletionKey =
  | "org_created"
  | "profile_complete"
  | "carriers_added"
  | "comp_grid_set"
  | "team_invited"
  | "book_imported"
  | "first_real_deal"
  | "first_client"
  | "downline_reviewed"
  | "task_assigned"
  | "contracting_queue_seen"
  | "writing_number_added"
  | "document_reviewed"
  | "agent_carriers_claimed"
  | "agency_branded"
  | "agency_contacts_set"
  | "billing_active"
  | "welcome_written"
  | "mfa_enabled";

export type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  roles: ChecklistRole[];
  completion: CompletionKey;
  ctaRoute: string;
  ctaLabel: string;
  /** Standing the agency up. Hidden from anyone who joined an existing one. */
  agencySetup?: boolean;
  /** Optional guided tour, launched from this item and nowhere else. */
  tourId?: string;
  /**
   * The server cannot answer this one — MFA factor state lives in the auth
   * session, not in a table. The widget overlays the real value.
   */
  clientResolved?: boolean;
};

/**
 * The first item every role sees is already done.
 *
 * Not decoration. An empty progress bar reads as "here is a pile of work";
 * one that starts at 1 of 5 reads as "you are already going", and people
 * finish lists they have started far more often than lists they have not.
 * It is also true — the account does exist — so it costs no honesty to say so.
 */
export const CHECKLIST: ChecklistItem[] = [
  {
    id: "account_created",
    label: "Your workspace is live",
    description: "Signed in and ready. Everything below takes about ten minutes.",
    roles: ["owner", "manager", "staff", "agent"],
    completion: "org_created",
    ctaRoute: "/dashboard",
    ctaLabel: "Open the dashboard",
  },

  // ── Owner: stand the agency up ────────────────────────────────────────────
  {
    id: "add_carriers",
    label: "Add the carriers you write",
    description: "Your agency's real carriers drive every dropdown in the product.",
    roles: ["owner"],
    completion: "carriers_added",
    // Carrier Setup, not the read-only reference directory — the directory's
    // own add dialog was a second write path and is gone.
    ctaRoute: "/settings/carriers",
    ctaLabel: "Add carriers",
    agencySetup: true,
    tourId: "carriers",
  },
  {
    id: "set_comp_grid",
    label: "Set your commission levels",
    description: "What each level pays. Commissions are computed from this, so it is worth getting right once.",
    roles: ["owner"],
    completion: "comp_grid_set",
    ctaRoute: "/settings/comp-grids",
    ctaLabel: "Set levels",
    agencySetup: true,
  },
  {
    id: "invite_first_agent",
    label: "Invite your first producer",
    description: "The invite link carries their carriers and levels, so they start in the right place.",
    roles: ["owner"],
    completion: "team_invited",
    ctaRoute: "/contracting/invite",
    ctaLabel: "Send an invite",
    agencySetup: true,
  },
  {
    id: "brand_agency",
    label: "Name your agency",
    description: "Agency name, subdomain and logo, so the workspace looks like yours.",
    roles: ["owner"],
    completion: "agency_branded",
    ctaRoute: "/settings/agency",
    ctaLabel: "Open agency settings",
    agencySetup: true,
  },
  {
    id: "agency_contacts",
    label: "Add operational contacts",
    description: "Where agency alerts and support replies should go.",
    roles: ["owner"],
    completion: "agency_contacts_set",
    // Was /admin/settings in the old checklist — the platform super-admin
    // route, which most agency owners cannot even open. This is the page that
    // actually holds their contacts.
    ctaRoute: "/settings/agency",
    ctaLabel: "Set contacts",
    agencySetup: true,
  },
  {
    id: "welcome_message",
    label: "Write a welcome message",
    description: "The first thing a new agent reads when they sign in.",
    roles: ["owner"],
    completion: "welcome_written",
    ctaRoute: "/settings/agency",
    ctaLabel: "Write it",
    agencySetup: true,
  },
  {
    id: "activate_billing",
    label: "Activate your subscription",
    description: "So your team keeps full access when the trial ends.",
    roles: ["owner"],
    completion: "billing_active",
    ctaRoute: "/settings/billing",
    ctaLabel: "Open billing",
    agencySetup: true,
  },
  {
    id: "enable_mfa",
    label: "Turn on two-factor authentication",
    description: "Your account can reach every client record in the agency.",
    roles: ["owner", "manager", "staff"],
    completion: "mfa_enabled",
    ctaRoute: "/settings/security",
    ctaLabel: "Turn it on",
    clientResolved: true,
  },
  {
    id: "import_book",
    label: "Bring your book across",
    description: "A spreadsheet of clients and policies gets read, matched and shown to you before anything saves.",
    roles: ["owner"],
    completion: "book_imported",
    ctaRoute: "/import",
    ctaLabel: "Import a file",
    tourId: "import",
  },

  // ── Manager ───────────────────────────────────────────────────────────────
  {
    id: "manager_profile",
    label: "Finish your profile",
    description: "Name, NPN and contact details. Carriers ask for all three.",
    roles: ["manager", "agent", "staff"],
    completion: "profile_complete",
    ctaRoute: "/account/producer-profile",
    ctaLabel: "Open your profile",
  },
  {
    id: "review_downline",
    label: "Look at your team",
    description: "Who is ready to sell, who is stuck in contracting, and who has not logged in.",
    roles: ["manager"],
    completion: "downline_reviewed",
    ctaRoute: "/team",
    ctaLabel: "Open the team page",
    tourId: "team",
  },
  {
    id: "assign_first_task",
    label: "Assign a task",
    description: "Follow-ups that live somewhere other than your head.",
    roles: ["manager"],
    completion: "task_assigned",
    ctaRoute: "/tasks",
    ctaLabel: "Create a task",
  },

  // ── Staff: the back office ────────────────────────────────────────────────
  {
    id: "review_contracting_queue",
    label: "Open today's work",
    description: "Every contracting request waiting on somebody, oldest first.",
    roles: ["staff"],
    completion: "contracting_queue_seen",
    ctaRoute: "/contracting-ops/queue",
    ctaLabel: "Open the queue",
    tourId: "contracting-ops",
  },
  {
    id: "add_writing_number",
    label: "Record a writing number",
    description: "Every application needs one. Keeping them here stops the digging through email.",
    roles: ["staff"],
    completion: "writing_number_added",
    ctaRoute: "/contracting-ops/requests?tab=numbers",
    ctaLabel: "Add a number",
  },
  {
    id: "approve_first_document",
    label: "Review a document",
    description: "E&O and AML certificates, checked against what each carrier asks for.",
    roles: ["staff"],
    completion: "document_reviewed",
    ctaRoute: "/contracting-ops/documents",
    ctaLabel: "Open document review",
  },

  // ── Agent ─────────────────────────────────────────────────────────────────
  {
    id: "agent_carriers",
    label: "Say which carriers you have",
    description: "So your dropdowns show your contracts rather than a catalogue.",
    roles: ["agent"],
    completion: "agent_carriers_claimed",
    ctaRoute: "/contracting",
    ctaLabel: "Pick your carriers",
  },
  {
    id: "add_first_client",
    label: "Add your first client",
    description: "Or import a list. The pipeline is where the rest of the product starts.",
    roles: ["agent"],
    completion: "first_client",
    ctaRoute: "/pipeline",
    ctaLabel: "Add a client",
    tourId: "pipeline",
  },

  // ── Everyone who sells ────────────────────────────────────────────────────
  {
    id: "post_first_deal",
    label: "Post your first deal",
    description: "Check the commission lands where you expect before you trust the numbers.",
    roles: ["owner", "manager", "agent"],
    completion: "first_real_deal",
    ctaRoute: "/post-deal",
    ctaLabel: "Post a deal",
  },
];

/**
 * The list for one person.
 *
 * `joinedExistingOrg` drops the agency-setup steps. It is passed in rather
 * than inferred here so this stays pure and the server owns the one question
 * that needs the database: did this person create this agency, or arrive at it.
 */
export function checklistFor(
  role: ChecklistRole,
  opts: { joinedExistingOrg: boolean } = { joinedExistingOrg: false },
): ChecklistItem[] {
  return CHECKLIST.filter(
    (item) =>
      item.roles.includes(role) && !(opts.joinedExistingOrg && item.agencySetup),
  );
}

/** Every completion key the given role can actually be asked about. */
export function completionKeysFor(role: ChecklistRole): CompletionKey[] {
  return Array.from(new Set(checklistFor(role).map((i) => i.completion)));
}
