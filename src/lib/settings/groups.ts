/**
 * Settings, in six groups.
 *
 * Every section already exists and every one is reachable. What did not exist
 * was any grouping: the sidebar listed nineteen entries in one flat run, so
 * "Levels & Positions", "Nova Pro" and "Security" sat at the same level as
 * each other and an owner looking for where compensation is configured had to
 * read all nineteen.
 *
 * The six names are the brief's. The mapping below is deliberately total —
 * every Settings entry belongs to exactly one group, and `groupOf` returns a
 * fallback rather than dropping an entry the day somebody adds one, because a
 * settings page that exists and is listed nowhere is worse than one filed
 * imperfectly.
 *
 * Pure, so the mapping can be checked against the navigation registry without
 * rendering anything.
 */

export const SETTINGS_GROUPS = [
  "Agency Profile",
  "Team and Access",
  "Contracting Setup",
  "Communications",
  "Integrations",
  "Billing",
] as const;

export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

/**
 * One line saying what each group is for, so the heading is not the only clue.
 */
export const GROUP_PURPOSE: Record<SettingsGroup, string> = {
  "Agency Profile": "Your agency's name, branding and how it appears to agents.",
  "Team and Access": "Who is in the agency, and what each of them may do.",
  "Contracting Setup": "Carriers, positions and what a deal pays. Start here.",
  Communications: "Notifications, emails and announcements.",
  Integrations: "Discord, automations and anything else connected to this workspace.",
  Billing: "Your subscription, usage and invoices.",
};

/**
 * Navigation id → group.
 *
 * Keyed on the `id` from `lib/navigation.ts` rather than the path, because a
 * path can carry a query string (`/settings/agency?tab=emails`) and two
 * entries can share one.
 */
export const GROUP_BY_NAV_ID: Record<string, SettingsGroup> = {
  // ── Agency Profile ──
  "agency-settings": "Agency Profile",
  "white-label": "Agency Profile",

  // ── Team and Access ──
  "agency-roles": "Team and Access",
  security: "Team and Access",
  "sub-agencies": "Team and Access",

  // ── Contracting Setup ──
  // The five screens the guided checklist walks through, in the order it
  // walks them.
  "carriers-setup": "Contracting Setup",
  "agency-levels": "Contracting Setup",
  "comp-grids-setup": "Contracting Setup",
  "contracting-settings": "Contracting Setup",
  "contracting-templates": "Contracting Setup",

  // ── Communications ──
  "notif-settings": "Communications",
  "agency-emails": "Communications",

  // ── Integrations ──
  integrations: "Integrations",
  "agency-automations": "Integrations",

  // ── Billing ──
  billing: "Billing",
  "nova-pro": "Billing",
  // Where an owner goes when something about their account is wrong, which in
  // practice is reached from the same place as the invoice.
  "support-desk": "Billing",
};

/**
 * The parent entry, which is the Settings section itself rather than a page
 * inside it. Excluded so it does not appear as an item within its own list.
 */
export const SETTINGS_PARENT_ID = "settings";

/**
 * Which group a settings entry belongs to.
 *
 * An unmapped entry falls to Agency Profile rather than vanishing. A settings
 * page that exists and is listed nowhere is a page nobody can find; one filed
 * under a slightly wrong heading is merely untidy.
 */
export function groupOf(navId: string): SettingsGroup {
  return GROUP_BY_NAV_ID[navId] ?? "Agency Profile";
}

export type GroupedEntry = { id: string; label: string; path: string };

/**
 * Arrange entries into the six groups, in the order above.
 *
 * A group with nothing in it — because every entry in it was hidden by
 * permissions — is dropped, so a staff member without billing rights does not
 * see an empty "Billing" heading.
 */
export function groupEntries<T extends GroupedEntry>(
  entries: T[],
): { group: SettingsGroup; purpose: string; entries: T[] }[] {
  const items = entries.filter((e) => e.id !== SETTINGS_PARENT_ID);
  return SETTINGS_GROUPS.map((group) => ({
    group,
    purpose: GROUP_PURPOSE[group],
    entries: items.filter((e) => groupOf(e.id) === group),
  })).filter((g) => g.entries.length > 0);
}
