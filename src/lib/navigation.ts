import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, BookOpen, Bot, Building2, Calculator, Calendar, ClipboardList,
  Contact, FilePlus, FileSignature, Heart, IdCard, KanbanSquare, LayoutDashboard,
  LifeBuoy, ListTodo, Mail, Megaphone, Newspaper, Percent, Phone, Settings,
  ShieldCheck, Palette, Sparkles, Target, Trophy, UploadCloud, UserPlus, Users, Wallet,
  Wrench,
} from "lucide-react";

/**
 * Where everything lives, once.
 *
 * Two things read this file:
 *
 *   navFor()       the sidebar — the few pages this person works in daily
 *   reachableFor() the command palette — everything this person may open
 *
 * That split is the whole idea. Somebody selling on their own sees eight
 * things in the sidebar, but can still reach anything they have permission for
 * by searching. Hiding without a way back is how a product ends up feeling
 * smaller and also worse.
 *
 * ── One app, not three ─────────────────────────────────────────────────────
 *
 * There used to be five sidebars — solo, agent, manager, owner, staff — and
 * being promoted swapped you into a different one. Everyone selling now learns
 * the same app, and growth adds to it rather than replacing it:
 *
 *   an agency owner   gains a section. Nothing else moves.
 *   a manager         gains nothing. They get a Mine / Team toggle on the
 *                     pages they already know — same navigation, more data.
 *
 * Staff are the one deliberate exception. They work a queue rather than a
 * book, so a Pipeline and a Book of Business would be permanently empty for
 * them, and the queue is the thing they open first every morning.
 */

/** Who a page is for. A page with no audience listed is for everyone. */
export type Audience = "core" | "staff";

/** What has to be true of the workspace before a page appears at all. */
export type Unlock =
  /** Anyone in an agency — i.e. the plan is not solo. */
  | "agency-member"
  /** Someone who administers the agency: the owner, or an admin. */
  | "agency-admin";

export type Page = {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Grouping in the command palette. */
  area: string;
  /** Who may reach it at all. Omit for everyone. */
  audience?: Audience[];
  /**
   * Gates. When more than one is present, **any** of them passing is enough —
   * so "Invite an agent" can be reachable by an agency admin *or* by a manager
   * who has been given onboarding rights, without needing to be both.
   */
  unlock?: Unlock;
  permission?: string;
  /** A gate that applies only to back-office staff, checked against role_permissions. */
  staffPermission?: string;
  /**
   * The hub this page hangs under. Used for nesting in the sidebar and when
   * somebody stars it, so a favourite sits beneath its section rather than
   * floating loose at the top level.
   */
  parent?: string;
};

// ── The registry ────────────────────────────────────────────────────────────

export const PAGES: Page[] = [
  // Home — where the day starts.
  { id: "dashboard", label: "Home", path: "/dashboard", icon: LayoutDashboard, area: "Home" },
  { id: "notifications", label: "Notifications", path: "/notifications", icon: Megaphone, area: "Home", parent: "dashboard" },
  { id: "tasks", label: "Tasks", path: "/tasks", icon: ListTodo, area: "Home", parent: "dashboard" },
  // Filed under Home, not Agency: these are what an agent gains by being in an
  // agency, and the Agency section is only for the people who administer one.
  // Put here they reach everybody in the agency, which was the point of them.
  { id: "leaderboard", label: "Leaderboard", path: "/leaderboard", icon: Trophy, area: "Home", parent: "dashboard", unlock: "agency-member" },
  { id: "challenges", label: "Challenges", path: "/challenges", icon: Target, area: "Home", parent: "dashboard", unlock: "agency-member" },

  // Clients — everyone you are working, sold, or about to lose.
  { id: "clients", label: "Clients", path: "/clients", icon: Contact, area: "Clients", staffPermission: "staff_view_clients" },
  { id: "pipeline", label: "Pipeline", path: "/pipeline", icon: KanbanSquare, area: "Clients", parent: "clients", staffPermission: "staff_view_clients" },
  { id: "calendar", label: "Calendar", path: "/calendar", icon: Calendar, area: "Clients", parent: "clients" },
  { id: "book", label: "Book of Business", path: "/book-of-business", icon: BookOpen, area: "Clients", parent: "clients", staffPermission: "staff_view_policies" },
  { id: "retention", label: "Retention", path: "/retention", icon: Heart, area: "Clients", parent: "clients", staffPermission: "staff_view_policies" },

  // Contracting — becoming and staying appointed, and what it pays.
  { id: "my-contracts", label: "Contracting", path: "/contracting", icon: FileSignature, area: "Contracting", staffPermission: "staff_view_contracts" },
  { id: "my-writing-numbers", label: "Writing Numbers", path: "/contracting/writing-numbers", icon: IdCard, area: "Contracting", parent: "my-contracts" },
  { id: "carriers", label: "Carrier Directory", path: "/contracting/carriers", icon: Building2, area: "Contracting", parent: "my-contracts" },
  { id: "my-comp-levels", label: "Commission Levels", path: "/contracting/commission-levels", icon: Percent, area: "Contracting", parent: "my-contracts" },
  // Filed here rather than on its own: as an agent, your money is carrier
  // money — advances, overrides and renewals, all attached to a contract.
  { id: "finances", label: "Finances", path: "/finances", icon: Wallet, area: "Contracting", parent: "my-contracts", staffPermission: "staff_view_commissions" },
  { id: "post-deal", label: "Post a Deal", path: "/post-deal", icon: FilePlus, area: "Contracting", staffPermission: "staff_post_policies" },

  // Reports — one page. How wide it looks is the scope toggle's job, not a
  // permission's, which is why the old manager gate is gone.
  { id: "reports", label: "Reports", path: "/reports", icon: BarChart3, area: "Reports", staffPermission: "staff_view_analytics" },

  // Resources — everything to learn and improve.
  { id: "resources", label: "Resources", path: "/resources/new-agent-guide", icon: BookOpen, area: "Resources" },
  { id: "licensing", label: "State Licenses", path: "/licensing", icon: FileSignature, area: "Resources", parent: "resources" },
  { id: "scripts", label: "Scripts", path: "/resources/scripts", icon: BookOpen, area: "Resources", parent: "resources" },
  { id: "academy", label: "Academy", path: "/resources/agent-academy", icon: BookOpen, area: "Resources", parent: "resources" },
  { id: "handbook", label: "Handbook", path: "/resources/agent-handbook", icon: BookOpen, area: "Resources", parent: "resources" },

  // Tools — the utility drawer.
  { id: "tools", label: "Tools", path: "/tools/quoter", icon: Wrench, area: "Tools" },
  { id: "quoter", label: "Quoter", path: "/tools/quoter", icon: Calculator, area: "Tools", parent: "tools" },
  { id: "marketing", label: "Marketing", path: "/back-office/client-marketing", icon: Megaphone, area: "Tools", parent: "tools" },
  { id: "phone", label: "Phone", path: "/phone", icon: Phone, area: "Tools", parent: "tools", audience: ["core"] },

  { id: "nova", label: "Nova", path: "/ai-assistant", icon: Sparkles, area: "Nova", staffPermission: "staff_nova_pro_enabled" },

  // ── Agency ───────────────────────────────────────────────────────────────
  // Appears when the workspace is an agency and you administer it. Everything
  // agency-related lives here, which is why Billing and the workspace
  // configuration moved out of Settings.
  { id: "agency", label: "Agency", path: "/agency", icon: Building2, area: "Agency", unlock: "agency-admin" },

  { id: "team", label: "Team", path: "/team", icon: Users, area: "Agency", parent: "agency", unlock: "agency-admin" },
  // Reachable by an agency admin OR a manager given onboarding rights — the
  // one place where two different people arrive by two different routes.
  { id: "invite", label: "Invite an agent", path: "/contracting/invite", icon: UserPlus, area: "Agency", parent: "agency", unlock: "agency-admin", permission: "mgr_manage_onboarding" },
  { id: "onboarding", label: "Getting agents ready", path: "/onboarding", icon: UserPlus, area: "Agency", parent: "agency", unlock: "agency-admin" },
  { id: "recruiting", label: "Recruiting", path: "/back-office/recruiting-funnels", icon: Target, area: "Agency", parent: "agency", unlock: "agency-admin", permission: "mgr_access_recruiting" },

  { id: "contracting-ops", label: "Contracting Ops", path: "/contracting-ops", icon: ClipboardList, area: "Agency", parent: "agency", unlock: "agency-admin", audience: ["core"] },
  { id: "intake", label: "Document Intake", path: "/intake", icon: UploadCloud, area: "Agency", parent: "agency", unlock: "agency-admin", staffPermission: "staff_is_admin" },

  { id: "agency-settings", label: "Agency settings", path: "/settings/agency", icon: Settings, area: "Agency", parent: "agency", unlock: "agency-admin" },
  { id: "agency-roles", label: "Roles & permissions", path: "/settings/roles", icon: ShieldCheck, area: "Agency", parent: "agency", unlock: "agency-admin" },
  { id: "agency-automations", label: "Automations", path: "/settings/automations", icon: Bot, area: "Agency", parent: "agency", unlock: "agency-admin" },
  { id: "agency-emails", label: "Emails", path: "/settings/emails", icon: Mail, area: "Agency", parent: "agency", unlock: "agency-admin" },
  { id: "white-label", label: "White label", path: "/settings/white-label", icon: Palette, area: "Agency", parent: "agency", unlock: "agency-admin" },
  { id: "integrations", label: "Integrations", path: "/settings/integrations", icon: Bot, area: "Agency", parent: "agency", unlock: "agency-admin" },

  { id: "billing", label: "Billing", path: "/settings/billing", icon: Wallet, area: "Agency", parent: "agency" },
  { id: "support-desk", label: "Support desk", path: "/settings/support", icon: LifeBuoy, area: "Agency", parent: "agency", unlock: "agency-admin" },
  { id: "agency-usage", label: "What people use", path: "/settings/usage", icon: Activity, area: "Agency", parent: "agency", unlock: "agency-admin" },

  // ── Back office — staff's own product ────────────────────────────────────
  { id: "queue", label: "Today's Work", path: "/contracting-ops/queue", icon: ListTodo, area: "Back office", audience: ["staff"] },
  { id: "requests", label: "Contract Requests", path: "/contracting-ops/requests", icon: FileSignature, area: "Back office", staffPermission: "staff_view_contracts", permission: "staff_is_admin" },
  { id: "documents", label: "Documents", path: "/contracting-ops/documents", icon: UploadCloud, area: "Back office", staffPermission: "staff_view_contracts", permission: "staff_is_admin" },
  { id: "ready", label: "Ready to Sell", path: "/contracting-ops/ready-to-sell", icon: IdCard, area: "Back office", parent: "contracting-ops" },
  { id: "carriers-setup", label: "Carrier Setup", path: "/contracting-ops/carriers", icon: Building2, area: "Back office", parent: "contracting-ops" },
  { id: "comp", label: "Compensation", path: "/contracting-ops/compensation", icon: Percent, area: "Back office", parent: "contracting-ops" },
  { id: "writing-numbers", label: "Writing Numbers", path: "/contracting-ops/writing-numbers", icon: IdCard, area: "Back office", parent: "contracting-ops" },
  { id: "hierarchies", label: "Hierarchies", path: "/contracting-ops/hierarchies", icon: Users, area: "Back office", parent: "contracting-ops" },
  { id: "hierarchy-changes", label: "Hierarchy Changes", path: "/contracting-ops/hierarchy-changes", icon: Users, area: "Back office", parent: "contracting-ops" },

  // Updates
  { id: "announcements", label: "Announcements", path: "/announcements", icon: Megaphone, area: "Updates" },
  { id: "news", label: "News Feed", path: "/news-feed", icon: Newspaper, area: "Updates" },

  // ── Personal ─────────────────────────────────────────────────────────────
  // Settings is yours alone now. Anything that configures the workspace is in
  // Agency, above.
  { id: "settings", label: "Settings", path: "/settings", icon: Settings, area: "Settings" },
  { id: "notif-settings", label: "Notification settings", path: "/settings/notifications", icon: Megaphone, area: "Settings", parent: "settings" },
  { id: "security", label: "Security", path: "/settings/security", icon: ShieldCheck, area: "Settings", parent: "settings" },
  { id: "nova-pro", label: "Nova Pro", path: "/settings/nova-pro", icon: Sparkles, area: "Settings", parent: "settings", staffPermission: "staff_nova_pro_enabled" },
  { id: "profile", label: "Producer Profile", path: "/account/producer-profile", icon: IdCard, area: "Account" },
  { id: "help", label: "Help", path: "/account/help", icon: LifeBuoy, area: "Account" },
  { id: "landing", label: "My Landing Page", path: "/account/my-landing-page", icon: Contact, area: "Account" },
];

const BY_ID = new Map(PAGES.map((p) => [p.id, p]));
const page = (id: string) => BY_ID.get(id)!;

// ── The two products ────────────────────────────────────────────────────────

export type NavGroup = { label: string; items: Page[] };

/**
 * Two lists, not five.
 *
 * `core` is the same for a solo agent, an agent inside an agency, a manager
 * and an owner. What differs is whether the Agency section is there at all,
 * and how wide each page's scope toggle goes — never the shape of the app.
 */
const PRODUCTS: Record<Audience, { label: string; ids: string[] }[]> = {
  core: [
    {
      label: "",
      ids: [
        "dashboard", "clients", "my-contracts", "reports",
        "resources", "tools", "nova", "agency",
      ],
    },
  ],

  // Queues, not scoreboards.
  staff: [
    { label: "", ids: ["queue", "requests", "licensing", "documents", "tasks", "nova", "agency"] },
  ],
};

/** Everything the gates need to know about this person. */
export type NavContext = {
  audience: Audience;
  /** Their organisation is on a paid team plan rather than solo. */
  inAgency: boolean;
  /** …and they administer it. */
  canSeeAgency: boolean;
  perms: Record<string, unknown>;
};

/**
 * Which product someone gets. Only two answers now, and the plan no longer
 * decides — a solo agent and an agency agent learn the same app; the solo one
 * simply has no Agency section in it.
 */
export function audienceFor(opts: { role: string | null }): Audience {
  return opts.role === "staff" ? "staff" : "core";
}

function allowed(p: Page, ctx: NavContext): boolean {
  if (p.audience && !p.audience.includes(ctx.audience)) return false;

  // Staff permissions gate staff only. Applying them to everybody would hide
  // Nova from an owner who has never had a role_permissions row written.
  if (ctx.audience === "staff" && p.staffPermission && !ctx.perms[p.staffPermission]) return false;

  // Any gate passing is enough. Most pages have one; the exceptions are the
  // ones two different kinds of person legitimately reach.
  const gates: boolean[] = [];
  if (p.unlock === "agency-member") gates.push(ctx.inAgency);
  if (p.unlock === "agency-admin") gates.push(ctx.canSeeAgency);
  if (p.permission) gates.push(Boolean(ctx.perms[p.permission]));
  if (gates.length > 0 && !gates.some(Boolean)) return false;

  return true;
}

/** The sidebar: a short list, in the order this person works. */
export function navFor(ctx: NavContext): NavGroup[] {
  return PRODUCTS[ctx.audience]
    .map((g) => ({
      label: g.label,
      items: g.ids.map(page).filter((p) => allowed(p, ctx)),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * The command palette: everything this person may open, including the pages
 * their sidebar deliberately leaves out. This is what makes a small sidebar
 * safe rather than restrictive.
 */
export function reachableFor(ctx: NavContext): Page[] {
  return PAGES.filter((p) => allowed(p, ctx));
}

/** The handful of things worth a shortcut on any screen. */
export const ACCOUNT_PAGES = ["settings", "profile", "help"].map(page);

// ── Hubs ────────────────────────────────────────────────────────────────────

/**
 * What sits inside each section.
 *
 * These hang off the sidebar entry rather than opening a second vertical rail
 * beside the page. The group labels survive because they are what makes
 * sixteen agency destinations readable rather than a list to scan.
 */
export type HubGroup = { label: string; ids: string[] };

const HUBS: Record<string, HubGroup[]> = {
  dashboard: [
    { label: "", ids: ["notifications", "tasks", "leaderboard", "challenges"] },
  ],
  clients: [
    { label: "", ids: ["pipeline", "calendar", "book", "retention"] },
  ],
  "my-contracts": [
    { label: "", ids: ["my-writing-numbers", "carriers", "my-comp-levels", "finances"] },
  ],
  resources: [
    { label: "", ids: ["licensing", "scripts", "academy", "handbook"] },
  ],
  tools: [
    { label: "", ids: ["quoter", "marketing", "phone"] },
  ],
  agency: [
    { label: "Your people", ids: ["team", "invite", "onboarding", "recruiting"] },
    { label: "Operations", ids: ["contracting-ops", "intake"] },
    { label: "Setup", ids: ["agency-settings", "agency-roles", "agency-automations", "agency-emails", "white-label", "integrations"] },
    { label: "Money & support", ids: ["billing", "support-desk", "agency-usage"] },
  ],
  "contracting-ops": [
    { label: "Work", ids: ["requests", "queue", "hierarchy-changes", "intake"] },
    { label: "Producers", ids: ["ready", "licensing", "documents"] },
    { label: "Carriers & pay", ids: ["carriers-setup", "comp", "writing-numbers", "hierarchies"] },
  ],
  settings: [
    { label: "", ids: ["notif-settings", "security", "nova-pro"] },
  ],
};

export function isHub(id: string): boolean {
  return id in HUBS;
}

/** The pages inside a hub that this person may actually open. */
export function hubGroupsFor(hubId: string, ctx: NavContext): { label: string; items: Page[] }[] {
  return (HUBS[hubId] ?? [])
    .map((g) => ({
      label: g.label,
      items: g.ids
        .map((id) => BY_ID.get(id))
        .filter((p): p is Page => Boolean(p) && allowed(p as Page, ctx)),
    }))
    .filter((g) => g.items.length > 0);
}

/** Every page inside a hub, flattened — used to avoid listing one twice. */
export function hubChildIds(hubId: string): Set<string> {
  return new Set((HUBS[hubId] ?? []).flatMap((g) => g.ids));
}

/** Which hub, if any, a path belongs to. Longest match wins. */
export function hubForPath(path: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const hubId of Object.keys(HUBS)) {
    const candidates = [hubId, ...hubChildIds(hubId)];
    for (const id of candidates) {
      const p = BY_ID.get(id);
      if (!p) continue;
      const matches = path === p.path || path.startsWith(p.path + "/");
      if (matches && (!best || p.path.length > best.len)) best = { id: hubId, len: p.path.length };
    }
  }
  return best?.id ?? null;
}

/** Look a page up by id, or by the path currently in the address bar. */
export function pageById(id: string): Page | undefined {
  return BY_ID.get(id);
}

export function pageByPath(path: string): Page | undefined {
  // Exact match first; otherwise the longest registered prefix, so a detail
  // route still resolves to the page it belongs to.
  const exact = PAGES.find((p) => p.path === path);
  if (exact) return exact;
  return PAGES
    .filter((p) => p.path !== "/" && path.startsWith(p.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

export type Favorites = {
  /** Starred pages that hang off a sidebar entry, keyed by that entry's id. */
  under: Record<string, Page[]>;
  /** Starred pages with no sidebar entry to hang off. */
  loose: Page[];
};

/**
 * Arrange starred pages for the sidebar.
 *
 * A favourite whose hub is already in the sidebar nests under it, so starring
 * "Invite an agent" makes Agency expandable rather than adding a stray
 * top-level row. Everything else collects in one Starred group.
 *
 * Ids that no longer resolve — a page renamed or retired — are dropped rather
 * than rendered as a dead entry. Favourites outliving their page is expected,
 * not exceptional.
 */
export function arrangeFavorites(
  pageIds: string[],
  sidebarIds: Set<string>,
  ctx: NavContext,
): Favorites {
  const under: Record<string, Page[]> = {};
  const loose: Page[] = [];

  for (const id of pageIds) {
    const p = BY_ID.get(id);
    // Permission is re-checked here: a favourite must never become a way to
    // keep reaching something your role no longer allows.
    if (!p || !allowed(p, ctx)) continue;
    // A page already in the sidebar does not need a second copy of itself.
    if (sidebarIds.has(p.id)) continue;
    // Nor does one the hub above it already lists — the hub marks it starred
    // in place instead of repeating it.
    if (p.parent && isHub(p.parent) && sidebarIds.has(p.parent)) continue;

    if (p.parent && sidebarIds.has(p.parent)) {
      (under[p.parent] ??= []).push(p);
    } else {
      loose.push(p);
    }
  }

  return { under, loose };
}
