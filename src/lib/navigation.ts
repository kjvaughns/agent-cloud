import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, BookOpen, Bot, Building2, Calendar, ClipboardList, Contact,
  FilePlus, FileSignature, Heart, IdCard, KanbanSquare, LayoutDashboard, LifeBuoy,
  ListTodo, Mail, Megaphone, Newspaper, Percent, Phone, Settings, ShieldCheck,
  Palette, Sparkles, Target, Trophy, UploadCloud, UserPlus, Users, Wallet,
} from "lucide-react";

/**
 * Where everything lives, once.
 *
 * Two things read this file:
 *
 *   navFor()       the sidebar — the few pages this person works in daily
 *   reachableFor() the command palette — everything this person may open
 *
 * That split is the whole idea. A solo agent sees five things in the sidebar,
 * but can still reach anything they have permission for by searching. Hiding
 * without a way back is how a product ends up feeling smaller and also worse.
 *
 * Adding a page means adding one entry here. If it does not appear in anyone's
 * sidebar, that is a legitimate answer — most pages should not.
 */

/** Who a page is for. A page with no audience listed is for everyone. */
export type Audience = "solo" | "agent" | "manager" | "staff" | "owner";

export type Page = {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Grouping in the command palette. */
  area: string;
  /** Who may reach it at all. Omit for everyone. */
  audience?: Audience[];
  /** Extra gate on top of audience, checked against role_permissions. */
  permission?: string;
  /**
   * The hub this page belongs under. Used when somebody stars it: the
   * favourite nests beneath its hub in the sidebar rather than floating loose,
   * so starring "Invite an agent" makes Agency expandable rather than adding
   * an unrelated top-level entry.
   */
  parent?: string;
};

// ── The registry ────────────────────────────────────────────────────────────

export const PAGES: Page[] = [
  // Everyday
  { id: "dashboard", label: "Home", path: "/dashboard", icon: LayoutDashboard, area: "Everyday" },
  { id: "clients", label: "Clients", path: "/clients", icon: Contact, area: "Everyday" },
  { id: "pipeline", label: "Pipeline", path: "/pipeline", icon: KanbanSquare, area: "Everyday", parent: "clients" },
  { id: "book", label: "Book of Business", path: "/book-of-business", icon: BookOpen, area: "Everyday", parent: "clients" },
  // Filed under Clients, not Agency: a policy about to lapse is a client
  // problem you work the same day you work the pipeline, not an HR one.
  { id: "retention", label: "Retention", path: "/retention", icon: Heart, area: "Everyday", audience: ["owner", "manager", "staff"], parent: "clients" },
  { id: "post-deal", label: "Post a Deal", path: "/post-deal", icon: FilePlus, area: "Everyday" },
  { id: "finances", label: "Money", path: "/finances", icon: Wallet, area: "Everyday" },
  { id: "tasks", label: "Tasks", path: "/tasks", icon: ListTodo, area: "Everyday" },
  { id: "nova", label: "Nova", path: "/ai-assistant", icon: Sparkles, area: "Everyday" },

  // Agency
  { id: "agency", label: "Agency", path: "/agency", icon: Building2, area: "Agency", audience: ["owner"] },
  { id: "team", label: "Team", path: "/team", icon: Users, area: "Agency", audience: ["owner", "manager"] },
  { id: "intake", label: "Document Intake", path: "/intake", icon: UploadCloud, area: "Contracting", audience: ["owner", "staff"], parent: "contracting-ops" },
  { id: "leaderboard", label: "Leaderboard", path: "/leaderboard", icon: Trophy, area: "Agency", audience: ["owner", "manager", "agent"], parent: "agency" },
  { id: "challenges", label: "Challenges", path: "/challenges", icon: Target, area: "Agency", audience: ["owner", "manager", "agent"], parent: "agency" },
  { id: "invite", label: "Invite an agent", path: "/contracting/invite", icon: UserPlus, area: "Agency", audience: ["owner", "manager"], parent: "agency" },
  { id: "onboarding", label: "Getting agents ready", path: "/onboarding", icon: UserPlus, area: "Agency", audience: ["owner", "manager", "staff"], parent: "agency" },
  // Guides, scripts and the academy. Filed under Agency because keeping agents
  // able to sell is the agency's job, and it is the one thing in this hub that
  // is for them to read rather than for you to act on.
  { id: "resources", label: "Resources", path: "/resources/new-agent-guide", icon: BookOpen, area: "Agency", parent: "agency" },

  // Contracting
  { id: "contracting-ops", label: "Contracting", path: "/contracting-ops", icon: ClipboardList, area: "Contracting", audience: ["owner", "staff", "manager"] },
  { id: "queue", label: "Today's Work", path: "/contracting-ops/queue", icon: ListTodo, area: "Contracting", audience: ["staff", "owner"], parent: "contracting-ops" },
  { id: "requests", label: "Contract Requests", path: "/contracting-ops/requests", icon: FileSignature, area: "Contracting", audience: ["owner", "staff", "manager"], parent: "contracting-ops" },
  { id: "ready", label: "Ready to Sell", path: "/contracting-ops/ready-to-sell", icon: IdCard, area: "Contracting", audience: ["owner", "staff", "manager"], parent: "contracting-ops" },
  // One Licensing entry for everyone. The page routes you to your own licences
  // or to the agency roster, whichever is your job.
  { id: "licensing", label: "Licensing", path: "/licensing", icon: FileSignature, area: "Contracting" },
  { id: "documents", label: "Documents", path: "/contracting-ops/documents", icon: UploadCloud, area: "Contracting", audience: ["owner", "staff"], parent: "contracting-ops" },
  // Not a second Carriers page: this is which carriers the agency uses and how
  // each one takes a submission. The directory below is the reference one.
  { id: "carriers-setup", label: "Carrier Setup", path: "/contracting-ops/carriers", icon: Building2, area: "Contracting", audience: ["owner", "staff"], parent: "contracting-ops" },
  { id: "comp", label: "Compensation", path: "/contracting-ops/compensation", icon: Percent, area: "Contracting", audience: ["owner", "staff"], parent: "contracting-ops" },
  { id: "writing-numbers", label: "Writing Numbers", path: "/contracting-ops/writing-numbers", icon: IdCard, area: "Contracting", audience: ["owner", "staff"], parent: "contracting-ops" },
  { id: "hierarchies", label: "Hierarchies", path: "/contracting-ops/hierarchies", icon: Users, area: "Contracting", audience: ["owner", "staff"], parent: "contracting-ops" },
  { id: "hierarchy-changes", label: "Hierarchy Changes", path: "/contracting-ops/hierarchy-changes", icon: Users, area: "Contracting", audience: ["owner", "staff", "manager"], parent: "contracting-ops" },
  { id: "my-contracts", label: "My Contracts", path: "/contracting", icon: FileSignature, area: "Contracting" },
  { id: "carriers", label: "Carriers", path: "/contracting/carriers", icon: Building2, area: "Contracting" },

  // Reporting — one page. Analytics redirects here.
  { id: "reports", label: "Reports", path: "/reports", icon: BarChart3, area: "Reporting", audience: ["owner", "manager"] },

  // Tools
  { id: "phone", label: "Phone", path: "/phone", icon: Phone, area: "Tools", audience: ["solo", "agent", "manager", "owner"] },
  { id: "calendar", label: "Calendar", path: "/calendar", icon: Calendar, area: "Tools" },
  { id: "leads", label: "Leads", path: "/tools/leads", icon: Target, area: "Tools", audience: ["solo", "agent", "manager", "owner"] },

  // Updates
  { id: "notifications", label: "Notifications", path: "/notifications", icon: Megaphone, area: "Updates" },
  { id: "announcements", label: "Announcements", path: "/announcements", icon: Megaphone, area: "Updates" },
  { id: "news", label: "News Feed", path: "/news-feed", icon: Newspaper, area: "Updates" },

  // Learning
  { id: "academy", label: "Agent Academy", path: "/resources/agent-academy", icon: BookOpen, area: "Learning" },
  { id: "scripts", label: "Scripts", path: "/resources/scripts", icon: BookOpen, area: "Learning" },

  // Settings — agency configuration lives here, not in the Agency hub. That
  // hub is about people; this is about how the workspace is set up.
  { id: "settings", label: "Settings", path: "/settings", icon: Settings, area: "Settings" },
  { id: "agency-roles", label: "Roles & permissions", path: "/settings/roles", icon: ShieldCheck, area: "Settings", audience: ["owner"], parent: "settings" },
  { id: "agency-settings", label: "Agency settings", path: "/settings/agency", icon: Settings, area: "Settings", audience: ["owner"], parent: "settings" },
  { id: "agency-automations", label: "Automations", path: "/settings/automations", icon: Bot, area: "Settings", audience: ["owner"], parent: "settings" },
  { id: "agency-emails", label: "Emails", path: "/settings/emails", icon: Mail, area: "Settings", audience: ["owner"], parent: "settings" },
  { id: "agency-usage", label: "What people use", path: "/settings/usage", icon: Activity, area: "Settings", audience: ["owner"], parent: "settings" },
  { id: "billing", label: "Billing", path: "/settings/billing", icon: Wallet, area: "Settings", parent: "settings" },
  { id: "notif-settings", label: "Notification settings", path: "/settings/notifications", icon: Megaphone, area: "Settings", parent: "settings" },
  { id: "security", label: "Security", path: "/settings/security", icon: ShieldCheck, area: "Settings", parent: "settings" },
  { id: "nova-pro", label: "Nova Pro", path: "/settings/nova-pro", icon: Sparkles, area: "Settings", parent: "settings" },
  { id: "white-label", label: "White label", path: "/settings/white-label", icon: Palette, area: "Settings", audience: ["owner"], parent: "settings" },
  { id: "support-desk", label: "Support desk", path: "/settings/support", icon: LifeBuoy, area: "Settings", audience: ["owner"], parent: "settings" },
  { id: "integrations", label: "Integrations", path: "/settings/integrations", icon: Bot, area: "Settings", audience: ["owner"], parent: "settings" },
  { id: "profile", label: "Producer Profile", path: "/account/producer-profile", icon: IdCard, area: "Account" },
  { id: "help", label: "Help", path: "/account/help", icon: LifeBuoy, area: "Account" },
  { id: "landing", label: "My Landing Page", path: "/account/my-landing-page", icon: Contact, area: "Account" },
];

const BY_ID = new Map(PAGES.map((p) => [p.id, p]));
const page = (id: string) => BY_ID.get(id)!;

// ── The three products ──────────────────────────────────────────────────────

export type NavGroup = { label: string; items: Page[] };

/**
 * Each audience gets its own short list, composed from the registry rather
 * than filtered out of one shared menu. Filtering is what leaves a solo agent
 * looking at the shape of the agency product with holes in it.
 */
const PRODUCTS: Record<Audience, { label: string; ids: string[] }[]> = {
  // Sell. Retain. Get paid.
  solo: [
    { label: "", ids: ["dashboard", "clients", "finances", "nova"] },
  ],

  // Same job, inside somebody's agency. Resources is here because a new agent
  // needs the guides and the scripts more than anybody, and having to search
  // for them is how they end up never being read.
  agent: [
    { label: "", ids: ["dashboard", "clients", "finances", "nova"] },
    { label: "Me", ids: ["my-contracts", "tasks", "resources"] },
  ],

  // Queues, not scoreboards.
  staff: [
    { label: "", ids: ["queue", "requests", "licensing", "documents", "tasks"] },
    { label: "", ids: ["nova"] },
  ],

  // A team to run. Clients sits above Team for the same reason it sits above
  // Agency for an owner: a manager still sells, and the day starts with their
  // own pipeline before it gets to anybody else's.
  manager: [
    { label: "", ids: ["dashboard", "clients", "team", "contracting-ops", "reports", "nova"] },
  ],

  // The whole agency — but their own clients first. Running the agency is the
  // job you do after the selling, not instead of it.
  owner: [
    { label: "", ids: ["dashboard", "clients", "agency", "contracting-ops", "reports", "nova"] },
  ],
};

/** Which product someone gets. Plan decides first, then role. */
export function audienceFor(opts: {
  role: string | null;
  isSolo: boolean;
  isOwner: boolean;
  canManage: boolean;
}): Audience {
  if (opts.isSolo) return "solo";
  if (opts.isOwner || opts.canManage) return "owner";
  if (opts.role === "manager") return "manager";
  if (opts.role === "staff") return "staff";
  return "agent";
}

function allowed(p: Page, audience: Audience, perms: Record<string, unknown>): boolean {
  if (p.audience && !p.audience.includes(audience)) return false;
  if (p.permission && !perms[p.permission]) return false;
  return true;
}

/** The sidebar: a short list, in the order this person works. */
export function navFor(audience: Audience, perms: Record<string, unknown> = {}): NavGroup[] {
  return PRODUCTS[audience]
    .map((g) => ({
      label: g.label,
      items: g.ids.map(page).filter((p) => allowed(p, audience, perms)),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * The command palette: everything this person may open, including the pages
 * their sidebar deliberately leaves out. This is what makes a small sidebar
 * safe rather than restrictive.
 */
export function reachableFor(audience: Audience, perms: Record<string, unknown> = {}): Page[] {
  return PAGES.filter((p) => allowed(p, audience, perms));
}

/** The handful of things worth a shortcut on any screen. */
export const ACCOUNT_PAGES = ["settings", "profile", "help"].map(page);

// ── Hubs ────────────────────────────────────────────────────────────────────

/**
 * What sits inside each hub.
 *
 * These used to be a second vertical rail rendered beside the page, which put
 * two sidebars side by side on a desktop and squeezed the content between
 * them. The destinations are the same; they hang off the sidebar entry now,
 * so there is one navigation column and the page gets its width back.
 *
 * The group labels survive because they are what makes fourteen contracting
 * destinations readable rather than a list to scan.
 */
export type HubGroup = { label: string; ids: string[] };

const HUBS: Record<string, HubGroup[]> = {
  // One person, three stages: someone you are working, someone you sold, and
  // someone about to leave. Three unrelated sidebar rows before this, which
  // made them read as three unrelated jobs.
  clients: [
    { label: "", ids: ["pipeline", "book", "retention"] },
  ],
  agency: [
    { label: "Your people", ids: ["team", "onboarding", "invite"] },
    { label: "How they're doing", ids: ["leaderboard", "challenges"] },
    { label: "Support them", ids: ["resources"] },
  ],
  "contracting-ops": [
    { label: "Work", ids: ["requests", "queue", "hierarchy-changes", "intake"] },
    { label: "Producers", ids: ["ready", "licensing", "documents"] },
    { label: "Carriers & pay", ids: ["carriers-setup", "comp", "writing-numbers", "hierarchies"] },
  ],
  settings: [
    { label: "You", ids: ["billing", "notif-settings", "security", "nova-pro"] },
    { label: "Your agency", ids: ["agency-settings", "agency-roles", "agency-automations", "agency-emails", "white-label"] },
    { label: "Support", ids: ["support-desk", "integrations", "agency-usage"] },
  ],
};

export function isHub(id: string): boolean {
  return id in HUBS;
}

/** The pages inside a hub that this person may actually open. */
export function hubGroupsFor(
  hubId: string,
  audience: Audience,
  perms: Record<string, unknown> = {},
): { label: string; items: Page[] }[] {
  return (HUBS[hubId] ?? [])
    .map((g) => ({
      label: g.label,
      items: g.ids.map((id) => BY_ID.get(id)).filter(
        (p): p is Page => Boolean(p) && allowed(p as Page, audience, perms),
      ),
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
  audience: Audience,
  perms: Record<string, unknown> = {},
): Favorites {
  const under: Record<string, Page[]> = {};
  const loose: Page[] = [];

  for (const id of pageIds) {
    const p = BY_ID.get(id);
    // Permission is re-checked here: a favourite must never become a way to
    // keep reaching something your role no longer allows.
    if (!p || !allowed(p, audience, perms)) continue;
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
