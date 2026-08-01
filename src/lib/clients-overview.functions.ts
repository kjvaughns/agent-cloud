import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * The state of your clients, in numbers.
 *
 * One block per destination in the Clients hub — the pipeline, the book, the
 * retention queue — so the overview says something before you click rather
 * than being a menu wearing a dashboard's clothes.
 *
 * Each block is scoped the same way the page it links to is scoped by default,
 * which is the only property that matters here: a number on this page and the
 * page it opens must not disagree.
 *
 *   pipeline    your own leads               (clients.agent_id = you)
 *   book        the widest view you have     (get_book_of_business, agency)
 *   retention   whatever RLS lets you see    (writing agent, assignee, owner,
 *                                             or manager over the downline)
 *
 * Read through the RLS-bound client throughout. No service role: this page
 * must not be able to show somebody a number they could not reach by clicking.
 */

export type ClientsOverview = {
  pipeline: { working: number; hot: number; quiet: number };
  book: { active: number; monthlyPremium: number; pending: number; placedThisMonth: number };
  retention: { live: number; atRisk: number; saveRate: number | null } | null;
};

/** A lead untouched this long is the one you have actually lost. */
const QUIET_DAYS = 14;

export const getClientsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientsOverview> => {
    const { supabase, userId } = context as Ctx;

    const now = Date.now();
    const monthStart = new Date(
      Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1),
    ).toISOString();
    const quietBefore = new Date(now - QUIET_DAYS * 86_400_000).toISOString();

    // The book page promotes statuses on load before it reads. Doing the same
    // here is what stops this page saying "8 active" and the book saying 9.
    try { await supabase.rpc("promote_policy_status"); } catch { /* read-only fallback */ }

    const [leadsRes, bookRes, retentionRes] = await Promise.all([
      supabase
        .from("clients")
        .select("stage, temperature, last_opened_at, created_at")
        .eq("agent_id", userId),
      // Widest view this person has: the SQL degrades agency to team, and team
      // to just-them, so this is the same set the Book of Business page opens
      // on. The two must agree — a count here that the page it links to
      // contradicts is worse than no count.
      supabase.rpc("get_book_of_business", { _scope: "agency" }),
      supabase.from("retention_cases").select("status, premium_at_risk"),
    ]);

    const leads = (leadsRes.data ?? []) as any[];
    const open = leads.filter((c) => c.stage !== "sold");

    const policies = (bookRes.data ?? []) as any[];
    const active = policies.filter((p) => p.status === "active");

    // A case nobody has resolved either way. Same definition the retention
    // page's default "live" filter uses.
    const cases = (retentionRes.data ?? []) as any[];
    const live = cases.filter((c) => c.status === "open" || c.status === "working");
    const saved = cases.filter((c) => c.status === "saved").length;
    const lost = cases.filter((c) => c.status === "lost").length;

    return {
      pipeline: {
        working: open.length,
        hot: open.filter((c) => c.temperature === "hot").length,
        // Never opened counts as quiet once the lead is old enough itself, so
        // a lead added this morning is not immediately reported as neglected.
        quiet: open.filter((c) => (c.last_opened_at ?? c.created_at) < quietBefore).length,
      },
      book: {
        active: active.length,
        monthlyPremium: active.reduce((a, p) => a + Number(p.monthly_premium ?? 0), 0),
        pending: policies.filter(
          (p) => p.status === "issued_not_paid" || p.status === "in_review",
        ).length,
        placedThisMonth: policies.filter((p) => p.posted_at && p.posted_at >= monthStart).length,
      },
      // An empty queue and no access to one look identical from here, so the
      // page decides whether to show this block from the person's role, not
      // from whether these numbers came back zero.
      retention: {
        live: live.length,
        atRisk: live.reduce((a, c) => a + Number(c.premium_at_risk ?? 0), 0),
        saveRate: saved + lost > 0 ? saved / (saved + lost) : null,
      },
    };
  });
