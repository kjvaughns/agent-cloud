import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/deals/social-security";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateAndInsertAllCommissions } from "@/lib/commission-calculator";
import { announceDeal } from "@/lib/discord.functions";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import { saleDateToTimestamp } from "@/lib/sale-date";

export const searchClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.q.trim()) return [];
    const term = `%${data.q.trim()}%`;
    const { data: rows, error } = await context.supabase
      .from("clients")
      .select("id, first_name, last_name, phone, date_of_birth")
      .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`)
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * The carriers this agency actually contracts with, and what each one writes.
 *
 * This queried the global `carriers` catalog, so an agency with two carriers
 * was offered thirteen — including eleven it has no relationship with. Posting
 * a deal against one of those produces a policy nobody can be paid on, and the
 * only thing standing in the way was a soft warning nobody reads.
 *
 * `org_carriers` is the agency's own list. `product_types` on it has existed
 * since the table was created and has never been read by a dropdown; it is what
 * narrows products to what the selected carrier actually offers.
 *
 * Returns the agency's carriers only. The caller groups them: ones the agent
 * personally holds a contract with first, the rest below a divider — an agent
 * may legitimately be writing under a just-in-time appointment, so the second
 * group is marked rather than hidden.
 */
export const listCarriersForDeal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getMyPrimaryOrgId(context.userId);
    if (!orgId) return [];

    // select("*") for the agency row: the post-deal controls arrive with
    // 20260814210000 and PostgREST rejects the whole select when it names a
    // column that does not exist yet.
    const { data, error } = await context.supabase
      .from("org_carriers")
      .select("*, carriers ( id, name, active )")
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    return (
      (data ?? [])
        // A carrier retired from the shared catalog stays out even if the agency
        // row is still active — the catalog is the authority on whether a carrier
        // is writing business at all.
        .filter((r: any) => r.carriers?.active !== false)
        // Only carriers the agency has actually opened for selling. Before the
        // migration these columns are absent and every active carrier shows,
        // which is today's behaviour; after it, an owner who has not finished
        // setting a carrier up cannot have an agent write on it by accident.
        .filter((r: any) => r.enabled !== false && r.available_for_post_deal !== false)
        .map((r: any) => ({
          id: r.carrier_id as string,
          name: (r.carriers?.name ?? "Carrier") as string,
          product_types: (r.product_types ?? []) as string[],
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
    );
  });

export const getMyActiveCarrierIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_commission_levels")
      .select("carrier_id")
      .eq("agent_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.carrier_id);
  });

const BeneficiarySchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).optional().or(z.literal("")),
  relationship: z.string().max(50).optional().or(z.literal("")),
  dob: z.string().optional().or(z.literal("")),
  percentage: z.number().min(0).max(100),
});

const PostDealSchema = z.object({
  client: z.object({
    existing_id: z.string().uuid().optional(),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(10).max(20),
    date_of_birth: z.string().min(8),
  }),
  policy: z.object({
    carrier_id: z.string().uuid(),
    product: z.string().min(1).max(100),
    policy_number: z.string().trim().max(60).optional().or(z.literal("")),
    effective_date: z.string().min(8),
    face_amount: z.number().min(0),
    monthly_premium: z.number().min(0),
    status: z.enum(["issued_not_paid", "in_review"]).default("issued_not_paid"),
    /**
     * When the business was written, which is the month it counts in on
     * production, the dashboard and the leaderboard. Optional: omitted, the
     * database derives it as before. Present, it is how an older policy typed
     * in today lands in the month it was actually sold.
     */
    sale_date: z.string().optional().or(z.literal("")),
  }),
  beneficiaries: z.array(BeneficiarySchema).max(10),
  notes: z.string().max(2000).optional().or(z.literal("")),
  /**
   * How the premium gets paid. Both parts optional — a policy is often posted
   * before billing is set up, and an empty block writes nothing at all.
   *
   * Deliberately only the method and the day. An account or routing number
   * would make this table worth stealing, and the platform does not need one
   * to run: it neither drafts the premium nor submits the application.
   */
  billing: z
    .object({
      payment_method: z.enum(PAYMENT_METHODS).optional(),
      // 1–28, matching the column's CHECK: a 30th does not exist in February,
      // and a draft day that skips a month is a lapse waiting to happen.
      draft_date: z.number().int().min(1).max(28).optional(),
    })
    .optional(),
});

export const postDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PostDealSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Validate beneficiary percentages
    if (data.beneficiaries.length > 0) {
      const sum = data.beneficiaries.reduce((acc, b) => acc + b.percentage, 0);
      if (Math.abs(sum - 100) > 0.01) {
        throw new Error("Beneficiary percentages must sum to 100%.");
      }
    }

    // Create or reuse client
    let clientId = data.client.existing_id;
    if (!clientId) {
      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          agent_id: userId,
          first_name: data.client.first_name,
          last_name: data.client.last_name,
          phone: data.client.phone,
          date_of_birth: data.client.date_of_birth,
          stage: "sold",
        })
        .select("id")
        .single();
      if (clientErr) throw new Error(clientErr.message);
      clientId = newClient.id;
    }

    // Create policy
    const annual = Number((data.policy.monthly_premium * 12).toFixed(2));
    const { data: policy, error: polErr } = await supabase
      .from("policies")
      .insert({
        client_id: clientId,
        agent_id: userId,
        carrier_id: data.policy.carrier_id,
        product: data.policy.product,
        policy_number: data.policy.policy_number || null,
        effective_date: data.policy.effective_date,
        face_amount: data.policy.face_amount,
        monthly_premium: data.policy.monthly_premium,
        annual_premium: annual,
        // The form asks for a monthly premium and annualises it by twelve, so
        // the mode is not a guess. Left null by this path until now, which
        // cost the lapse scorer a signal it explicitly looks for on every
        // manually posted deal.
        premium_mode: "monthly",
        status: data.policy.status ?? "issued_not_paid",
        // `production_date` is only named when the agent chose a sale date.
        // Left out, the BEFORE INSERT trigger derives it, which is right for a
        // deal written today; given, it is the agent telling us this business
        // is older than the moment they typed it in. `posted_at` stays the
        // real post time either way, for audit.
        ...(data.policy.sale_date
          ? {
              production_date: saleDateToTimestamp(data.policy.sale_date),
              production_date_set_by: userId,
              production_date_set_at: new Date().toISOString(),
            }
          : {}),
      } as never)

      .select("id")
      .single();
    if (polErr) throw new Error(polErr.message);

    // How the premium is paid, on the client rather than the policy — the
    // table is keyed one row per client, which is the right grain: a client
    // pays the same way for every policy they hold.
    //
    // Only the fields collected here are named, so an upsert cannot blank the
    // bank details somebody entered in the pipeline drawer. Nothing is written
    // when the agent left both blank; a row of nulls would be indistinguishable
    // from "we asked and they said none".
    if (data.billing?.payment_method || data.billing?.draft_date) {
      const { error: bankErr } = await supabase.from("client_banking").upsert(
        {
          client_id: clientId,
          ...(data.billing.payment_method ? { payment_method: data.billing.payment_method } : {}),
          ...(data.billing.draft_date ? { draft_date: data.billing.draft_date } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id" },
      );
      // Non-fatal, like the commission calculation below: the policy is
      // written and must not be lost because a billing preference would not
      // save. The agent can set it from the client drawer.
      if (bankErr) console.error("[post-deal] client_banking:", bankErr.message);
    }

    // The commission calculation must not fail the deal — the policy is
    // already written — but its OUTCOME is the agent's business. Silently
    // swallowing it is how somebody posts a deal, earns nothing, and has no
    // way to find out why.
    let compensation: { ok: boolean; messages: string[] } = { ok: true, messages: [] };
    try {
      const clientName = `${data.client.first_name} ${data.client.last_name}`.trim();
      await calculateAndInsertAllCommissions(supabase, {
        policyId: policy.id,
        agentId: userId,
        carrierId: data.policy.carrier_id,
        product: data.policy.product,
        monthlyPremium: data.policy.monthly_premium,
        effectiveDate: data.policy.effective_date,
        clientName,
      });
      // The calculator records why it could not pay rather than throwing, so
      // read that back rather than inferring from the absence of an exception.
      // Cast: generated DB types predate 20260814210000. Same pattern the
      // other modules use until they are regenerated.
      const { data: issue } = await (supabase as any)
        .from("commission_setup_issues")
        .select("messages")
        .eq("policy_id", policy.id)
        .is("resolved_at", null)
        .maybeSingle();
      if (issue?.messages?.length) compensation = { ok: false, messages: issue.messages };
    } catch (e: any) {
      console.error("[commission-calculator] failed for policy", policy.id, e?.message);
      compensation = {
        ok: false,
        messages: [
          `The commission could not be worked out: ${e?.message ?? "unknown error"}. Your agency has been notified.`,
        ],
      };
    }

    // Beneficiaries
    if (data.beneficiaries.length > 0) {
      const benRows = data.beneficiaries.map((b) => ({
        client_id: clientId,
        first_name: b.first_name,
        last_name: b.last_name || null,
        relationship: b.relationship || null,
        dob: b.dob || null,
        percentage: b.percentage,
      }));
      const { error: benErr } = await supabase.from("beneficiaries").insert(benRows);
      if (benErr) throw new Error(benErr.message);
    }

    // Notes -> client.notes (append)
    if (data.notes && data.notes.trim()) {
      await supabase.from("clients").update({ notes: data.notes }).eq("id", clientId);
    }

    // Announce in the agency's Discord, if they've connected one. Never
    // awaited into the failure path — a Discord outage must not fail a deal
    // that is already written. announceDeal swallows its own errors and
    // records them for the owner to see.
    void announceDeal(policy.id);

    return { policyId: policy.id, clientId, compensation };
  });

// ── Prefill from the pipeline ───────────────────────────────────────────────

/**
 * Everything already known about a client, for the Post a Deal form.
 *
 * Clicking "Post Deal" in the pipeline drawer used to pass only the client id,
 * which flipped the form to "existing" and left every field blank — so the
 * agent re-typed the name, phone, DOB, carrier, product, premium and
 * beneficiaries they had just entered on the client record.
 *
 * Reads through the RLS-bound client, so this can only ever return a client
 * the caller can already open.
 */
export const getClientDealPrefill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ client_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any; userId: string };

    const [{ data: client }, { data: policies }, { data: bens }, { data: banking }] =
      await Promise.all([
        supabase
          .from("clients")
          .select("id, first_name, last_name, phone, date_of_birth")
          .eq("id", data.client_id)
          .maybeSingle(),
        // Most recent policy entered on the client record — that is the one the
        // agent is posting.
        supabase
          .from("policies")
          .select(
            "carrier_id, product, policy_number, effective_date, face_amount, monthly_premium, status",
          )
          .eq("client_id", data.client_id)
          .order("posted_at", { ascending: false })
          .limit(1),
        supabase
          .from("beneficiaries")
          .select("first_name, last_name, relationship, dob, percentage")
          .eq("client_id", data.client_id),
        // Billing already on file, so re-posting a client does not ask again.
        supabase
          .from("client_banking")
          .select("payment_method, draft_date")
          .eq("client_id", data.client_id)
          .maybeSingle(),
      ]);

    if (!client) throw new Error("Client not found");

    const policy = (policies ?? [])[0] ?? null;

    return {
      client: {
        id: client.id as string,
        first_name: client.first_name ?? "",
        last_name: client.last_name ?? "",
        phone: client.phone ?? "",
        date_of_birth: client.date_of_birth ?? "",
      },
      policy: policy
        ? {
            carrier_id: policy.carrier_id ?? "",
            product: policy.product ?? "",
            policy_number: policy.policy_number ?? "",
            effective_date: policy.effective_date ?? "",
            face_amount: policy.face_amount != null ? String(policy.face_amount) : "",
            monthly_premium: policy.monthly_premium != null ? String(policy.monthly_premium) : "",
            // Only the two statuses Post a Deal offers; anything else is a
            // policy already past submission and should not preselect.
            status: (policy.status === "in_review" ? "in_review" : "issued_not_paid") as
              | "issued_not_paid"
              | "in_review",
          }
        : null,
      beneficiaries: (bens ?? []).map((b: any) => ({
        first_name: b.first_name ?? "",
        last_name: b.last_name ?? "",
        relationship: b.relationship ?? "",
        dob: b.dob ?? "",
        percentage: b.percentage != null ? String(b.percentage) : "",
      })),
      // Strings, matching the rest of this payload — the form holds every
      // field as a string and converts on submit.
      billing: {
        payment_method: (banking as any)?.payment_method ?? "",
        draft_date: (banking as any)?.draft_date != null ? String((banking as any).draft_date) : "",
      },
    };
  });
