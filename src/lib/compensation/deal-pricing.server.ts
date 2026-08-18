/**
 * What a carrier offers, and what a deal on it needs before it can be priced.
 *
 * ── Why this exists ──
 *
 * `commission_grids` has carried products and age bands since the first
 * schema, and Post a Deal has never read them. So an agent picked a product
 * from a free list that had nothing to do with what the agency configured, and
 * every deal priced at the agent's flat level percentage regardless of what
 * the carrier actually pays at that age.
 *
 * This returns the products the agency configured for one carrier, and which
 * of age, state and tobacco class that carrier's grid actually varies on —
 * derived from the grid rather than configured separately, because the grid is
 * what decides. A carrier with no age bands must not make an agent enter a
 * date of birth to satisfy a form.
 *
 * ── Read-only ──
 *
 * Three selects and two pure functions. Nothing here writes, and nothing here
 * decides a percentage: `resolveCompensation` does that, and is given the same
 * rows.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import { ageOn, requirementsFor, type GridRow } from "@/lib/compensation/grid-rule";

import { preferOwnGridRows } from "@/lib/compensation/own-grid";

type Ctx = { supabase: any; userId: string };

/**
 * Rows for one carrier, in the shape the selector wants.
 *
 * `select("*")`: `state_code` and `risk_class` arrive with 20260815070000, and
 * naming a column PostgREST does not know fails the whole select rather than
 * omitting the field. Before that migration both read as null, which is
 * exactly "applies everywhere" — today's behaviour.
 */
export async function loadGridRows(
  supabase: any,
  orgId: string,
  carrierId: string,
): Promise<GridRow[]> {
  const { data } = await supabase
    .from("commission_grids")
    .select("*")
    .eq("carrier_id", carrierId)
    .or(`organization_id.eq.${orgId},organization_id.is.null`);

  // The agency's own rows shadow the shared defaults for that carrier, so a
  // grid edited in the editor prices deals with the edited numbers.
  return (preferOwnGridRows((data ?? []) as any[])).map((r) => ({
    id: String(r.id),
    levelName: r.level_name ?? null,
    productName: r.product_name ?? "",
    ageMin: r.age_group_min ?? null,
    ageMax: r.age_group_max ?? null,
    year1Pct: r.year_1_pct ?? null,
    years2to5Pct: r.years_2_5_pct ?? null,
    years6PlusPct: r.years_6_plus_pct ?? null,
    stateCode: r.state_code ?? null,
    riskClass: r.risk_class ?? null,
  }));
}

/**
 * The three facts a grid rates on, for a policy that already exists.
 *
 * ── Why they are read here rather than asked for ──
 *
 * A carrier grid varies by age, state and tobacco. None of the three were ever
 * reaching the pricing: `commission_grids` carried the age bands, `selectGridRule`
 * knew how to use them, and the one function that writes commission schedules
 * took a `CommissionInput` with no age, no state and no risk class on it. So
 * the grid tier was fully built and fully dead — an 82 year old was paid the
 * band-less rate, and the calculator's own comment said so.
 *
 * They did not need to be asked for. Pipeline already collects all three on the
 * client: `clients.date_of_birth`, `clients.state`, and `client_health.tobacco_use`.
 * Reading them from the policy's own client is the difference between a form
 * that asks an agent for facts the agency already holds, and one that does not.
 *
 * ── Age on the effective date, not today ──
 *
 * A carrier rates the age the insured was when the policy was written. Using
 * today's age would move a deal into a different band on its own birthday and
 * silently repay every renewal from then on at a different rate.
 *
 * Every field is optional and null is a legitimate answer: a client with no
 * date of birth simply matches no age-banded row, which is `selectGridRule`'s
 * existing behaviour and leaves the flat percentage in charge.
 */
export async function loadDealFacts(
  supabase: any,
  policyId: string,
  effectiveDate: string,
): Promise<{ age: number | null; state: string | null; riskClass: string | null }> {
  const none = { age: null, state: null, riskClass: null };

  const { data: policy } = await supabase
    .from("policies").select("client_id").eq("id", policyId).maybeSingle();
  if (!policy?.client_id) return none;

  const { data: client } = await supabase
    .from("clients").select("date_of_birth, state").eq("id", policy.client_id).maybeSingle();

  // `client_health` is not in the generated types and may predate a migration
  // on some projects. A missing table means "we do not know", not a failed
  // policy write — this runs inside the commission calculator.
  let riskClass: string | null = null;
  try {
    const { data: health, error } = await supabase
      .from("client_health").select("tobacco_use").eq("client_id", policy.client_id).maybeSingle();
    if (!error && health?.tobacco_use != null) {
      riskClass = health.tobacco_use ? "tobacco" : "non_tobacco";
    }
  } catch {
    riskClass = null;
  }

  return {
    age: client?.date_of_birth ? ageOn(client.date_of_birth, effectiveDate) : null,
    state: client?.state ?? null,
    riskClass,
  };
}

export const getCarrierDealOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  /**
   * A `carriers.id`, which is what every caller actually holds.
   *
   * ── The bug this signature is fixing ──
   *
   * This took `orgCarrierId` and looked it up as the PRIMARY KEY of
   * `org_carriers`. Post a Deal passed `selectedCarrier.id`, and
   * `listCarriersForDeal` maps `id: r.carrier_id` — a `carriers.id`. The two
   * are different rows in different tables, so the lookup never matched, the
   * function always answered `{ available: false, products: [] }`, and the form
   * fell through to the generic catalogue without a word. The grid-products
   * work shipped twice and has never once run in production.
   *
   * `carriers.id` is the id the rest of the system is keyed on —
   * `commission_grids.carrier_id`, `agent_commission_levels.carrier_id`, the
   * deal's own `carrier_id`. `org_carriers.id` is needed at exactly one point
   * below, and this function is reading that row anyway, so it resolves it
   * here rather than asking two screens to each work it out.
   *
   * `orgCarrierId` is still accepted so a client cached mid-deploy does not
   * 400; it can go a release later.
   */
  .inputValidator((d: unknown) =>
    z
      .object({
        carrierId: z.string().uuid().optional(),
        orgCarrierId: z.string().uuid().optional(),
      })
      .refine((v) => Boolean(v.carrierId) !== Boolean(v.orgCarrierId), {
        message: "Pass exactly one of carrierId or orgCarrierId",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) {
      return { available: false as const, products: [], needsAge: false, needsState: false, needsRisk: false };
    }

    // RLS-bound read: an agent asking about a carrier in another agency gets
    // nothing back rather than a shaped-but-empty answer. `org_carriers` is
    // unique on (organization_id, carrier_id), so either lookup is single-row.
    //
    // Deliberately NOT `resolveOrgCarrierId` — that one CREATES the link when
    // it is missing, and a dropdown reading what a carrier offers must never
    // enrol the agency on a carrier as a side effect of being looked at.
    const link = supabase
      .from("org_carriers")
      .select("id, carrier_id, organization_id")
      .eq("organization_id", orgId);
    const { data: oc } = await (data.carrierId
      ? link.eq("carrier_id", data.carrierId)
      : link.eq("id", data.orgCarrierId!)
    ).maybeSingle();

    // The grid is keyed on `carriers.id` and does not need the agency link
    // row to exist. When the caller named the carrier we can answer even for a
    // carrier the agency has no `org_carriers` row for; only the level mapping
    // below needs the link, and that degrades to "no level" on its own.
    const carrierId: string | null = data.carrierId ?? oc?.carrier_id ?? null;
    if (!carrierId) {
      return { available: false as const, products: [], needsAge: false, needsState: false, needsRisk: false };
    }

    // The carrier's own name for this agent's level. The grid is keyed on it,
    // not on the agency's label for the rung.
    const [{ data: contract }, { data: profile }] = await Promise.all([
      supabase
        .from("agent_commission_levels")
        .select("commission_level")
        .eq("agent_id", userId)
        .eq("carrier_id", carrierId)
        .maybeSingle(),
      supabase.from("profiles").select("agency_level_id").eq("id", userId).maybeSingle(),
    ]);

    let levelName: string | null = contract?.commission_level ?? null;
    if (!levelName && profile?.agency_level_id && oc?.id) {
      const { data: mapping } = await supabase
        .from("agency_level_carrier_mappings")
        .select("carrier_level_name")
        .eq("organization_id", orgId)
        .eq("agency_level_id", profile.agency_level_id)
        .eq("org_carrier_id", oc.id)
        .maybeSingle();
      levelName = mapping?.carrier_level_name ?? null;
    }

    const rows = await loadGridRows(supabase, orgId, carrierId);
    const req = requirementsFor(rows, levelName);

    return {
      available: true as const,
      carrierLevelName: levelName,
      /**
       * Empty is a legitimate answer, not an error. An agency with no grid
       * pays from the level percentage, and the form falls back to its own
       * product list rather than refusing to let anybody post a deal.
       */
      products: req.products,
      needsAge: req.needsAge,
      needsState: req.needsState,
      needsRisk: req.needsRisk,
    };
  });
