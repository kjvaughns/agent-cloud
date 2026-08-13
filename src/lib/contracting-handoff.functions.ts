import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { recordAudit } from "@/lib/contracting-ops/audit";
import {
  resolveHandoffMethod, legacyFallbackUrl, buildHandoffUrl, hostOf,
  type HandoffMethod,
} from "@/lib/contracting-ops/handoff";
import { METHOD_LABELS, type ContractingMethod } from "@/lib/contracting-ops/types";

// Generated DB types predate these tables; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/**
 * The handoff: sending somebody out of Agent Cloud to finish contracting
 * elsewhere — SureLC, a carrier portal, an invitation link.
 *
 * Until now this was eight raw `<a href>`s. The click told the platform
 * nothing: not who left, not when, not whether they ever came back, and the
 * URL was whatever happened to be in one of three uncoordinated columns. The
 * whole funnel between "ready to submit" and "submitted" was dark — which is
 * precisely the stretch where contracting requests go to die.
 *
 * This is a server function rather than a redirect route on purpose. The
 * session lives in localStorage and reaches the server only on the
 * `Authorization` header the server-function client attaches; a plain link
 * navigation carries nothing a handler could authenticate. So the click calls
 * here first — identity, resolution, telemetry — and the browser opens the
 * returned URL. Same single click, same record, no second auth system.
 *
 * The URL is built server-side. `{npn}`-style placeholders are filled from
 * the agent's profile *here*, so prefill data rides only in the one URL the
 * browser is about to visit — never parked in a client-visible payload, which
 * is the specific leak the incumbent product ships (personal emails in a
 * `cc=` query string handed to every agent's browser).
 */

export const beginContractingHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      request_id: z.string().uuid(),
      /** A specific configured method; omitted means "the right one". */
      method_id: z.string().uuid().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Through the caller's own client: RLS on contracting_requests already
    // says who may see a request (the agent, their upline chain, org staff),
    // and the set of people who may see one is exactly the set who may open
    // its portal. A request outside that set reads as absent, not forbidden.
    const { data: request, error } = await supabase
      .from("contracting_requests")
      .select("id, organization_id, agent_id, org_carrier_id, contract_type, status, submission_method")
      .eq("id", data.request_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!request) throw new Error("That request is not yours to open, or it no longer exists.");

    const [{ data: methods }, { data: carrier }, { data: agent }] = await Promise.all([
      supabaseAdmin.from("org_carrier_methods")
        .select("id, method, applies_to, target_url, target_email, instructions, is_default, sort_order")
        .eq("org_carrier_id", request.org_carrier_id)
        .order("sort_order"),
      supabaseAdmin.from("org_carriers")
        .select("surelc_url, contracting_portal_url, invitation_link, contracting_email, carriers ( name )")
        .eq("id", request.org_carrier_id)
        .maybeSingle(),
      supabaseAdmin.from("profiles")
        .select("npn_number, first_name, last_name, email")
        .eq("id", request.agent_id)
        .maybeSingle(),
    ]);

    const method = resolveHandoffMethod((methods ?? []) as HandoffMethod[], request.contract_type, data.method_id);
    if (data.method_id && !method) {
      // An id that is not one of this carrier's methods. The caller is a
      // browser; being asked for a foreign method id is refused, not honoured.
      throw new Error("That submission method doesn't belong to this carrier.");
    }

    // The template: the method's own URL, or the legacy column that predates
    // method rows. `email` resolves to a mailto either way.
    const template =
      (method?.method === "email"
        ? (method.target_email ? `mailto:${method.target_email}` : null)
        : method?.target_url)
      ?? legacyFallbackUrl(carrier, method?.method ?? "surelc")
      ?? legacyFallbackUrl(carrier, "carrier_portal")
      ?? legacyFallbackUrl(carrier, "invitation_link");

    const carrierName = carrier?.carriers?.name ?? "this carrier";
    if (!template) {
      throw new Error(
        `No submission destination is configured for ${carrierName}. ` +
        `Add one under Contracting Ops → Carriers → Submission methods.`,
      );
    }

    const url = buildHandoffUrl(template, {
      npn: agent?.npn_number,
      first_name: agent?.first_name,
      last_name: agent?.last_name,
      email: agent?.email,
    });

    const methodKind = (method?.method ?? "other") as ContractingMethod;

    // ── The record, which is the point ──────────────────────────────────────

    // One submissions row per handoff. `payload_snapshot` carries the
    // *template*, not the substituted URL: the prefilled URL holds the agent's
    // NPN and email, and duplicating those into a second table buys nothing.
    const { data: submission } = await supabaseAdmin
      .from("contracting_submissions")
      .insert({
        organization_id: request.organization_id,
        request_id: request.id,
        artifact_type: "portal_handoff",
        method: methodKind,
        generated_by: userId,
        payload_snapshot: {
          method_id: method?.id ?? null,
          url_host: hostOf(url),
          template,
          resolved_from: method ? "method" : "legacy_column",
        },
      })
      .select("id")
      .maybeSingle();

    // First-ever writer of submission_method — the column has existed and been
    // CHECK-constrained since 20260803120000 with nothing populating it. Only
    // stamped while the request is still on its way out the door; a handoff
    // re-opened after submission must not rewrite history.
    if (!request.submission_method && !["submitted", "carrier_reviewing", "approved", "writing_number_issued", "declined", "closed", "cancelled"].includes(request.status)) {
      await supabaseAdmin
        .from("contracting_requests")
        .update({ submission_method: methodKind })
        .eq("id", request.id);
    }

    const headers = getRequestHeaders();
    await recordAudit({
      organizationId: request.organization_id,
      actorId: userId,
      action: "handoff.opened",
      recordType: "contracting_requests",
      recordId: request.id,
      subjectAgentId: request.agent_id,
      metadata: { method: methodKind, method_id: method?.id ?? null, url_host: hostOf(url), submission_id: submission?.id ?? null },
      ipAddress: getRequestIP({ xForwardedFor: true }) ?? null,
      userAgent: headers.get("user-agent") ?? null,
    });

    return {
      url,
      method: methodKind,
      method_label: METHOD_LABELS[methodKind] ?? methodKind,
      instructions: method?.instructions ?? null,
    };
  });
