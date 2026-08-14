import { createServerFn } from "@tanstack/react-start";
import { loadEffectiveContractingSettings } from "@/lib/contracting-ops/effective-settings.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * What needs you today.
 *
 * One list, assembled per person, that answers the only question somebody has
 * when they open the app in the morning. The dashboard puts it above the
 * numbers: the scoreboard tells you how you're doing, this tells you what to
 * do, and only one of those is useful at 8am.
 *
 * Deliberately small and boring. Each entry is a count, a sentence and a
 * link — no new tables, no new concepts, nothing that needs explaining.
 */

export type WorkItem = {
  id: string;
  /** What it is, in the words somebody would use out loud. */
  title: string;
  /** Why it matters, or what happens if it's ignored. */
  detail: string;
  count: number;
  urgency: "overdue" | "today" | "soon";
  href: string;
};

const ORDER = { overdue: 0, today: 1, soon: 2 } as const;

export const getMyWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);

    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin.from("profiles").select("id, organization_id").eq("id", userId).maybeSingle(),
    ]);
    const roles: string[] = (roleRows ?? []).map((r: any) => String(r.role));
    const isAgency = roles.some((r) => ["agency_owner", "admin", "super_admin", "manager"].includes(r));
    const isStaff = roles.includes("staff");
    const seesAgency = isAgency || isStaff;

    const today = new Date().toISOString().slice(0, 10);
    const items: WorkItem[] = [];

    // ── Yours, whoever you are ──────────────────────────────────────────────

    const { data: myTasks } = await supabaseAdmin
      .from("tasks")
      .select("id, due_date, status")
      .eq("assigned_to", userId)
      .neq("status", "completed");

    const overdueTasks = (myTasks ?? []).filter((t: any) => t.due_date && t.due_date < today);
    const dueToday = (myTasks ?? []).filter((t: any) => t.due_date === today);

    if (overdueTasks.length) {
      items.push({
        id: "tasks-overdue",
        title: `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}`,
        detail: "Past their due date.",
        count: overdueTasks.length,
        urgency: "overdue",
        href: "/tasks",
      });
    }
    if (dueToday.length) {
      items.push({
        id: "tasks-today",
        title: `${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today`,
        detail: "Scheduled for today.",
        count: dueToday.length,
        urgency: "today",
        href: "/tasks",
      });
    }

    // Requests waiting on the agent themselves — the most common reason a
    // contract sits still for a week.
    const { data: myRequests } = await supabaseAdmin
      .from("contracting_requests")
      .select("id, status")
      .eq("agent_id", userId)
      .in("status", ["missing_information", "missing_documents", "awaiting_agent"]);

    if ((myRequests ?? []).length) {
      items.push({
        id: "my-contracting",
        title: `${myRequests.length} carrier request${myRequests.length === 1 ? "" : "s"} waiting on you`,
        detail: "They can't go to the carrier until you finish your part.",
        count: myRequests.length,
        urgency: "today",
        href: "/contracting",
      });
    }

    if (!orgId || !seesAgency) {
      return { items: sortWork(items), scope: "me" as const };
    }

    // ── The agency's, if you run or support it ──────────────────────────────

    // Who is in this agency. Needed for licences, and for documents — see below.
    const { data: members } = await supabaseAdmin
      .from("organization_memberships").select("profile_id")
      .eq("organization_id", orgId).eq("status", "active");
    const memberIds = (members ?? []).map((m: any) => m.profile_id);

    const [{ data: requests }, { data: hierarchy }, { data: docs }, { data: retention }] =
      await Promise.all([
        supabaseAdmin.from("contracting_requests")
          .select("id, status, due_date, assigned_to, readiness_state")
          .eq("organization_id", orgId),
        supabaseAdmin.from("hierarchy_change_requests")
          .select("id, status").eq("organization_id", orgId)
          .in("status", ["awaiting_manager", "awaiting_owner"]),
        // Scoped by who the document belongs to rather than by its
        // organization_id. That column is nullable and was historically left
        // unset by the upload paths, so filtering on it silently reported zero
        // documents waiting — the one number on this list that must not be
        // quietly wrong.
        memberIds.length
          ? supabaseAdmin.from("producer_documents")
              .select("id").in("agent_id", memberIds).eq("review_status", "uploaded")
          : Promise.resolve({ data: [] }),
        supabaseAdmin.from("retention_cases")
          .select("id, status").eq("organization_id", orgId)
          .in("status", ["open", "working"]),
      ]);

    const reqs = requests ?? [];

    const overdueReqs = reqs.filter((r: any) =>
      r.due_date && r.due_date < today &&
      !["approved", "writing_number_issued", "declined", "cancelled", "closed"].includes(r.status));
    if (overdueReqs.length) {
      items.push({
        id: "requests-overdue",
        title: `${overdueReqs.length} contracting request${overdueReqs.length === 1 ? "" : "s"} overdue`,
        detail: "Past the turnaround you set.",
        count: overdueReqs.length,
        urgency: "overdue",
        href: "/contracting-ops/queue",
      });
    }

    const nigo = reqs.filter((r: any) => ["nigo", "additional_info_requested"].includes(r.status));
    if (nigo.length) {
      items.push({
        id: "requests-nigo",
        title: `${nigo.length} request${nigo.length === 1 ? "" : "s"} the carrier sent back`,
        detail: "Not in good order — the carrier needs something fixed.",
        count: nigo.length,
        urgency: "overdue",
        href: "/contracting-ops/requests",
      });
    }

    const readyToSubmit = reqs.filter((r: any) => r.status === "ready_to_submit");
    if (readyToSubmit.length) {
      items.push({
        id: "requests-ready",
        title: `${readyToSubmit.length} request${readyToSubmit.length === 1 ? "" : "s"} ready to submit`,
        detail: "Nothing outstanding. These can go to the carrier now.",
        count: readyToSubmit.length,
        urgency: "today",
        href: "/contracting-ops/queue",
      });
    }

    const unassigned = reqs.filter((r: any) =>
      !r.assigned_to &&
      !["approved", "writing_number_issued", "declined", "cancelled", "closed"].includes(r.status));
    if (unassigned.length) {
      items.push({
        id: "requests-unassigned",
        title: `${unassigned.length} request${unassigned.length === 1 ? "" : "s"} with nobody on them`,
        detail: "Unassigned work tends to stay unassigned.",
        count: unassigned.length,
        urgency: "today",
        href: "/contracting-ops/queue",
      });
    }

    if (isAgency && (hierarchy ?? []).length) {
      items.push({
        id: "hierarchy-approvals",
        title: `${hierarchy.length} hierarchy change${hierarchy.length === 1 ? "" : "s"} need approval`,
        detail: "Waiting on a decision from you.",
        count: hierarchy.length,
        urgency: "today",
        href: "/contracting-ops/requests?tab=changes",
      });
    }

    if ((docs ?? []).length) {
      items.push({
        id: "docs-review",
        title: `${docs.length} document${docs.length === 1 ? "" : "s"} to review`,
        detail: "Uploaded but not yet approved, so they don't count toward contracting.",
        count: docs.length,
        urgency: "today",
        href: "/contracting-ops/documents",
      });
    }

    if ((retention ?? []).length) {
      items.push({
        id: "retention-open",
        title: `${retention.length} polic${retention.length === 1 ? "y" : "ies"} at risk`,
        detail: "Open retention cases. Every day counts on these.",
        count: retention.length,
        urgency: "overdue",
        href: "/retention",
      });
    }

    // Licensing, which is slower-moving but blocks everything downstream.
    const { effective } = await loadEffectiveContractingSettings(orgId);
    const warnDays = Number(effective.license_expiry_warning_days ?? 45);
    const warnBy = new Date(Date.now() + warnDays * 86_400_000).toISOString().slice(0, 10);

    if (memberIds.length) {
      const { data: expiring } = await supabaseAdmin
        .from("state_licenses")
        .select("id, expires_date")
        .in("agent_id", memberIds)
        .not("expires_date", "is", null)
        .lte("expires_date", warnBy);

      const expired = (expiring ?? []).filter((l: any) => l.expires_date < today);
      const soon = (expiring ?? []).filter((l: any) => l.expires_date >= today);

      if (expired.length) {
        items.push({
          id: "licenses-expired",
          title: `${expired.length} licence${expired.length === 1 ? "" : "s"} expired`,
          detail: "That agent cannot write in those states until it's renewed.",
          count: expired.length,
          urgency: "overdue",
          href: "/contracting-ops/licensing",
        });
      }
      if (soon.length) {
        items.push({
          id: "licenses-soon",
          title: `${soon.length} licence${soon.length === 1 ? "" : "s"} expiring soon`,
          detail: `Within ${warnDays} days.`,
          count: soon.length,
          urgency: "soon",
          href: "/contracting-ops/licensing",
        });
      }
    }

    return { items: sortWork(items), scope: "agency" as const };
  });

/** Overdue first, then by size — the biggest pile of the same urgency wins. */
function sortWork(items: WorkItem[]): WorkItem[] {
  return items.sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency] || b.count - a.count);
}
