import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BookOpen, Building2, Calendar, ClipboardList, Contact, FilePlus,
  FileSignature, Heart, IdCard, KanbanSquare, LayoutDashboard, LifeBuoy, ListTodo,
  Megaphone, Newspaper, Percent, Phone, Settings, Sparkles, Target, Trophy,
  UploadCloud, UserPlus, Users, Wallet,
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
};

// ── The registry ────────────────────────────────────────────────────────────

export const PAGES: Page[] = [
  // Everyday
  { id: "dashboard", label: "Home", path: "/dashboard", icon: LayoutDashboard, area: "Everyday" },
  { id: "pipeline", label: "Clients", path: "/pipeline", icon: KanbanSquare, area: "Everyday" },
  { id: "book", label: "Business", path: "/book-of-business", icon: BookOpen, area: "Everyday" },
  { id: "post-deal", label: "Post a Deal", path: "/post-deal", icon: FilePlus, area: "Everyday" },
  { id: "finances", label: "Money", path: "/finances", icon: Wallet, area: "Everyday" },
  { id: "tasks", label: "Tasks", path: "/tasks", icon: ListTodo, area: "Everyday" },
  { id: "nova", label: "Nova", path: "/ai-assistant", icon: Sparkles, area: "Everyday" },

  // Agency
  { id: "agency", label: "Agency", path: "/agency", icon: Building2, area: "Agency", audience: ["owner"] },
  { id: "team", label: "Team", path: "/team", icon: Users, area: "Agency", audience: ["owner", "manager"] },
  { id: "retention", label: "Retention", path: "/retention", icon: Heart, area: "Agency", audience: ["owner", "manager", "staff"] },
  { id: "intake", label: "Document Intake", path: "/intake", icon: UploadCloud, area: "Agency", audience: ["owner", "staff"] },
  { id: "leaderboard", label: "Leaderboard", path: "/leaderboard", icon: Trophy, area: "Agency", audience: ["owner", "manager", "agent"] },
  { id: "challenges", label: "Challenges", path: "/challenges", icon: Target, area: "Agency", audience: ["owner", "manager", "agent"] },
  { id: "invite", label: "Invite an agent", path: "/contracting/invite", icon: UserPlus, area: "Agency", audience: ["owner", "manager"] },

  // Contracting
  { id: "contracting-ops", label: "Contracting", path: "/contracting-ops", icon: ClipboardList, area: "Contracting", audience: ["owner", "staff", "manager"] },
  { id: "queue", label: "Today's Work", path: "/contracting-ops/queue", icon: ListTodo, area: "Contracting", audience: ["staff", "owner"] },
  { id: "requests", label: "Contract Requests", path: "/contracting-ops/requests", icon: FileSignature, area: "Contracting", audience: ["owner", "staff", "manager"] },
  { id: "ready", label: "Ready to Sell", path: "/contracting-ops/ready-to-sell", icon: IdCard, area: "Contracting", audience: ["owner", "staff", "manager"] },
  { id: "licensing", label: "Licensing", path: "/contracting-ops/licensing", icon: FileSignature, area: "Contracting", audience: ["owner", "staff"] },
  { id: "documents", label: "Documents", path: "/contracting-ops/documents", icon: UploadCloud, area: "Contracting", audience: ["owner", "staff"] },
  { id: "carriers-dir", label: "Carrier Directory", path: "/contracting-ops/carriers", icon: Building2, area: "Contracting", audience: ["owner", "staff"] },
  { id: "comp", label: "Compensation", path: "/contracting-ops/compensation", icon: Percent, area: "Contracting", audience: ["owner"] },
  { id: "comp-grids", label: "Comp Grids", path: "/contracting-ops/comp-grids", icon: Percent, area: "Contracting", audience: ["owner", "staff"] },
  { id: "writing-numbers", label: "Writing Numbers", path: "/contracting-ops/writing-numbers", icon: IdCard, area: "Contracting", audience: ["owner", "staff"] },
  { id: "hierarchies", label: "Hierarchies", path: "/contracting-ops/hierarchies", icon: Users, area: "Contracting", audience: ["owner", "staff"] },
  { id: "hierarchy-changes", label: "Hierarchy Changes", path: "/contracting-ops/hierarchy-changes", icon: Users, area: "Contracting", audience: ["owner", "staff", "manager"] },
  { id: "my-contracts", label: "My Contracts", path: "/contracting", icon: FileSignature, area: "Contracting" },
  { id: "carriers", label: "Carriers", path: "/contracting/carriers", icon: Building2, area: "Contracting" },

  // Reporting
  { id: "reports", label: "Reports", path: "/reports", icon: BarChart3, area: "Reporting", audience: ["owner", "manager"] },
  { id: "analytics", label: "Analytics", path: "/analytics", icon: BarChart3, area: "Reporting" },

  // Tools
  { id: "phone", label: "Phone", path: "/phone", icon: Phone, area: "Tools", audience: ["solo", "agent", "manager", "owner"] },
  { id: "calendar", label: "Calendar", path: "/calendar", icon: Calendar, area: "Tools" },
  { id: "leads", label: "Leads", path: "/tools/leads", icon: Target, area: "Tools", audience: ["solo", "agent", "manager", "owner"] },

  // Updates
  { id: "notifications", label: "Notifications", path: "/notifications", icon: Megaphone, area: "Updates" },
  { id: "announcements", label: "Announcements", path: "/announcements", icon: Megaphone, area: "Updates" },
  { id: "news", label: "News Feed", path: "/news-feed", icon: Newspaper, area: "Updates" },

  // Learning
  { id: "resources", label: "Resources", path: "/resources/new-agent-guide", icon: BookOpen, area: "Learning" },
  { id: "academy", label: "Agent Academy", path: "/resources/agent-academy", icon: BookOpen, area: "Learning" },
  { id: "scripts", label: "Scripts", path: "/resources/scripts", icon: BookOpen, area: "Learning" },

  // Account
  { id: "settings", label: "Settings", path: "/settings", icon: Settings, area: "Account" },
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
    { label: "", ids: ["dashboard", "pipeline", "book", "finances", "nova"] },
  ],

  // Same job, inside somebody's agency.
  agent: [
    { label: "", ids: ["dashboard", "pipeline", "book", "finances", "nova"] },
    { label: "Me", ids: ["my-contracts", "tasks"] },
  ],

  // Queues, not scoreboards.
  staff: [
    { label: "", ids: ["queue", "requests", "licensing", "documents", "tasks"] },
    { label: "", ids: ["nova"] },
  ],

  // A team to run.
  manager: [
    { label: "", ids: ["dashboard", "team", "pipeline", "contracting-ops", "reports", "nova"] },
  ],

  // The whole agency.
  owner: [
    { label: "", ids: ["dashboard", "agency", "pipeline", "contracting-ops", "reports", "nova"] },
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
