import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpen, Bot, Building2, Calculator, Calendar, ClipboardList,
  Contact, FilePlus, FileSignature, Heart, IdCard, KanbanSquare, LayoutDashboard,
  LifeBuoy, ListTodo, Mail, Megaphone, Newspaper, Percent, Settings,
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

/** What has to be true before a page appears at all. */
export type Unlock =
  /** Anyone in an agency — i.e. the plan is not solo. */
  | "agency-member"
  /** Someone who administers the agency: the owner, or an admin. */
  | "agency-admin"
  /** Somebody has people under them. A team page with no team is a dead end. */
  | "has-downline"
  /**
   * A selling surface. Hidden while somebody is still becoming an agent —
   * they have no clients, no book and no commissions, so these pages can only
   * show them zero and ask them to wait.
   */
  | "activated"
  /**
   * Somebody whose job includes answering tickets. Not the same set as
   * "administers the agency": a client-services staffer or a manager the
   * owner has ticked "respond to support tickets" for works the queue
   * without touching billing or white label.
   */
  | "ticket-responder"
  /**
   * Somebody who maintains what the agency's agents read — the handbook,
   * the scripts, the academy. Same reasoning as ticket-responder: content
   * duty is a job, not an administrative rank.
   */
  | "resource-editor";

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
  /** Leaves the app. Rendered as an anchor, not a router link. */
  external?: boolean;
  /**
   * The hub this page hangs under. Used for nesting in the sidebar and when
   * somebody stars it, so a favourite sits beneath its section rather than
   * floating loose at the top level.
   */
  parent?: string;
};

// ── The registry ────────────────────────────────────────────────────────────

export const PAGES: Page[] = [
  // Home — where the day starts. Deliberately childless: a dashboard is a
  // destination, not a section, and hanging four pages off it made opening the
  // app feel like a decision.
  { id: "dashboard", label: "Home", path: "/dashboard", icon: LayoutDashboard, area: "Home" },

  // Reachable by search, absent from every sidebar. Notifications has the bell
  // in the top bar; the dashboard already surfaces overdue tasks and where you
  // stand. Nothing here is deleted — these simply stopped earning a row.
  { id: "notifications", label: "Notifications", path: "/notifications", icon: Megaphone, area: "Home" },
  { id: "tasks", label: "Tasks", path: "/tasks", icon: ListTodo, area: "Home" },
  { id: "challenges", label: "Challenges", path: "/challenges", icon: Target, area: "Home", unlock: "agency-member" },

  // Clients — everyone you are working, sold, or about to lose.
  { unlock: "activated", id: "clients", label: "Clients", path: "/clients", icon: Contact, area: "Clients", staffPermission: "staff_view_clients" },
  { unlock: "activated", id: "pipeline", label: "Pipeline", path: "/pipeline", icon: KanbanSquare, area: "Clients", parent: "clients", staffPermission: "staff_view_clients" },
  { unlock: "activated", id: "calendar", label: "Calendar", path: "/calendar", icon: Calendar, area: "Clients", parent: "clients" },
  { unlock: "activated", id: "book", label: "Book of Business", path: "/book-of-business", icon: BookOpen, area: "Clients", parent: "clients", staffPermission: "staff_view_policies" },
  { unlock: "activated", id: "retention", label: "Retention", path: "/retention", icon: Heart, area: "Clients", parent: "clients", staffPermission: "staff_view_policies" },

  // Contracting — becoming and staying appointed, and what it pays.
  // Post a Deal is deliberately NOT gated on being activated: posting the
  // first policy is one of the two things that ends the pending state, so
  // locking it would make that route impossible to walk.

  // Contracting — becoming and staying appointed.
  //
  // Writing numbers and commission levels are not pages here. They are columns
  // on a contract, and listMyContracts already returns both, so the Contracts
  // tab is the one place a contract's number and level live.
  { id: "my-contracts", label: "Contracting", path: "/contracting", icon: FileSignature, area: "Contracting", staffPermission: "staff_view_contracts" },
  { id: "contracts-list", label: "My Contracts", path: "/contracting", icon: FileSignature, area: "Contracting", parent: "my-contracts", staffPermission: "staff_view_contracts" },
  { id: "carriers", label: "Carrier Directory", path: "/contracting/carriers", icon: Building2, area: "Contracting", parent: "my-contracts" },
  { id: "comp-grids", label: "Comp Grids", path: "/contracting/commission-grids", icon: Percent, area: "Contracting", parent: "my-contracts" },
  { id: "post-deal", label: "Post a Deal", path: "/post-deal", icon: FilePlus, area: "Contracting", staffPermission: "staff_post_policies" },

  // Money is its own answer to its own question, not a footnote to a contract.
  { unlock: "activated", id: "finances", label: "Finances", path: "/finances", icon: Wallet, area: "Finances", staffPermission: "staff_view_commissions" },

  // Reports — one page. How wide it looks is the scope toggle's job, not a
  // permission's, which is why the old manager gate is gone.
  { unlock: "activated", id: "reports", label: "Reports", path: "/reports", icon: BarChart3, area: "Reports", staffPermission: "staff_view_analytics" },

  // Tools — the utility drawer.
  //
  // Resources is one entry, not a section. Its page already carries a tab bar
  // for the guide, the handbook, scripts, licensing and the academy, so
  // nesting those again in the sidebar was the same list said twice.
  { id: "tools", label: "Tools", path: "/resources/new-agent-guide", icon: Wrench, area: "Tools" },
  // No gate. Bringing your own book across is the first thing a new agent
  // wants to do and the last thing that should be behind a permission.
  { id: "import", label: "Import", path: "/import", icon: UploadCloud, area: "Tools", parent: "tools" },
  { id: "resources", label: "Resources", path: "/resources/new-agent-guide", icon: BookOpen, area: "Tools", parent: "tools" },
  { id: "quoter", label: "Quoter", path: "https://www.insurancetoolkits.com", icon: Calculator, area: "Tools", parent: "tools", external: true },
  { id: "marketing", label: "Marketing", path: "/back-office/client-marketing", icon: Megaphone, area: "Tools", parent: "tools" },

  // Reachable by search. The Resources page's own tabs are how you get to
  // these day to day.
  { id: "licensing", label: "State Licenses", path: "/licensing", icon: FileSignature, area: "Tools" },
  { id: "scripts", label: "Scripts", path: "/resources/scripts", icon: BookOpen, area: "Tools" },
  { id: "academy", label: "Academy", path: "/resources/agent-academy", icon: BookOpen, area: "Tools" },
  { id: "handbook", label: "Handbook", path: "/resources/agent-handbook", icon: BookOpen, area: "Tools" },

  { unlock: "activated", id: "nova", label: "Nova", path: "/ai-assistant", icon: Sparkles, area: "Nova", staffPermission: "staff_nova_pro_enabled" },

  // ── Agency ───────────────────────────────────────────────────────────────
  //
  // For an agent this is two questions: where do I stand, and who is under me.
  // It was sixteen destinations, nearly all of them workspace configuration,
  // and only visible to the people who administer one — so the leaderboard,
  // the one thing an agent gains by joining an agency, never reached them.
  //
  // Configuration went back to Settings. Agency is people.
  { id: "agency", label: "Agency", path: "/leaderboard", icon: Building2, area: "Agency", unlock: "agency-member" },

  { id: "leaderboard", label: "Leaderboard", path: "/leaderboard", icon: Trophy, area: "Agency", parent: "agency", unlock: "agency-member", audience: ["core"] },
  // The team command centre, which is the existing Team page. Gated on
  // actually having somebody under you: most agents do not, and a roster of
  // nobody is a page that can only disappoint.
  { id: "my-agents", label: "My Agents", path: "/team", icon: Users, area: "Agency", parent: "agency", unlock: "has-downline", audience: ["core"] },

  { id: "agency-overview", label: "Agency overview", path: "/agency", icon: Building2, area: "Agency", parent: "agency", unlock: "agency-admin" },
  { id: "team", label: "Team management", path: "/team", icon: Users, area: "Agency", parent: "agency", unlock: "agency-admin" },
  // Getting agents ready is a tab inside Team management now — it was a
  // roster with a progress bar sitting one section away from the roster.
  // Kept in the registry so search still finds it; it lands on the tab.
  { id: "onboarding", label: "Getting agents ready", path: "/team?tab=onboarding", icon: UserPlus, area: "Agency", unlock: "agency-admin" },
  { id: "recruiting", label: "Recruiting", path: "/back-office/recruiting-funnels", icon: Target, area: "Agency", parent: "agency", unlock: "agency-admin", permission: "mgr_access_recruiting" },
  // Document Intake was an agency-admin triage inbox that could classify a
  // carrier report and nothing else. It is Import now: a tool everybody has,
  // that reads a document and proposes what to do with it. Kept in the
  // registry so the old name still finds the new page.
  { id: "intake", label: "Document Intake", path: "/import", icon: UploadCloud, area: "Tools" },

  // Contracting Ops — the agency's back office. Two entries onto one page,
  // because the two audiences reach it for different reasons and under
  // different gates.
  //
  // `run-contracting` is the row an agency admin sees inside Contracting,
  // filed with the rest of contracting rather than with the people pages.
  // Unchanged from when it was called `contracting-ops`.
  { id: "run-contracting", label: "Contracting Ops", path: "/contracting-ops", icon: ClipboardList, area: "Contracting", parent: "my-contracts", unlock: "agency-admin", audience: ["core"] },
  // `contracting-ops` is staff's own front page and the hub the rest of the
  // back office hangs off. Deliberately gate-free, for the same reason Today's
  // Work was: an agency-admin unlock here ORs to false for a plain staffer and
  // takes away the first thing they open. It costs nothing to leave open —
  // `navFor` drops a hub whose children are all filtered out, so a staffer with
  // no contracting permission sees only what they may actually use.
  { id: "contracting-ops", label: "Contracting Ops", path: "/contracting-ops", icon: ClipboardList, area: "Back office", audience: ["staff"] },

  // Everyone can invite. An invited agent gets an account and a dashboard;
  // what they can do with it is a separate question from who may send the link.
  { id: "invite", label: "Invite an agent", path: "/contracting/invite", icon: UserPlus, area: "Contracting", parent: "my-contracts", unlock: "agency-member" },

  // ── Back office — staff's own product ────────────────────────────────────
  // These serve two audiences from one set of entries: staff, for whom they
  // are the whole product, and an agency admin reaching them through
  // Contracting. Both gates are ORed, so `staff_is_admin` no longer has to be
  // true for an owner who has never had a role_permissions row written —
  // which is every owner, and which is why Requests and Documents were
  // invisible to the person who runs the agency.
  // Staff's own front page, and deliberately still gate-free for them: an
  // agency-admin unlock here would OR to false for a plain staffer and take
  // away the first thing they open.
  { id: "queue", label: "Today's Work", path: "/contracting-ops/queue", icon: ListTodo, area: "Back office", audience: ["staff"] },
  { id: "requests", label: "Contract Requests", path: "/contracting-ops/requests", icon: FileSignature, area: "Back office", parent: "my-contracts", unlock: "agency-admin", staffPermission: "staff_view_contracts", permission: "staff_is_admin" },
  // Filed with Import rather than under Run Contracting.
  //
  // It is not a place you upload documents — it is the queue where somebody
  // *reviews* an agent's E&O or AML certificate against carrier requirements,
  // with Approve and Reject actions and sensitive-filename withholding. Sat
  // between "Contract Requests" and "Carriers & Comp" it read as a third
  // contracting step, which is why people opened it looking for a file locker.
  // Next to Import it reads as what it is: records arriving from outside that
  // a human has to accept. Two flows deep-link straight into it
  // (work.functions.ts, agent-onboarding.functions.ts), so this is a move
  // rather than a removal — the page and its URL are unchanged.
  //
  // Still listed in the contracting-ops hub below: for back-office staff it is
  // daily work, not an occasional import chore.
  // Two entries for one page, so it lands in the right place for each kind of
  // person without appearing twice for either. Same split, and the same
  // reason, as run-contracting / contracting-ops above.
  { id: "documents", label: "Document review", path: "/contracting-ops/documents", icon: UploadCloud, area: "Back office", parent: "contracting-ops", audience: ["staff"], staffPermission: "staff_view_contracts" },
  { id: "documents-tools", label: "Document review", path: "/contracting-ops/documents", icon: UploadCloud, area: "Tools", parent: "tools", audience: ["core"], unlock: "agency-admin", permission: "staff_is_admin" },
  // Staff see the carrier directory on the same permission as the requests they
  // prepare from it — they cannot submit to a carrier they cannot look up. What
  // they may *change* there is a separate question the page answers itself,
  // through `canManageCarriers`.
  { id: "carriers-setup", label: "Carriers & Comp", path: "/contracting-ops/carriers", icon: Building2, area: "Back office", parent: "my-contracts", unlock: "agency-admin", staffPermission: "staff_view_contracts" },

  // The rest of the back office. Every one of these pages already existed and
  // was reachable only by typing its URL or finding a tile on the overview —
  // which is how an audit concluded the platform had no writing-number registry
  // while `/contracting-ops/requests?tab=numbers` was sitting there.
  { id: "ops-licensing", label: "Licensing & PDB", path: "/contracting-ops/licensing", icon: IdCard, area: "Back office", parent: "contracting-ops", unlock: "agency-admin", staffPermission: "staff_view_contracts", permission: "staff_is_admin" },
  { id: "writing-numbers", label: "Writing numbers", path: "/contracting-ops/requests?tab=numbers", icon: IdCard, area: "Back office", parent: "contracting-ops", unlock: "agency-admin", staffPermission: "staff_view_contracts", permission: "staff_is_admin" },
  { id: "ops-import", label: "Import records", path: "/contracting-ops/import", icon: UploadCloud, area: "Back office", parent: "contracting-ops", unlock: "agency-admin", staffPermission: "staff_view_contracts", permission: "staff_is_admin" },
  { id: "contracting-templates", label: "Submission templates", path: "/contracting-ops/templates", icon: FileSignature, area: "Back office", parent: "contracting-ops", unlock: "agency-admin", staffPermission: "staff_view_contracts", permission: "staff_is_admin" },
  // Agency-level configuration rather than daily work, so it keeps the
  // administrator gate and takes no staff permission.
  { id: "contracting-settings", label: "Contracting settings", path: "/contracting-ops/settings", icon: Settings, area: "Back office", parent: "contracting-ops", unlock: "agency-admin", permission: "staff_is_admin" },

  // Updates
  { id: "announcements", label: "Announcements", path: "/announcements", icon: Megaphone, area: "Updates" },
  { id: "news", label: "News Feed", path: "/news-feed", icon: Newspaper, area: "Updates" },

  // ── Settings ─────────────────────────────────────────────────────────────
  // Yours, plus the workspace's if you run it. Agency is people; Settings is
  // setup — which is the line that makes both of them short.
  { id: "settings", label: "Settings", path: "/settings", icon: Settings, area: "Settings" },
  { id: "notif-settings", label: "Notification settings", path: "/settings/notifications", icon: Megaphone, area: "Settings", parent: "settings" },
  { id: "security", label: "Security", path: "/settings/security", icon: ShieldCheck, area: "Settings", parent: "settings" },
  { id: "nova-pro", label: "Nova Pro", path: "/settings/nova-pro", icon: Sparkles, area: "Settings", parent: "settings", staffPermission: "staff_nova_pro_enabled" },
  { id: "billing", label: "Billing", path: "/settings/billing", icon: Wallet, area: "Settings", parent: "settings" },

  { id: "agency-settings", label: "Agency settings", path: "/settings/agency", icon: Settings, area: "Settings", parent: "settings", unlock: "agency-admin" },
  { id: "agency-roles", label: "Roles & permissions", path: "/settings/roles", icon: ShieldCheck, area: "Settings", parent: "settings", unlock: "agency-admin" },
  // Tabs of Agency settings now, not rows of their own. Kept in the registry
  // so the palette still finds them by name and lands on the right tab.
  { id: "agency-automations", label: "Automations", path: "/settings/agency?tab=automations", icon: Bot, area: "Settings", unlock: "agency-admin" },
  { id: "agency-emails", label: "Emails", path: "/settings/agency?tab=emails", icon: Mail, area: "Settings", unlock: "agency-admin" },
  { id: "integrations", label: "Integrations", path: "/settings/agency?tab=integrations", icon: Bot, area: "Settings", unlock: "agency-admin" },
  // White label is a plan, not a setting — it lives with the other things you
  // pay for.
  { id: "white-label", label: "White label", path: "/settings/billing?tab=white-label", icon: Palette, area: "Settings", unlock: "agency-admin" },
  // The support desk answers tickets, so it sits with the tickets — a tab in
  // Help rather than a row in Settings two sections away from them.
  { id: "support-desk", label: "Support desk", path: "/account/help?tab=desk", icon: LifeBuoy, area: "Settings", unlock: "ticket-responder" },
  // Editing the handbook belongs with reading it. A button in the Resources
  // header, for the people who may.
  { id: "agency-resources", label: "Edit resources", path: "/resources/edit", icon: BookOpen, area: "Tools", unlock: "resource-editor" },
  { id: "profile", label: "Producer Profile", path: "/account/producer-profile", icon: IdCard, area: "Account" },
  { id: "help", label: "Help", path: "/account/help", icon: LifeBuoy, area: "Account" },
  { id: "landing", label: "Landing Page", path: "/account/my-landing-page", icon: Contact, area: "Account" },
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
        "dashboard", "clients", "agency", "my-contracts",
        "reports", "finances", "tools", "nova",
      ],
    },
  ],

  // Queues, not scoreboards.
  // Staff get Tools too. They were the only audience without it, which meant
  // the people who process carrier documents all day could not see Import in
  // their sidebar — reachable by search, which is the kind of hiding this
  // file's header warns about.
  //
  // Contracting Ops leads, because it is where staff work and where they now
  // land. It was four loose rows — queue, requests, licensing, documents —
  // that named four of the twelve pages inside it and gave no way to the rest;
  // it is one expandable section now, with the same four at the top of it.
  // Clients and Reports join for the presets that grant them: a client-services
  // staffer had no Clients row at all, and Reports was reachable only by search.
  staff: [
    { label: "", ids: ["dashboard", "contracting-ops", "tasks", "clients", "reports", "tools", "nova", "agency"] },
  ],
};

/** Everything the gates need to know about this person. */
export type NavContext = {
  audience: Audience;
  /** Their organisation is on a paid team plan rather than solo. */
  inAgency: boolean;
  /** …and they administer it. */
  canSeeAgency: boolean;
  /** How many people are under them. Drives the has-downline gate. */
  downlineCount: number;
  /** Invited, not yet activated, no first sale. */
  isPending: boolean;
  /**
   * They answer tickets for the agency. Mirrors the database's
   * can_work_tickets() so the row that offers the desk and the policy that
   * lets them act on it agree.
   */
  canWorkTickets: boolean;
  /** They maintain the agency's handbook, scripts and courses. Mirrors can_manage_resources(). */
  canEditResources: boolean;
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

  // Staff permissions gate staff only, and for staff they are the *whole*
  // gate. Applying them to everybody would hide Nova from an owner who has
  // never had a role_permissions row written; ANDing them with the gates below
  // did something worse — those gates describe how a *core* user reaches the
  // page, so a contracting specialist, who is neither an agency admin nor
  // `staff_is_admin`, was denied Contract Requests. Their entire job is
  // contract requests. One question for staff: does their permission allow it.
  if (ctx.audience === "staff" && p.staffPermission) {
    return Boolean(ctx.perms[p.staffPermission]);
  }

  // Any gate passing is enough. Most pages have one; the exceptions are the
  // ones two different kinds of person legitimately reach.
  const gates: boolean[] = [];
  if (p.unlock === "agency-member") gates.push(ctx.inAgency);
  if (p.unlock === "agency-admin") gates.push(ctx.canSeeAgency);
  if (p.unlock === "has-downline") gates.push(ctx.downlineCount > 0);
  if (p.unlock === "ticket-responder") gates.push(ctx.canWorkTickets);
  if (p.unlock === "resource-editor") gates.push(ctx.canEditResources);
  if (p.unlock === "activated") gates.push(!ctx.isPending);
  if (p.permission) gates.push(Boolean(ctx.perms[p.permission]));
  if (gates.length > 0 && !gates.some(Boolean)) return false;

  return true;
}

/**
 * The sidebar: a short list, in the order this person works.
 *
 * A section with nothing in it is not a section. Agency, for a back-office
 * staffer who administers nothing, has no leaderboard and no downline — so it
 * disappears rather than sitting there as a heading onto a page they cannot
 * use. Only hubs are subject to this; an ordinary entry stands on its own.
 */
export function navFor(ctx: NavContext): NavGroup[] {
  return PRODUCTS[ctx.audience]
    .map((g) => ({
      label: g.label,
      items: g.ids
        .map(page)
        .filter((p) => allowed(p, ctx))
        .filter((p) => !isHub(p.id) || hubGroupsFor(p.id, ctx).length > 0),
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
export const ACCOUNT_PAGES = ["settings", "profile", "landing", "help"].map(page);

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
  // Declared first so `hubForPath` resolves a `/contracting-ops/...` URL to
  // this hub rather than to my-contracts, which lists four of the same pages.
  // See the tie-break note in hubForPath.
  "contracting-ops": [
    { label: "", ids: ["queue", "requests", "ops-licensing", "documents"] },
    {
      label: "Set up contracting",
      ids: ["carriers-setup", "writing-numbers", "ops-import", "contracting-templates", "contracting-settings"],
    },
  ],

  // Home has none, on purpose. See the registry note above it.
  clients: [
    { label: "", ids: ["pipeline", "calendar", "book", "retention"] },
  ],
  // Agency is people. Getting agents ready became a tab inside Team
  // management, where the roster it talks about already is.
  agency: [
    { label: "", ids: ["leaderboard", "my-agents"] },
    { label: "Run the agency", ids: ["agency-overview", "team", "recruiting"] },
  ],

  // Contracting is one place now.
  //
  // Contracting Ops was filed under Agency, which put the agency's contracting
  // back office two sections away from the agent's own contracts. Worse, it is
  // itself a hub, and app-sidebar only expands hubs at the top level — so as a
  // child of Agency its twelve pages rendered as a single dead-end row and
  // were reachable only from tiles on its own overview.
  //
  // Flattened into a second group here instead. Same pages, in the section
  // whose name they share, and visible.
  "my-contracts": [
    { label: "", ids: ["contracts-list", "carriers", "comp-grids", "invite"] },
    {
      label: "Run contracting",
      ids: [
        "run-contracting", "requests",
        "carriers-setup",
      ],
    },
  ],

  tools: [
    { label: "", ids: ["import", "documents-tools", "resources", "quoter", "marketing"] },
  ],

  // Was nine rows, nearly all of them a page that belonged inside something
  // else. Emails, Automations and Integrations are tabs of Agency settings;
  // White label is the upgrade it always was, inside Billing; the support desk
  // sits in Help beside the tickets it answers; Edit resources lives with the
  // resources it edits. What people use is gone.
  settings: [
    { label: "", ids: ["notif-settings", "security", "nova-pro", "billing"] },
    { label: "Your agency", ids: ["agency-settings", "agency-roles"] },
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

/**
 * Which hub, if any, a path belongs to. Longest match wins.
 *
 * Two hubs can legitimately list the same page — Contract Requests belongs to
 * Contracting Ops for staff and to Contracting for everybody else — so a match
 * on a child is a tie. It is broken by the hub's *own* path: `/contracting-ops`
 * is a prefix of `/contracting-ops/requests` and `/contracting` is not, so the
 * more specific section wins and the sidebar opens the one you are actually in.
 */
export function hubForPath(path: string): string | null {
  const prefixes = (p: Page) => path === p.path || path.startsWith(p.path + "/");
  let best: { id: string; len: number; own: boolean } | null = null;
  for (const hubId of Object.keys(HUBS)) {
    const hub = BY_ID.get(hubId);
    const own = Boolean(hub && prefixes(hub));
    for (const id of [hubId, ...hubChildIds(hubId)]) {
      const p = BY_ID.get(id);
      if (!p || !prefixes(p)) continue;
      const better = !best
        || p.path.length > best.len
        || (p.path.length === best.len && own && !best.own);
      if (better) best = { id: hubId, len: p.path.length, own };
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
