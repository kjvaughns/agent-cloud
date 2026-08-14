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
  /**
   * Who can actually do this step.
   *
   * `agent` means only they can: bank details, the background disclosure, their
   * own legal name and date of birth. An agency owner must not attest to those
   * on somebody else's behalf, and the CTA becomes "Remind agent" rather than
   * pretending otherwise.
   *
   * `owner` means the agency legitimately does it — an E&O certificate or an
   * AML certificate is a document the agency collects and holds, and chasing
   * the agent for a PDF that is already in the owner's inbox is the workflow
   * this screen exists to remove.
   *
   * Declared on the step rather than inferred in the UI, because the UI has no
   * way to know which is which and guessing would put an owner's name on an
   * agent's disclosure.
   */
  actor: "agent" | "owner";
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
        .select("id, first_name, last_name, organization_id, status, npn_number, date_of_birth, ssn_last4, street_address, city, state, zip_code, upline_id, needs_transfer_request, drivers_license_number")
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
      { data: requests }, { data: ready }, { data: contractRecords },
      { data: banking }, { data: background }, { count: policyCount },
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
      // Contract records, which is where a contract that came in through an
      // import or was completed outside the queue actually lives. Reading only
      // the workflow table told agents with live carrier contracts that they
      // had not started contracting.
      supabaseAdmin.from("contract_requests")
        .select("id, status").eq("agent_id", agentId),
      // The four the dashboard banner used to chase separately, plus the
      // carrier release. Folded in here so removing that banner loses nothing.
      supabaseAdmin.from("producer_banking")
        .select("agent_id, account_last4").eq("agent_id", agentId).maybeSingle(),
      supabaseAdmin.from("background_questions")
        .select("id").eq("agent_id", agentId),
      // For the first-deal step. head + exact so this costs a count, not rows.
      supabaseAdmin.from("policies")
        .select("id", { count: "exact", head: true }).eq("agent_id", agentId),
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
    const records = contractRecords ?? [];
    const OPEN_STATUSES = ["approved", "writing_number_issued", "declined", "cancelled", "closed"];

    // A contract counts as live whichever half of the system knows about it:
    // the workflow reaching approval, or a record already sitting at active —
    // which is how every imported and externally-completed contract arrives.
    const recordLive = records.some((r: any) => r.status === "active");
    const contractingStarted = reqs.length > 0 || records.length > 0;
    const contractingLive = recordLive || reqs.some((r: any) =>
      ["approved", "writing_number_issued"].includes(r.status));
    const awaitingCarrier = reqs.some((r: any) => !OPEN_STATUSES.includes(r.status));
    // What the agent themselves is holding up, as distinct from what the
    // carrier is. Only the first is somebody's next action here.
    const needsAgent = reqs.some((r: any) =>
      ["missing_information", "missing_documents", "awaiting_agent", "nigo",
       "additional_info_requested"].includes(r.status));

    const readyToSell = (ready ?? []).some((r: any) => r.status === "ready");

    // The items the dashboard banner used to chase. A document counts as
    // present once uploaded here rather than approved: unlike E&O, nothing
    // downstream gates on somebody having reviewed them.
    const hasDoc = (type: string) => allDocs.some((d: any) => d.doc_type === type);
    const amlDone = hasDoc("aml_certificate");
    const licenceIdDone = hasDoc("drivers_license") || Boolean(agent.drivers_license_number);
    const bankingDone = Boolean(banking?.account_last4);
    const backgroundDone = (background ?? []).length > 0;
    const needsTransfer = Boolean(agent.needs_transfer_request);
    const firstDealDone = (policyCount ?? 0) > 0;

    // ── The list ────────────────────────────────────────────────────────────

    const steps: OnboardingStep[] = [
      {
        key: "join",
        actor: "owner",
        title: `${firstName} accepts the invite`,
        why: "Nothing else can start until they have an account.",
        done: joined,
        waiting: !joined,
        href: "/contracting/invite",
        cta: "Resend the invite",
      },
      {
        key: "identity",
        actor: "agent",
        title: "Fill in the details carriers ask for",
        why: "Legal name, NPN, date of birth and address. Every carrier packet needs these, and a missing one stops all of them at once.",
        done: identityDone,
        href: "/account/producer-profile",
        cta: "Open the profile",
      },
      {
        key: "licence",
        actor: "owner",
        title: "Add a state licence",
        why: "They cannot be appointed anywhere without one.",
        done: licenceDone,
        href: "/licensing",
        cta: "Add or import licences",
      },
      {
        key: "documents",
        actor: "owner",
        title: eoUploaded && !eoApproved ? "Approve the E&O certificate" : "Upload the E&O certificate",
        why: eoUploaded && !eoApproved
          ? "It is uploaded but not reviewed yet, so it does not count toward contracting."
          : "Carriers will not appoint an agent without current errors-and-omissions cover.",
        done: eoApproved,
        href: eoUploaded ? "/contracting-ops/documents" : "/account/producer-profile",
        cta: eoUploaded ? "Review the document" : "Upload it",
      },
      {
        key: "aml",
        actor: "owner",
        title: "Upload the AML certificate",
        why: "Anti-money-laundering training. Annuity carriers will not appoint without it.",
        done: amlDone,
        href: "/account/producer-profile",
        cta: "Upload it",
      },
      {
        key: "identification",
        actor: "owner",
        title: "Add a driver's licence",
        why: "Carriers use it to verify identity on the application.",
        done: licenceIdDone,
        href: "/account/producer-profile",
        cta: "Upload it",
      },
      {
        key: "background",
        actor: "agent",
        title: "Answer the background questions",
        why: "The producer disclosure. Every carrier packet includes it, and an unanswered one holds up the whole submission.",
        done: backgroundDone,
        href: "/account/producer-profile",
        cta: "Answer them",
      },
      {
        key: "banking",
        actor: "agent",
        title: "Add bank details",
        why: "Where commission gets paid. Nothing is blocked without it, but the first payment is.",
        done: bankingDone,
        href: "/account/producer-profile",
        cta: "Add them",
      },
      {
        key: "contracting",
        actor: "owner",
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
        actor: "owner",
        title: "Ready to sell",
        why: "Licensed, appointed and cleared to write in at least one state.",
        done: readyToSell || contractingLive,
        href: "/contracting-ops/requests",
        cta: "See where they can write",
      },
      {
        // The one step the New Agent Guide had that this list did not.
        //
        // Ready to Sell is the end of *onboarding* — appointed and cleared to
        // write. Actually writing something is the step after, and it was
        // tracked separately in `getOnboardingStatus`, which is how this list
        // and the Guide ended up disagreeing on membership as well as on count.
        // Adding it here makes this list a superset, so the Guide can render
        // from it without losing anything.
        key: "first_deal",
        actor: "agent",
        title: "Post the first policy",
        why: "Nothing is blocked without it, but the book, the commission forecast and the leaderboard all start here.",
        done: firstDealDone,
        waiting: !contractingLive,
        href: "/post-deal",
        cta: "Post a deal",
      },
    ];

    // A carrier release only applies to somebody moving from another upline,
    // so it is not a step everyone has. When it does apply it goes near the
    // front: the carrier will not process the contracting behind it.
    if (needsTransfer) {
      steps.splice(2, 0, {
        key: "transfer",
        actor: "owner",
        title: "Submit the carrier release",
        why: "Their previous upline has to release them before these carriers will contract them. Everything after this waits on it.",
        done: false,
        href: "/contracting/transfers",
        cta: "Complete the release",
      });
    }

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

    const [
      { data: profiles }, { data: licences }, { data: docs },
      { data: requests }, { data: contractRecords },
    ] = await Promise.all([
        supabaseAdmin.from("profiles")
          .select("id, first_name, last_name, status, npn_number, date_of_birth, ssn_last4, street_address, city, state, zip_code")
          .in("id", ids),
        supabaseAdmin.from("state_licenses").select("agent_id, expires_date").in("agent_id", ids),
        supabaseAdmin.from("producer_documents")
          .select("agent_id, doc_type, review_status, expiration_date").in("agent_id", ids),
        supabaseAdmin.from("contracting_requests").select("agent_id, status").in("agent_id", ids),
        supabaseAdmin.from("contract_requests").select("agent_id, status").in("agent_id", ids),
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
    const rec = byAgent(contractRecords);

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
      // Live in either half of the system — see getAgentOnboarding.
      const rs = req.get(p.id) ?? [];
      const live = rs.some((r: any) => ["approved", "writing_number_issued"].includes(r.status))
        || (rec.get(p.id) ?? []).some((r: any) => r.status === "active");
      const identity = Boolean(
        p.npn_number && p.date_of_birth && p.ssn_last4 &&
        p.street_address && p.city && p.state && p.zip_code);

      // `live` appeared twice in this array while `total` was hardcoded to 6,
      // so a contracted agent counted their contract as two completed steps and
      // could reach 6 of 6 having done four things. Both halves of that are
      // fixed by deriving the total from the list rather than asserting it.
      //
      // This is a roll-up across a whole roster, so it deliberately does NOT
      // call getAgentOnboarding per agent — that is eight queries each, which
      // on a fifty-agent roster is four hundred round trips to draw a progress
      // bar. It checks a subset of the same facts, batched. The subset is named
      // here so the divergence is visible rather than accidental.
      const checks = [p.status === "active", identity, hasLicence, hasEo, live];
      const done = checks.filter(Boolean).length;
      const total = checks.length;

      return {
        agent_id: p.id,
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unnamed agent",
        complete: done,
        total,
        pct: Math.round((done / total) * 100),
        finished: done === total,
      };
    });

    return {
      // Least finished first — the roster exists to surface who is stuck, and
      // sorting by name buries exactly that.
      agents: agents.filter((a) => !a.finished).sort((x, y) => x.complete - y.complete),
    };
  });
