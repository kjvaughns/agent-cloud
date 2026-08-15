/**
 * Who may open which tab of Agency Settings, and do what inside it.
 *
 * ── Why a module ──
 *
 * Agency Settings became eight tabs on one route. Without a single answer to
 * "may this person open this tab", each tab guards itself, and the ones added
 * later guard themselves differently or not at all. Eight is already too many
 * to keep in step by hand.
 *
 * ── Reused, not reinvented ──
 *
 * Two of the eight the brief names already exist and are not duplicated here:
 *
 *   Roles and Permissions  →  admin_manage_staff_configs
 *   Contracting            →  staff_edit_contracts
 *
 * The other six are new because nothing covered them. `staff_manage_resources`
 * looked like a candidate for carriers and is not: it grants the handbook,
 * scripts and academy, and an agency that lets a trainer edit the script
 * library has not thereby said they may change what every agent is paid.
 *
 * ── Owner always, agent never ──
 *
 * An owner sees every tab without holding any toggle — they are who grants the
 * toggles. A regular agent sees none of Agency Settings at all, which is the
 * default this returns when nothing matches rather than something a caller has
 * to remember to check.
 *
 * ── This is one of three places ──
 *
 * The brief is explicit that hiding a button is not enough. This module is the
 * user interface layer. Server functions check the same capability before
 * writing, and RLS checks it again in the database. A tab hidden here and
 * unguarded there is a button somebody can still reach with a fetch.
 */

import type { PermissionKey, Permissions } from "@/lib/permissions.functions";

export const SETTINGS_TABS = [
  "general",
  "roles",
  "levels",
  "carriers",
  "contracting",
  "automations",
  "integrations",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const TAB_LABEL: Record<SettingsTab, string> = {
  general: "General",
  roles: "Roles & Permissions",
  levels: "Levels & Positions",
  carriers: "Carriers",
  contracting: "Contracting",
  automations: "Automations",
  integrations: "Integrations",
};

/**
 * The capability each tab needs.
 *
 * Every tab needs one. Notifications used to be the exception — it edits your
 * own preferences and so could not be gated — which is exactly why it is no
 * longer a tab here: a page anybody may open does not belong behind a hub that
 * requires an agency permission to reach. It lives at /settings/notifications.
 */
export const TAB_PERMISSION: Record<SettingsTab, PermissionKey | null> = {
  general: "admin_manage_agency_profile",
  roles: "admin_manage_staff_configs",
  levels: "admin_manage_levels",
  carriers: "admin_manage_carriers",
  contracting: "staff_edit_contracts",
  automations: "admin_manage_automations",
  integrations: "admin_manage_integrations",
};

/**
 * Editing a comp grid is its own permission, inside the Carriers tab.
 *
 * Separate because they are different acts on different scales: adding a
 * carrier changes what agents can select, while editing its grid changes what
 * every one of them is paid on every deal already written against it.
 */
export const GRID_PERMISSION: PermissionKey = "admin_manage_grids";

export type AccessContext = {
  isOwner: boolean;
  isPlatformAdmin: boolean;
  /** True for anybody with a staff or manager seat. Agents are false. */
  isStaff: boolean;
  perms: Permissions;
};

function holds(ctx: AccessContext, key: PermissionKey | null): boolean {
  if (ctx.isOwner || ctx.isPlatformAdmin) return true;
  if (!ctx.isStaff) return false;
  if (key === null) return true;
  return ctx.perms[key] === true;
}

/** May this person open this tab at all? */
export function canOpenTab(tab: SettingsTab, ctx: AccessContext): boolean {
  return holds(ctx, TAB_PERMISSION[tab]);
}

/** May this person edit compensation grids? */
export function canEditGrids(ctx: AccessContext): boolean {
  return holds(ctx, GRID_PERMISSION);
}

/**
 * The tabs to render, in the brief's order.
 *
 * A tab somebody cannot open is dropped rather than disabled. A disabled tab
 * advertises a capability and then refuses it, which reads as a fault rather
 * than as a boundary.
 */
export function visibleTabs(ctx: AccessContext): SettingsTab[] {
  return SETTINGS_TABS.filter((t) => canOpenTab(t, ctx));
}

/**
 * Where to land when no tab is named, or when the named one is not allowed.
 *
 * Returns null for somebody with no tabs at all — a regular agent — so the
 * caller sends them away rather than to an empty shell.
 */
export function defaultTab(ctx: AccessContext, requested?: string | null): SettingsTab | null {
  const allowed = visibleTabs(ctx);
  if (allowed.length === 0) return null;
  const asked = SETTINGS_TABS.find((t) => t === requested);
  if (asked && allowed.includes(asked)) return asked;
  return allowed[0];
}

/** Can this person reach Agency Settings at all? */
export function canOpenAgencySettings(ctx: AccessContext): boolean {
  return visibleTabs(ctx).length > 0;
}

/**
 * Why a tab is refused, for the server to say out loud.
 *
 * A server function that returns a bare 403 makes an owner think the product
 * is broken. Naming the permission tells them what to grant.
 */
export function refusalReason(tab: SettingsTab): string {
  const key = TAB_PERMISSION[tab];
  if (key === null) return `You do not have access to ${TAB_LABEL[tab]}.`;
  return (
    `You do not have permission to open ${TAB_LABEL[tab]}. An agency owner can ` +
    `grant this under Settings ▸ Agency Settings ▸ Roles and Permissions.`
  );
}
