import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * Usage ingestion and reporting.
 *
 * The report is not a dashboard. Its only job is to produce three lists —
 * used, barely used, never used — so that deleting a page becomes a decision
 * based on evidence rather than on whose feature it was.
 */

const EventSchema = z.object({
  event: z.enum(["page_view", "action", "workflow_step"]),
  path: z.string().max(200),
  action: z.string().max(120).nullable().optional(),
  duration_ms: z.number().int().min(0).max(30 * 60 * 1000).nullable().optional(),
  meta: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean()])).default({}),
});

export const recordUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ events: z.array(EventSchema).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;

    // Role and plan are stamped at write time so a report still reads correctly
    // after somebody is promoted or the agency changes plan.
    const [orgId, { data: roleRows }] = await Promise.all([
      getMyPrimaryOrgId(userId),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const roles: string[] = (roleRows ?? []).map((r: any) => String(r.role));
    const role = ["agency_owner", "admin", "manager", "staff", "agent"]
      .find((r) => roles.includes(r)) ?? "agent";

    let planType: string | null = null;
    if (orgId) {
      const { data: org } = await supabaseAdmin
        .from("organizations").select("plan_type").eq("id", orgId).maybeSingle();
      planType = org?.plan_type ?? null;
    }

    const rows = data.events.map((e) => ({
      organization_id: orgId,
      profile_id: userId,
      role,
      plan_type: planType,
      event: e.event,
      path: e.path,
      action: e.action ?? null,
      duration_ms: e.duration_ms ?? null,
      meta: e.meta,
    }));

    // Failure here must never surface to the user — they clicked a button in
    // the product, not in an analytics tool.
    const { error } = await supabaseAdmin.from("usage_events").insert(rows);
    if (error) console.error("[usage] insert failed", error.message);

    return { ok: true };
  });

/**
 * Every page a signed-in user can reach.
 *
 * Kept as a literal list on purpose: the report's most valuable output is the
 * set of pages with ZERO events, and you cannot derive "never visited" from a
 * table that only contains visits.
 */
export const ROUTE_INVENTORY: { path: string; label: string; area: string }[] = [
  { path: "/dashboard", label: "Dashboard", area: "Core" },
  { path: "/pipeline", label: "Pipeline", area: "Core" },
  { path: "/post-deal", label: "Post a Deal", area: "Core" },
  { path: "/book-of-business", label: "Book of Business", area: "Core" },
  { path: "/finances", label: "Finances", area: "Core" },
  { path: "/finances/reconciliation", label: "Reconciliation", area: "Core" },
  { path: "/tasks", label: "Tasks", area: "Core" },
  { path: "/analytics", label: "Analytics", area: "Reporting" },
  { path: "/reports", label: "Reports", area: "Reporting" },
  { path: "/leaderboard", label: "Leaderboard", area: "Reporting" },
  { path: "/challenges", label: "Challenges", area: "Reporting" },
  { path: "/team", label: "Team", area: "Agency" },
  { path: "/agency", label: "Agency Admin", area: "Agency" },
  { path: "/agency/team", label: "Roles & permissions", area: "Agency" },
  { path: "/agency/settings", label: "Agency settings", area: "Agency" },
  { path: "/agency/automations", label: "Automations", area: "Agency" },
  { path: "/agency/emails", label: "Emails", area: "Agency" },
  { path: "/retention", label: "Retention", area: "Agency" },
  { path: "/intake", label: "Document Intake", area: "Agency" },
  { path: "/white-label", label: "White Label", area: "Agency" },
  { path: "/contracting", label: "My Contracts", area: "Contracting" },
  { path: "/contracting/carriers", label: "Carriers (agent view)", area: "Contracting" },
  { path: "/contracting/invite", label: "Onboarding invite", area: "Contracting" },
  { path: "/contracting/transfers", label: "Transfers", area: "Contracting" },
  { path: "/contracting/annuity-training", label: "Annuity training", area: "Contracting" },
  { path: "/contracting/commission-grids", label: "Commission grids (old)", area: "Contracting" },
  { path: "/contracting-ops", label: "Contracting Overview", area: "Contracting Ops" },
  { path: "/contracting-ops/requests", label: "Contract Requests", area: "Contracting Ops" },
  { path: "/contracting-ops/queue", label: "Staff Queue", area: "Contracting Ops" },
  { path: "/contracting-ops/hierarchy-changes", label: "Hierarchy Changes", area: "Contracting Ops" },
  { path: "/contracting-ops/ready-to-sell", label: "Ready to Sell", area: "Contracting Ops" },
  { path: "/contracting-ops/licensing", label: "Licensing", area: "Contracting Ops" },
  { path: "/contracting-ops/documents", label: "Documents", area: "Contracting Ops" },
  { path: "/contracting-ops/carriers", label: "Carrier Directory", area: "Contracting Ops" },
  { path: "/contracting-ops/compensation", label: "Compensation", area: "Contracting Ops" },
  { path: "/contracting-ops/comp-grids", label: "Comp Grids", area: "Contracting Ops" },
  { path: "/contracting-ops/writing-numbers", label: "Writing Numbers", area: "Contracting Ops" },
  { path: "/contracting-ops/hierarchies", label: "Hierarchies", area: "Contracting Ops" },
  { path: "/contracting-ops/templates", label: "Templates", area: "Contracting Ops" },
  { path: "/contracting-ops/import", label: "Import", area: "Contracting Ops" },
  { path: "/contracting-ops/settings", label: "Contracting settings", area: "Contracting Ops" },
  { path: "/nova", label: "Nova", area: "Nova" },
  { path: "/ai-assistant", label: "AI Assistant", area: "Nova" },
  { path: "/nova/activity", label: "Nova activity", area: "Nova" },
  { path: "/nova/settings", label: "Nova settings", area: "Nova" },
  { path: "/settings/nova-pro", label: "Nova Pro", area: "Nova" },
  { path: "/phone", label: "Phone", area: "Tools" },
  { path: "/calendar", label: "Calendar", area: "Tools" },
  { path: "/tools/leads", label: "Leads", area: "Tools" },
  { path: "/carrier-sync", label: "Carrier Sync", area: "Tools" },
  { path: "/back-office/case-design", label: "Case Design", area: "Back office" },
  { path: "/back-office/advanced-desk", label: "Advanced Desk", area: "Back office" },
  { path: "/back-office/recruiting-funnels", label: "Recruiting funnels", area: "Back office" },
  { path: "/back-office/recruiting-tracker", label: "Recruiting tracker", area: "Back office" },
  { path: "/back-office/client-marketing", label: "Client marketing", area: "Back office" },
  { path: "/back-office/marketing-tracker", label: "Marketing tracker", area: "Back office" },
  { path: "/resources/new-agent-guide", label: "New agent guide", area: "Resources" },
  { path: "/resources/agent-handbook", label: "Agent handbook", area: "Resources" },
  { path: "/resources/agent-academy", label: "Agent academy", area: "Resources" },
  { path: "/resources/scripts", label: "Scripts", area: "Resources" },
  { path: "/resources/state-licenses", label: "State licenses", area: "Resources" },
  { path: "/announcements", label: "Announcements", area: "Updates" },
  { path: "/news-feed", label: "News Feed", area: "Updates" },
  { path: "/notifications", label: "Notifications", area: "Updates" },
  { path: "/settings", label: "Settings", area: "Account" },
  { path: "/settings/billing", label: "Billing", area: "Account" },
  { path: "/settings/notifications", label: "Notification settings", area: "Account" },
  { path: "/settings/security", label: "Security", area: "Account" },
  { path: "/account/producer-profile", label: "Producer Profile", area: "Account" },
  { path: "/account/help", label: "Help Center", area: "Account" },
  { path: "/account/faq", label: "FAQ", area: "Account" },
  { path: "/account/my-landing-page", label: "My Landing Page", area: "Account" },
];

export const getUsageReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(90).default(30) }).default({ days: 30 }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return null;

    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    // RLS restricts this to org admins; a non-admin gets an empty set rather
    // than an error, and the page says so.
    const { data: events, error } = await supabase
      .from("usage_events")
      .select("event, path, action, role, duration_ms, profile_id, created_at")
      .gte("created_at", since)
      .limit(50_000);
    if (error) throw new Error(error.message);

    const rows = events ?? [];

    type PageStat = { views: number; people: Set<string>; totalMs: number; timed: number };
    const byPage = new Map<string, PageStat>();
    const byAction = new Map<string, { count: number; people: Set<string> }>();
    const byRole = new Map<string, number>();

    for (const e of rows) {
      if (e.role) byRole.set(e.role, (byRole.get(e.role) ?? 0) + 1);

      if (e.event === "page_view") {
        const s = byPage.get(e.path) ?? { views: 0, people: new Set(), totalMs: 0, timed: 0 };
        s.views += 1;
        if (e.profile_id) s.people.add(e.profile_id);
        if (e.duration_ms != null) { s.totalMs += e.duration_ms; s.timed += 1; }
        byPage.set(e.path, s);
      } else if (e.action) {
        const a = byAction.get(e.action) ?? { count: 0, people: new Set() };
        a.count += 1;
        if (e.profile_id) a.people.add(e.profile_id);
        byAction.set(e.action, a);
      }
    }

    const pages = ROUTE_INVENTORY.map((r) => {
      const s = byPage.get(r.path);
      return {
        ...r,
        views: s?.views ?? 0,
        people: s?.people.size ?? 0,
        // Median would be better; mean is honest enough to spot a page people
        // open and immediately leave.
        avg_seconds: s && s.timed > 0 ? Math.round(s.totalMs / s.timed / 1000) : null,
      };
    }).sort((a, b) => b.views - a.views);

    return {
      days: data.days,
      total_events: rows.length,
      // Empty is a real answer here — it means tracking is on and nobody has
      // used the product yet, which is different from tracking being broken.
      tracking_live: rows.length > 0,
      pages,
      never_opened: pages.filter((p) => p.views === 0),
      actions: [...byAction.entries()]
        .map(([action, a]) => ({ action, count: a.count, people: a.people.size }))
        .sort((x, y) => y.count - x.count)
        .slice(0, 60),
      by_role: [...byRole.entries()].map(([role, count]) => ({ role, count }))
        .sort((x, y) => y.count - x.count),
    };
  });
