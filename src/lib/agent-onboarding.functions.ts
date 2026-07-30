import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * Getting one agent ready to sell.
 *
 * Onboarding was five separate destinations — invite, profile, documents,
 * licensing, contracting — and nothing told you which one to open next. So the
 * common question ("what is Marcus waiting on?") could only be answered by
 * visiting all five and holding the answer in your head.
 *
 * This is that answer as one ordered list. Every step is derived from real
 * data, never a stored "step 3 done" flag, for the same reason the agency
 * setup checklist works that way: a flag can claim somebody is ready when
 * their licence has since expired. If the underlying fact goes away, the step
 * reopens.
 *
 * Deliberately does NOT re-decide carrier readiness. Whether a request can go
 * to a carrier is the readiness engine's call; this reports what that engine
 * already concluded. Two definitions of "ready" that can disagree is worse
 * than no checklist at all.
 */

export type OnboardingStep = {
  key: string;
  /** What to do, in the words somebody would say out loud. */
  title: string;
  /** Why it matters — what stays blocked while this is open. */
  why: string;
  done: boolean;
  /** Waiting on somebody else, so it is not this person's next action. */
  waiting?: boolean;
  href: string;
  cta: string;
};

const REQUIRED_DOC_TYPES = ["eo", "eo_certificate"];

export const getAgentOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const agentId = data.agent_id;

    const [{ data: me }, { data: agent }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, organization_id").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("profiles")
        .select("id, first_name, last_name, organization_id, status, npn_number, date_of_birth, ssn_last4, street_address, city, state, zip_code, upline_id")
        .eq("id", agentId).maybeSingle(),
    ]);

    if (!agent) throw new Error("Agent not found");

    // You may look at your own onboarding, or at somebody in your agency.
    // Anything else is not an error worth detailing — it is simply not yours.
    const sameOrg = Boolean(me?.organization_id) && me.organization_id === agent.organization_id;
    if (agentId !== userId && !sameOrg) throw new Error("Not available");

    const orgId = agent.organization_id ?? (await getMyPrimaryOrgId(userId));
    const today = new Date().toISOString().slice(0, 10);

    const [
      { data: producer }, { data: licences }, { data: docs },
      { data: requests }, { data: ready },
    ] = await Promise.all([
      supabaseAdmin.from("producer_profiles")
        .select("legal_first_name, legal_last_name, resident_state")
        .eq("profile_id", agentId).maybeSingle(),
      supabaseAdmin.from("state_licenses")
        .select("id, state_code, expires_date").eq("agent_id", agentId),
      supabaseAdmin.from("producer_documents")
        .select("id, doc_type, review_status, expiration_date").eq("agent_id", agentId),
      supabaseAdmin.from("contracting_requests")
        .select("id, status, readiness_state").eq("agent_id", agentId),
      supabaseAdmin.from("ready_to_sell_records")
        .select("id, status").eq("agent_id", agentId),
    ]);

    const name = `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim() || "This agent";
    const firstName = (agent.first_name ?? "").trim() || name;

    // ── Step facts ──────────────────────────────────────────────────────────

    const joined = agent.status === "active";

    const identityDone = Boolean(
      agent.npn_number && agent.date_of_birth && agent.ssn_last4 &&
      agent.street_address && agent.city && agent.state && agent.zip_code &&
      producer?.legal_first_name && producer?.legal_last_name && producer?.resident_state,
    );

    const liveLicences = (licences ?? []).filter(
      (l: any) => !l.expires_date || l.expires_date >= today);
    const licenceDone = liveLicences.length > 0;

    const allDocs = docs ?? [];
    const eoDocs = allDocs.filter((d: any) => REQUIRED_DOC_TYPES.includes(d.doc_type));
    const eoApproved = eoDocs.some((d: any) =>
      d.review_status === "approved" &&
      (!d.expiration_date || d.expiration_date >= today));
    const eoUploaded = eoDocs.length > 0;

    const reqs = requests ?? [];
    const OPEN_STATUSES = ["approved", "writing_number_issued", "declined", "cancelled", "closed"];
    const contractingStarted = reqs.length > 0;
    const contractingLive = reqs.some((r: any) =>
      ["approved", "writing_number_issued"].includes(r.status));
    const awaitingCarrier = reqs.some((r: any) => !OPEN_STATUSES.includes(r.status));
    // What the agent themselves is holding up, as distinct from what the
    // carrier is. Only the first is somebody's next action here.
    const needsAgent = reqs.some((r: any) =>
      ["missing_information", "missing_documents", "awaiting_agent", "nigo",
       "additional_info_requested"].includes(r.status));

    const readyToSell = (ready ?? []).some((r: any) => r.status === "ready");

    // ── The list ────────────────────────────────────────────────────────────

    const steps: OnboardingStep[] = [
      {
        key: "join",
        title: `${firstName} accepts the invite`,
        why: "Nothing else can start until they have an account.",
        done: joined,
        waiting: !joined,
        href: "/contracting/invite",
        cta: "Resend the invite",
      },
      {
        key: "identity",
        title: "Fill in the details carriers ask for",
        why: "Legal name, NPN, date of birth and address. Every carrier packet needs these, and a missing one stops all of them at once.",
        done: identityDone,
        href: "/account/producer-profile",
        cta: "Open the profile",
      },
      {
        key: "licence",
        title: "Add a state licence",
        why: "They cannot be appointed anywhere without one.",
        done: licenceDone,
        href: "/licensing",
        cta: "Add or import licences",
      },
      {
        key: "documents",
        title: eoUploaded && !eoApproved ? "Approve the E&O certificate" : "Upload the E&O certificate",
        why: eoUploaded && !eoApproved
          ? "It is uploaded but not reviewed yet, so it does not count toward contracting."
          : "Carriers will not appoint an agent without current errors-and-omissions cover.",
        done: eoApproved,
        href: eoUploaded ? "/contracting-ops/documents" : "/account/producer-profile",
        cta: eoUploaded ? "Review the document" : "Upload it",
      },
      {
        key: "contracting",
        title: contractingStarted ? "Finish the carrier requests" : "Request a carrier contract",
        why: needsAgent
          ? "A carrier sent something back, or is waiting on information only they can supply."
          : contractingStarted
            ? "Submitted and waiting on the carrier."
            : "Pick the carriers they will write on.",
        done: contractingLive,
        // Submitted and quiet is not somebody's next action; sent back is.
        waiting: contractingStarted && awaitingCarrier && !needsAgent,
        href: contractingStarted ? "/contracting-ops/requests" : "/contracting/carriers",
        cta: contractingStarted ? "Open the requests" : "Choose carriers",
      },
      {
        key: "ready",
        title: "Ready to sell",
        why: "Licensed, appointed and cleared to write in at least one state.",
        done: readyToSell || contractingLive,
        href: "/contracting-ops/ready-to-sell",
        cta: "See where they can write",
      },
    ];

    const complete = steps.filter((s) => s.done).length;
    // The one thing to do next: the first open step that is not simply waiting
    // on somebody else. Showing six things at once is what made this hard.
    const next = steps.find((s) => !s.done && !s.waiting)
      ?? steps.find((s) => !s.done)
      ?? null;

    return {
      agent_id: agentId,
      agent_name: name,
      first_name: firstName,
      organization_id: orgId,
      steps,
      next,
      complete,
      total: steps.length,
      pct: Math.round((complete / steps.length) * 100),
      finished: complete === steps.length,
    };
  });

/**
 * Everybody currently being onboarded, most-stuck first.
 *
 * The roster answer to the same question: not "how many agents do we have"
 * but "which one needs me today".
 */
export const listOnboardingProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { agents: [] };

    const { data: members } = await supabaseAdmin
      .from("organization_memberships").select("profile_id")
      .eq("organization_id", orgId).eq("status", "active");
    const ids = (members ?? []).map((m: any) => m.profile_id);
    if (!ids.length) return { agents: [] };

    const today = new Date().toISOString().slice(0, 10);

    const [{ data: profiles }, { data: licences }, { data: docs }, { data: requests }] =
      await Promise.all([
        supabaseAdmin.from("profiles")
          .select("id, first_name, last_name, status, npn_number, date_of_birth, ssn_last4, street_address, city, state, zip_code")
          .in("id", ids),
        supabaseAdmin.from("state_licenses").select("agent_id, expires_date").in("agent_id", ids),
        supabaseAdmin.from("producer_documents")
          .select("agent_id, doc_type, review_status, expiration_date").in("agent_id", ids),
        supabaseAdmin.from("contracting_requests").select("agent_id, status").in("agent_id", ids),
      ]);

    const byAgent = <T extends { agent_id: string }>(rows: T[] | null) => {
      const m = new Map<string, T[]>();
      for (const r of rows ?? []) {
        const list = m.get(r.agent_id) ?? [];
        list.push(r);
        m.set(r.agent_id, list);
      }
      return m;
    };

    const lic = byAgent(licences);
    const doc = byAgent(docs);
    const req = byAgent(requests);

    type Row = {
      agent_id: string; name: string;
      complete: number; total: number; pct: number; finished: boolean;
    };

    const agents: Row[] = (profiles ?? []).map((p: any): Row => {
      const hasLicence = (lic.get(p.id) ?? []).some(
        (l: any) => !l.expires_date || l.expires_date >= today);
      const hasEo = (doc.get(p.id) ?? []).some((d: any) =>
        REQUIRED_DOC_TYPES.includes(d.doc_type) && d.review_status === "approved" &&
        (!d.expiration_date || d.expiration_date >= today));
      const rs = req.get(p.id) ?? [];
      const live = rs.some((r: any) => ["approved", "writing_number_issued"].includes(r.status));
      const identity = Boolean(
        p.npn_number && p.date_of_birth && p.ssn_last4 &&
        p.street_address && p.city && p.state && p.zip_code);

      const done = [p.status === "active", identity, hasLicence, hasEo, live, live]
        .filter(Boolean).length;

      return {
        agent_id: p.id,
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unnamed agent",
        complete: done,
        total: 6,
        pct: Math.round((done / 6) * 100),
        finished: done === 6,
      };
    });

    return {
      // Least finished first — the roster exists to surface who is stuck, and
      // sorting by name buries exactly that.
      agents: agents.filter((a) => !a.finished).sort((x, y) => x.complete - y.complete),
    };
  });
