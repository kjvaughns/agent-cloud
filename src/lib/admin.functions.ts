import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectDuplicate } from "@/lib/import-helpers";
import { calculateAndInsertAllCommissions } from "@/lib/commission-calculator";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadWritingNumbers, recordWritingNumber, writingNumberKey } from "@/lib/writing-numbers";

type Ctx = { supabase: any; userId: string };

// limit(1), not maybeSingle(): users legitimately hold several of these roles
// at once, and maybeSingle() errors on multiple rows. Legacy "admin" counts.
async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "agency_owner", "admin"])
    .limit(1);
  if (!data?.length) throw new Error("Forbidden: admin role required");
}

/**
 * The platform, not an agency.
 *
 * `admin` and `agency_owner` are agency-level roles in this schema —
 * is_org_admin() grants on both — so requireAdmin above is "runs *an*
 * agency", not "runs Agent Cloud". Anything touching rows every tenant reads
 * (the shared carrier catalogue, the default commission grids) has to ask the
 * narrower question, or one agency edits what all of them see.
 */
async function requirePlatformAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1);
  if (!data?.length) {
    throw new Error(
      "This edits the shared catalogue every agency reads, so it's restricted to Agent Cloud staff. " +
      "To add a carrier for your own agency, use Contracting → Carrier Setup.",
    );
  }
}

/**
 * Everything the platform portal reads, gated the way the portal now is.
 *
 * This allowed `manager` — so an agency manager could call the functions
 * behind /admin directly and list every agent, contract, ticket and comp grid
 * the caller's row-level security would return. The route guard has been
 * narrowed to super_admin; a guard on the route with a wider one on the API
 * behind it is not access control, it is a hidden button.
 *
 * Every caller of this lives under src/routes/admin.* or
 * src/components/admin/, checked before the change, so narrowing it does not
 * take a function away from a page that legitimately used it.
 *
 * The name stays because seventeen call sites read better as one rename than
 * as a diff that also changes what they mean.
 */
async function requireManagerOrAdmin(supabase: any, userId: string) {
  await requirePlatformAdmin(supabase, userId);
}

export const adminListAllAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, status, created_at, upline_id, npn_number, last_active_at")
      .order("created_at", { ascending: false });
    const agentIds = (data ?? []).map((p: any) => p.id);
    const { data: contracts } = await supabase
      .from("contract_requests")
      .select("agent_id, status")
      .in("agent_id", agentIds);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", agentIds);
    return { agents: data ?? [], contracts: contracts ?? [], roles: roles ?? [] };
  });

export const adminSetAgentRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_user_id: z.string().uuid(),
      role: z.enum(["agent", "manager", "admin"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    if (data.role === "agent") {
      await supabase.from("user_roles").delete().eq("user_id", data.target_user_id);
    } else {
      await supabase.from("user_roles").upsert(
        { user_id: data.target_user_id, role: data.role },
        { onConflict: "user_id" }
      );
    }
    return { ok: true };
  });

export const adminListAllContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data } = await supabase
      .from("contract_requests")
      .select("*, profiles!agent_id(first_name, last_name, email), carriers(name, agent_portal_url)")
      .order("requested_at", { ascending: false });
    return { rows: data ?? [] };
  });

export const adminUpdateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.string().optional(),
      writing_number: z.string().optional(),
      issue_description: z.string().optional(),
      activated_at: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { id, ...patch } = data;
    if (patch.status === "active" && !patch.activated_at) {
      (patch as any).activated_at = new Date().toISOString();
    }
    const { error } = await supabase.from("contract_requests").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListCommissionGrid = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data: grids } = await supabase
      .from("commission_grids")
      .select("*, carriers(name)")
      .order("carrier_id");
    const { data: assignments } = await supabase
      .from("agent_commission_levels")
      .select("*, profiles!agent_id(first_name, last_name), carriers(name)");
    return { grids: grids ?? [], assignments: assignments ?? [] };
  });

export const adminUpsertCommissionRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      carrier_id: z.string().uuid(),
      product_name: z.string(),
      level_name: z.string().optional(),
      age_group_min: z.number().optional(),
      age_group_max: z.number().optional(),
      year_1_pct: z.number(),
      years_2_5_pct: z.number(),
      years_6_plus_pct: z.number(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requirePlatformAdmin(supabase, userId);
    if (data.id) {
      const { id, ...patch } = data;
      await supabase.from("commission_grids").update(patch).eq("id", id);
    } else {
      await supabase.from("commission_grids").insert(data);
    }
    return { ok: true };
  });

export const adminAssignAgentLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agent_id: z.string().uuid(),
      carrier_id: z.string().uuid(),
      level_pct: z.number().min(0).max(200),
      level_name: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    await supabase.from("agent_commission_levels").upsert(
      {
        agent_id: data.agent_id,
        carrier_id: data.carrier_id,
        assigned_pct: data.level_pct,
        commission_level: data.level_name ?? null,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,carrier_id" }
    );
    return { ok: true };
  });

export const adminCreateCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1),
      pay_frequency: z.string().optional(),
      contracting_speed_days: z.number().optional(),
      is_annuity_carrier: z.boolean().optional(),
      agent_portal_url: z.string().optional(),
      active: z.boolean().optional(),
      surelc_carrier_code: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requirePlatformAdmin(supabase, userId);
    const { error } = await (supabase as any).from("carriers").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      pay_frequency: z.string().optional(),
      contracting_speed_days: z.number().optional(),
      is_annuity_carrier: z.boolean().optional(),
      agent_portal_url: z.string().optional(),
      active: z.boolean().optional(),
      surelc_carrier_code: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requirePlatformAdmin(supabase, userId);
    const { id, ...patch } = data;
    const { error } = await (supabase as any).from("carriers").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data } = await supabase
      .from("support_tickets")
      .select("*, profiles!agent_id(first_name, last_name, email, phone, avatar_url)")
      .order("created_at", { ascending: false });
    return { tickets: data ?? [] };
  });

export const adminGetTicketThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data: messages } = await supabase
      .from("support_ticket_messages")
      .select("*, profiles!sender_id(first_name, last_name, avatar_url)")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });
    return { messages: messages ?? [] };
  });

export const adminReplyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ticket_id: z.string().uuid(),
      body: z.string().min(1),
      new_status: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    await supabase.from("support_ticket_messages").insert({
      ticket_id: data.ticket_id,
      sender_id: userId,
      sender_role: "support",
      body: data.body,
    });
    if (data.new_status) {
      await supabase.from("support_tickets").update({
        status: data.new_status,
        updated_at: new Date().toISOString(),
      }).eq("id", data.ticket_id);
    }
    return { ok: true };
  });

export const adminMoveAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agent_id: z.string().uuid(),
      new_upline_id: z.string().uuid().nullable(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);

    if (data.new_upline_id === data.agent_id) {
      throw new Error("An agent cannot report to themselves.");
    }

    // ── No loops ───────────────────────────────────────────────────────────
    //
    // Nothing stopped an admin pointing an agent's upline at somebody already
    // beneath them. That makes a cycle in profiles.upline_id, and every query
    // that walks the chain — my_scopes(), get_team_downline_for(), the team
    // matrix — either recurses until Postgres stops it or silently returns a
    // partial tree. A structure nobody can see is broken is worse than a
    // refused edit, and this is the only place that writes the column by hand.
    //
    // Walking up from the proposed upline is the cheap direction: an agency
    // hierarchy is shallow, and the loop stops the moment it reaches a root.
    if (data.new_upline_id) {
      const seen = new Set<string>([data.agent_id]);
      let cursor: string | null = data.new_upline_id;

      while (cursor) {
        if (seen.has(cursor)) {
          throw new Error(
            "That would put this agent above their own upline. Move the other agent first.",
          );
        }
        seen.add(cursor);
        const parentRes: { data: { upline_id: string | null } | null } = await supabase
          .from("profiles").select("upline_id").eq("id", cursor).maybeSingle();
        cursor = parentRes.data?.upline_id ?? null;
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ upline_id: data.new_upline_id })
      .eq("id", data.agent_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminBatchInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      agents: z.array(z.object({
        email: z.string().email(),
        first_name: z.string(),
        last_name: z.string(),
      })),
      tier_assignments: z.record(z.string(), z.number()),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    const carrierAssignments = Object.entries(data.tier_assignments).map(
      ([carrier_id, level_pct]) => ({ carrier_id, level_pct })
    );
    const { hasOpenInvitation, auditInvitation } = await import("@/lib/invitations/lookup.server");
    const { data: inviterProfile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const organizationId = (inviterProfile as any)?.organization_id ?? null;

    const results = [];
    for (const agent of data.agents) {
      // One live invitation per person per agency. Two of them is how somebody
      // ends up with two accounts on two rungs under two uplines, decided by
      // whichever link they happened to click — and a batch paste with a
      // repeated address made exactly that, silently.
      if (await hasOpenInvitation(supabase, { email: agent.email, organizationId })) {
        results.push({
          email: agent.email,
          ok: false,
          token: null,
          error: "There is already an open invitation for that email address.",
        });
        continue;
      }

      // Create placeholder auth user so the agent appears in the roster immediately
      const { data: authData } = await (supabaseAdmin as any).auth.admin.createUser({
        email: agent.email,
        email_confirm: true,
        user_metadata: { first_name: agent.first_name, last_name: agent.last_name },
      });
      if (authData?.user) {
        await (supabaseAdmin as any).from("profiles").update({
          first_name: agent.first_name,
          last_name: agent.last_name,
          status: "imported",
          upline_id: userId,
        }).eq("id", authData.user.id);
      }

      const token = crypto.randomUUID();
      const { error } = await supabase.from("invitation_links").insert({
        created_by: userId,
        name: `Invite for ${agent.first_name} ${agent.last_name}`,
        token,
        new_agent_email: agent.email,
        new_agent_first_name: agent.first_name,
        new_agent_last_name: agent.last_name,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        carrier_assignments: carrierAssignments,
        is_reusable: false,
        organization_id: organizationId,
      });
      if (!error) {
        await auditInvitation("invitation.created", {
          organizationId,
          performedBy: userId,
          targetUserId: authData?.user?.id ?? null,
          next: {
            email: agent.email,
            source: "admin_batch",
            carrier_assignments: carrierAssignments,
          },
        });
        const { queueEmail } = await import("@/lib/email/send.server");
        await queueEmail({
          template: "agent-invited",
          to: agent.email,
          profileId: authData?.user?.id ?? null,
          category: "transactional",
          key: `agent-invited:${token}`,
          data: {
            firstName: agent.first_name,
            inviteUrl: `${(await import("@/lib/email/send.server")).APP_ORIGIN}/join/${token}`,
          },
        });
      }
      results.push({ email: agent.email, ok: !error, token });

    }
    return { results };
  });

export const adminCreateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(200),
      body_html: z.string().min(1),
      is_pinned: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { error } = await supabase.from("announcements").insert({
      title: data.title,
      body_html: data.body_html,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200).optional(),
      body_html: z.string().min(1).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { id, ...patch } = data;
    const { error } = await supabase.from("announcements").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    // .select("id") so an RLS-filtered delete is reported rather than
    // returning ok. Postgres does not treat "matched no rows" as an error,
    // so this used to succeed silently and the announcement stayed on screen
    // until the next refresh brought it back.
    const { data: gone, error } = await supabase
      .from("announcements").delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) {
      throw new Error("That announcement is no longer there, or it is not yours to delete.");
    }
    return { ok: true };
  });

// ─── Spreadsheet Import ─────────────────────────────────────────────────────
export const adminImportBookXLS = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_agent_id: z.string().uuid(),
      parsed: z.object({
        teamRoster: z.array(z.any()),
        bookOfBusiness: z.array(z.any()),
        allClients: z.array(z.any()),
        clientNotes: z.array(z.any()),
      }),
      duplicate_mode: z.enum(["review", "merge", "skip"]).default("merge"),
      import_roster: z.boolean().default(true),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);

    const { data: job, error: jobErr } = await supabase
      .from("import_jobs")
      .insert({
        agent_id: data.target_agent_id,
        source: "agentlink_xls",
        status: "running",
        total_found: data.parsed.allClients.length + data.parsed.bookOfBusiness.length,
      })
      .select("id")
      .single();
    if (jobErr) throw new Error(`Failed to create import job: ${jobErr.message}`);
    const jobId = job.id;

    let clientsImported = 0, policiesImported = 0, notesImported = 0,
      duplicatesFound = 0, skipped = 0, rosterStored = 0;

    // Build agent name → id lookup map
    const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name");
    const agentNameMap = new Map<string, string>();
    for (const p of profiles ?? []) {
      agentNameMap.set(`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim().toLowerCase(), p.id);
    }
    const findAgent = (name: string) => agentNameMap.get(name.trim().toLowerCase()) ?? null;

    // ── STEP 1: Store Team Roster ──
    if (data.import_roster) {
      for (const agent of data.parsed.teamRoster) {
        if (!agent.email) continue;
        const nameParts = (agent.name ?? "").trim().split(" ");
        const { error } = await supabase.from("migration_roster").upsert(
          {
            email: agent.email.toLowerCase().trim(),
            full_name: agent.name,
            first_name: nameParts.slice(0, -1).join(" ") || agent.name,
            last_name: nameParts.slice(-1)[0] || "",
            status: agent.status,
            location: agent.location,
            depth: agent.depth,
            contracts_ratio: agent.contractsRatio,
            upline_name: agent.upline,
            date_joined: agent.dateJoined,
            last_active: agent.lastActive,
            source: "agentlink_xls",
            import_job_id: jobId,
            raw: agent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );
        if (!error) rosterStored++;
      }
    }

    // clientName → client_id for policy/note linking
    const clientNameToId = new Map<string, string>();

    // ── STEP 2: Import All Clients ──
    for (const client of data.parsed.allClients) {
      if (!client.firstName && !client.lastName) { skipped++; continue; }

      const dup = await detectDuplicate(supabase, data.target_agent_id, {
        phone: client.phone,
        first_name: client.firstName,
        last_name: client.lastName,
        dob: client.dateOfBirth || null,
      });

      if (dup) {
        duplicatesFound++;
        await supabase.from("import_duplicates").insert({
          import_job_id: jobId,
          agent_id: data.target_agent_id,
          match_type: dup.type,
          confidence: dup.confidence,
          incoming_data: client,
          existing_client_id: dup.existing_client_id,
          resolution: data.duplicate_mode === "merge" ? "merge"
            : data.duplicate_mode === "skip" ? "skip" : "pending",
        });

        if (data.duplicate_mode === "merge") {
          const patch: any = {};
          if (client.email) patch.email = client.email;
          if (client.streetAddress) patch.street_address = client.streetAddress;
          if (client.city) patch.city = client.city;
          if (client.state) patch.state = client.state;
          if (client.zip) patch.zip_code = client.zip;
          if (client.dateOfBirth) patch.date_of_birth = client.dateOfBirth;
          if (client.medicalNotes) patch.medical_conditions = client.medicalNotes;
          if (client.smoker !== undefined) patch.tobacco_use = client.smoker;
          if (Object.keys(patch).length > 0) {
            await supabase.from("clients").update(patch).eq("id", dup.existing_client_id);
          }
          clientNameToId.set(`${client.firstName} ${client.lastName}`.toLowerCase(), dup.existing_client_id);
          clientsImported++;
        } else {
          skipped++;
        }
        continue;
      }

      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          agent_id: data.target_agent_id,
          first_name: client.firstName,
          last_name: client.lastName,
          phone: client.phone || null,
          email: client.email || null,
          date_of_birth: client.dateOfBirth || null,
          street_address: client.streetAddress || null,
          city: client.city || null,
          state: client.state || null,
          zip_code: client.zip || null,
          stage: client.stage,
          temperature: "cold",
          tobacco_use: client.smoker,
          medical_conditions: client.medicalNotes || null,
        })
        .select("id")
        .single();

      if (clientErr) {
        if (clientErr.code === "23505") duplicatesFound++;
        skipped++;
        continue;
      }

      clientsImported++;
      clientNameToId.set(`${client.firstName} ${client.lastName}`.toLowerCase(), newClient.id);

      if (client.reminderNotes?.trim()) {
        await supabase.from("contact_history").insert({
          client_id: newClient.id,
          agent_id: data.target_agent_id,
          contact_type: "note",
          note: `[Reminder] ${client.reminderNotes}`,
          is_auto: false,
        });
      }
    }

    // ── STEP 3: Import Book of Business ──
    const parseDate = (d: string) => {
      if (!d?.includes("/")) return null;
      const p = d.split("/");
      return p.length === 3 ? `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}` : null;
    };

    for (const policy of data.parsed.bookOfBusiness) {
      let clientId = clientNameToId.get(policy.clientName.toLowerCase());
      if (!clientId) {
        const { data: found } = await supabase
          .from("clients")
          .select("id")
          .eq("agent_id", data.target_agent_id)
          .ilike("first_name", policy.clientFirstName)
          .ilike("last_name", policy.clientLastName)
          .maybeSingle();
        if (!found) { skipped++; continue; }
        clientId = found.id;
        clientNameToId.set(policy.clientName.toLowerCase(), found.id);
      }

      const writingAgentId = findAgent(policy.agentName) ?? data.target_agent_id;

      if (policy.policyNumber && policy.policyNumber !== "0000") {
        const { data: existingPol } = await supabase
          .from("policies")
          .select("id")
          .eq("agent_id", data.target_agent_id)
          .eq("policy_number", policy.policyNumber)
          .maybeSingle();
        if (existingPol) { skipped++; continue; }
      }

      const { data: carrier } = await supabase
        .from("carriers")
        .select("id")
        .ilike("name", `%${policy.carrier}%`)
        .maybeSingle();

      const effectiveDate = parseDate(policy.effectiveDate);
      const postedDateStr = parseDate(policy.postedDate);

      const { error: polErr } = await supabase.from("policies").insert({
        client_id: clientId,
        agent_id: writingAgentId,
        carrier_id: carrier?.id ?? null,
        product: policy.product,
        policy_number: policy.policyNumber || null,
        monthly_premium: policy.monthlyPremium,
        annual_premium: policy.annualPremium,
        effective_date: effectiveDate,
        status: "active",
        posted_at: postedDateStr ? new Date(postedDateStr).toISOString() : new Date().toISOString(),
      });

      if (!polErr) {
        policiesImported++;
        await supabase.from("clients").update({ stage: "sold" }).eq("id", clientId).eq("stage", "new");
      } else {
        skipped++;
      }
    }

    // ── STEP 4: Import Client Notes ──
    for (const note of data.parsed.clientNotes) {
      const clientId = clientNameToId.get(note.clientName.toLowerCase());
      if (!clientId) { skipped++; continue; }
      await supabase.from("contact_history").insert({
        client_id: clientId,
        agent_id: data.target_agent_id,
        contact_type: note.noteType === "medical" ? "medical_note" : "note",
        note: `[Book Import — ${note.date}] ${note.content}`,
        is_auto: false,
        created_at: note.date ? new Date(note.date).toISOString() : new Date().toISOString(),
      });
      notesImported++;
    }

    await supabase.from("import_jobs").update({
      status: "done",
      imported: clientsImported,
      duplicates_found: duplicatesFound,
      skipped,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    return {
      job_id: jobId,
      clients_imported: clientsImported,
      policies_imported: policiesImported,
      notes_imported: notesImported,
      roster_stored: rosterStored,
      duplicates_found: duplicatesFound,
      skipped,
    };
  });

// ─── List Scrape Requests (admin) ─────────────────────────────────────────────
export const adminListScrapeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data } = await supabase
      .from("scrape_requests")
      .select("*, profiles!requesting_agent_id(first_name, last_name, email, phone)")
      .order("submitted_at", { ascending: false });
    return { requests: data ?? [] };
  });

// ─── Update Scrape Request (admin) ────────────────────────────────────────────
export const adminUpdateScrapeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "in_progress", "completed", "failed"]),
      admin_notes: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const patch: any = { status: data.status };
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;
    if (data.status === "completed" || data.status === "failed") {
      patch.completed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("scrape_requests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Comp Level Editor ----------

export const adminListAgentCompLevels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data: levels, error } = await supabase
      .from("agent_commission_levels")
      .select("*, carriers(name)")
      .eq("agent_id", data.agent_id)
      .order("assigned_at", { ascending: false });
    if (error) throw new Error(error.message);

    // The number shown here now comes from the authoritative table, so this
    // editor and the agent's own Contracts page can no longer disagree — which
    // they routinely did, since this column was the only one this screen wrote
    // and the Contracts page never read it.
    const numbers = await loadWritingNumbers(supabase, [data.agent_id]);
    return (levels ?? []).map((l: any) => ({
      ...l,
      writing_number:
        numbers.get(writingNumberKey(data.agent_id, l.carrier_id)) ?? l.writing_number ?? null,
    }));
  });

export const adminSetCompLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    agent_id: z.string().uuid(),
    carrier_id: z.string().uuid(),
    assigned_pct: z.number().min(0).max(999),
    commission_level: z.string().optional(),
    writing_number: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { error } = await supabase.from("agent_commission_levels").upsert({
      agent_id: data.agent_id,
      carrier_id: data.carrier_id,
      assigned_pct: data.assigned_pct,
      commission_level: data.commission_level ?? `${data.assigned_pct}%`,
      // Still written: see the note on the dual write in @/lib/writing-numbers.
      // This column was the third store for a writing number and the only one
      // this editor ever touched, so a number set here was invisible to the
      // agent's own Contracts page and to the ops table alike.
      writing_number: data.writing_number ?? null,
      assigned_by: userId,
      assigned_at: new Date().toISOString(),
    }, { onConflict: "agent_id,carrier_id" });
    if (error) throw new Error(error.message);

    if (data.writing_number) {
      const { data: agent } = await supabase
        .from("profiles").select("organization_id").eq("id", data.agent_id).maybeSingle();
      await recordWritingNumber(supabase, {
        agentId: data.agent_id,
        orgId: agent?.organization_id ?? null,
        carrierId: data.carrier_id,
        writingNumber: data.writing_number,
        // An admin recording a number on somebody else's behalf.
        source: "manual_entry",
      });
    }

    try {
      await supabase.from("admin_audit_log").insert({
        admin_id: userId,
        action: "comp_level_change",
        target_type: "agent",
        target_id: data.agent_id,
        details: { carrier_id: data.carrier_id, assigned_pct: data.assigned_pct, commission_level: data.commission_level },
      });
    } catch {}
    return { ok: true };
  });

export const adminAssignAllCarriers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    agent_id: z.string().uuid(),
    assigned_pct: z.number().min(0).max(999),
    commission_level: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);
    const { data: carriers, error: cErr } = await supabase
      .from("carriers")
      .select("id")
      .eq("active", true);
    if (cErr) throw new Error(cErr.message);
    const now = new Date().toISOString();
    const rows = (carriers ?? []).map((c: any) => ({
      agent_id: data.agent_id,
      carrier_id: c.id,
      assigned_pct: data.assigned_pct,
      commission_level: data.commission_level,
      assigned_by: userId,
      assigned_at: now,
    }));
    if (rows.length) {
      const { error } = await supabase
        .from("agent_commission_levels")
        .upsert(rows, { onConflict: "agent_id,carrier_id" });
      if (error) throw new Error(error.message);
    }
    return { carriers_assigned: rows.length, contracts_created: 0 };
  });

export const listAllCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data } = await supabase
      .from("carriers")
      .select("id, name, active")
      .eq("active", true)
      .order("name");
    return (data ?? []) as { id: string; name: string; active: boolean }[];
  });

export const listCarrierGridLevels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ carrier_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: rows } = await supabase
      .from("commission_grids")
      .select("level_name, year_1_pct")
      .eq("carrier_id", data.carrier_id)
      .not("level_name", "is", null)
      .order("year_1_pct", { ascending: false });
    // Deduplicate: keep highest year_1_pct per level_name
    const seen = new Map<string, number>();
    for (const r of rows ?? []) {
      if (r.level_name && !seen.has(r.level_name)) seen.set(r.level_name, Number(r.year_1_pct));
    }
    return Array.from(seen.entries()).map(([level_name, max_pct]) => ({ level_name, max_pct }));
  });

export const runCommissionBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);

    const { data: queue } = await supabase
      .from("commission_backfill_queue")
      .select("id, policy_id")
      .eq("processed", false)
      .limit(50);

    let processed = 0, errors = 0;

    for (const item of queue ?? []) {
      try {
        const { data: policy } = await supabase
          .from("policies")
          .select("id, agent_id, carrier_id, product, annual_premium, monthly_premium, effective_date, clients(first_name, last_name)")
          .eq("id", item.policy_id)
          .single();

        if (!policy) continue;

        const cl = policy.clients as any;
        const clientName = cl ? `${cl.first_name ?? ""} ${cl.last_name ?? ""}`.trim() : "—";

        await calculateAndInsertAllCommissions(supabase, {
          policyId: policy.id,
          agentId: policy.agent_id,
          carrierId: policy.carrier_id,
          product: policy.product ?? "",
          monthlyPremium: Number(policy.monthly_premium ?? 0),
          effectiveDate: policy.effective_date || new Date().toISOString().slice(0, 10),
          clientName,
        });

        await supabase.from("commission_backfill_queue").update({ processed: true }).eq("id", item.id);
        processed++;
      } catch (e: any) {
        console.error("Backfill error for policy", item.policy_id, e.message);
        errors++;
      }
    }

    return { processed, errors, remaining: Math.max(0, (queue?.length ?? 0) - processed - errors) };
  });

export const adminBackfillCommissionGrids = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdmin(supabase, userId);
    return { ok: true, message: "No backfill needed" };
  });

export const adminSyncAgentByNpn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_agent_id: z.string().uuid(),
      npn: z.string().min(1).max(20),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireManagerOrAdmin(supabase, userId);

    const { syncProducerByNpn } = await import("@/lib/agentsync.service");
    const result = await syncProducerByNpn(data.npn);
    if (!result) throw new Error("AgentSync is not configured on this server.");

    let licensesImported = 0;
    for (const lic of result.licenses) {
      const loas: any[] = Array.isArray(lic.loas) && lic.loas.length > 0 ? lic.loas : [null];
      for (const loaEntry of loas) {
        const loaName = typeof loaEntry === "string" ? loaEntry : (loaEntry?.name ?? loaEntry?.loa ?? null);
        const row = {
          agent_id: data.target_agent_id,
          state_code: lic.state_code,
          license_number: lic.license_number ?? null,
          license_type: lic.license_type ?? null,
          loa: loaName,
          issued_date: lic.issued_date ?? null,
          expires_date: lic.expires_date ?? null,
          is_resident: lic.is_resident ?? false,
        };
        const { error } = await supabase
          .from("state_licenses")
          .upsert(row, { onConflict: "agent_id,state_code,loa" });
        if (!error) licensesImported++;
      }
    }

    await supabase.from("profiles").update({ npn_number: data.npn }).eq("id", data.target_agent_id);

    return { licenses_imported: licensesImported };
  });

export const saveExtractedGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      carrier_id: z.string().uuid(),
      rows: z
        .array(
          z.object({
            product_name: z.string().min(1).max(200),
            level_name: z.string().min(1).max(100),
            year_1_pct: z.number().min(0).max(999),
            years_2_5_pct: z.number().min(0).max(999).default(0),
            years_6_plus_pct: z.number().min(0).max(999).default(0),
          })
        )
        .min(1)
        .max(5000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requirePlatformAdmin(supabase, userId);

    // Scoped to the platform's own rows.
    //
    // This delete used to filter on carrier_id alone. requireAdmin admits
    // agency_owner and /admin admits agency owners, so one owner pressing
    // "AI Upload" for a carrier wiped the shared defaults *and* every other
    // agency's grids for it — silently, since the insert that followed only
    // restored their own. `comp-grid.functions.ts:224` scopes the same delete
    // correctly; this one never did.
    const { error: delErr } = await supabase
      .from("commission_grids")
      .delete()
      .eq("carrier_id", data.carrier_id)
      .is("organization_id", null);
    if (delErr) throw new Error(delErr.message);

    const insertRows = data.rows.map((r) => ({
      carrier_id: data.carrier_id,
      product_name: r.product_name,
      level_name: r.level_name,
      year_1_pct: r.year_1_pct,
      years_2_5_pct: r.years_2_5_pct,
      years_6_plus_pct: r.years_6_plus_pct,
    }));

    const { error: insErr } = await supabase.from("commission_grids").insert(insertRows);
    if (insErr) throw new Error(insErr.message);

    return { inserted: insertRows.length };
  });

/**
 * Applied database migrations, newest first.
 *
 * The migration log lives in an internal schema the app roles cannot read, so
 * this goes through a security-definer function that re-checks the admin role
 * itself. Read-only — nothing here runs SQL.
 */
export const adminListMigrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await requireAdmin(supabase, userId);

    const { data, error } = await (supabase as any).rpc("list_applied_migrations");
    if (error) throw new Error(error.message);

    return (data ?? []) as { version: string; name: string }[];
  });
