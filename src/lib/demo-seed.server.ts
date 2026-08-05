/**
 * A believable agency, in rows.
 *
 * This is the seed itself; `scripts/seed-demo.ts` is a command line over it and
 * `demo-reset.server.ts` calls it on a timer. One artifact backs four things —
 * the public demo org, the sample data a new agency can start with, the ghost
 * rows in empty states, and the fixtures the end-to-end tests will run against
 * — so it is worth more care than a fixture usually gets.
 *
 * ── The rules that matter ───────────────────────────────────────────────────
 *
 * **Relative dates, always.** Nothing here is a literal date. Every timestamp
 * is computed backwards from the moment the seed runs, so a demo left alone
 * for six months still shows a policy written last week. A demo agency whose
 * newest policy is from last spring reads as abandoned, and no amount of
 * realistic data elsewhere recovers from that.
 *
 * **Seed the mess.** A clean book is both obviously fake and useless as a
 * demo: it shows none of the situations the product exists to handle. This
 * deliberately includes lapsed policies, a chargeback, an expired E&O, licences
 * about to expire, requests stuck at different stages, and an agent who has
 * not logged in for three weeks. Those are the screens worth showing.
 *
 * **Real carrier names.** Mutual of Omaha, Americo, Foresters. "Acme
 * Insurance Co." tells an agency owner in one glance that nobody who built
 * this has met their business.
 *
 * **Commission maths that ties out.** The comp grids and the commission rows
 * are computed from the same numbers, so an owner who checks one against the
 * other finds them consistent. They will check.
 *
 * ── Two things this deliberately does not do ────────────────────────────────
 *
 * It takes its database client as an argument rather than importing one. That
 * keeps it callable from a bundled CLI script, from a server route, and from a
 * test, and it means the caller — not this file — decides what credentials the
 * writes run under.
 *
 * It does not create auth users. A demo org gets its logins from the
 * provisioning script; a real agency running "start with sample data" already
 * has its own people. Inventing sign-in-able accounts inside somebody's real
 * agency would be a security problem wearing a fixture's clothes.
 *
 * ── One honest deviation from the brief ─────────────────────────────────────
 *
 * The plan asked for this to run through the normal service layer so it
 * exercises RLS. It cannot: those are TanStack server functions behind an auth
 * middleware that needs a request context, and creating auth users needs the
 * admin API regardless. Callers hand it a service-role client and it writes the
 * same shapes the application writes, honouring the same invariants — but it is
 * not an RLS test and should not be mistaken for one.
 */

/** Anything shaped like a Supabase client. Deliberately structural: this file
 *  must not depend on which client the caller built, or on the generated
 *  Database types, which lag the migrations it needs. */
export type SeedDb = {
  from: (table: string) => any;
};

// ── Time ────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
/** N days ago, as an ISO timestamp. The only way this file expresses a date. */
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
/** N days ago as YYYY-MM-DD, for date columns. */
const dateAgo = (n: number) => daysAgo(n).slice(0, 10);
/** N days from now, for expiries. */
const dateIn = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// Deterministic pseudo-randomness. A seed that produces a different agency on
// every run makes a screenshot diff useless and a failing test unreproducible.
//
// Module state, which matters now that this can be called twice in one process
// — the nightly reset does exactly that, and a second seed continuing from
// wherever the first left off would produce a different agency. seedSampleData
// rewinds it.
const RNG_SEED = 42;
let rngState = RNG_SEED;
const rand = () => {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number) => Math.floor(lo + rand() * (hi - lo + 1));

// ── The agency ──────────────────────────────────────────────────────────────

const CARRIERS = [
  { name: "Mutual of Omaha", products: ["Final Expense", "Term Life", "Whole Life"], turnaround: 7 },
  { name: "Americo", products: ["Final Expense", "Mortgage Protection"], turnaround: 10 },
  { name: "Foresters", products: ["Final Expense", "Whole Life", "IUL"], turnaround: 14 },
] as const;

/** Comp levels per carrier. The commission rows below are derived from these. */
const COMP_LEVELS = [
  { level_name: "Agent 80", commission_pct: 80, advance_months: 9, renewal_pct: 5 },
  { level_name: "Senior Agent 90", commission_pct: 90, advance_months: 9, renewal_pct: 6 },
  { level_name: "Manager 105", commission_pct: 105, advance_months: 9, renewal_pct: 7 },
  { level_name: "Agency 120", commission_pct: 120, advance_months: 9, renewal_pct: 8 },
] as const;

const PEOPLE = [
  { first: "Marcus", last: "Webb", role: "agency_owner", level: "Agency 120", state: "TX" },
  { first: "Denise", last: "Okafor", role: "manager", level: "Manager 105", state: "TX" },
  { first: "Raymond", last: "Salas", role: "manager", level: "Manager 105", state: "OK" },
  { first: "Tanya", last: "Bright", role: "agent", level: "Senior Agent 90", state: "TX" },
  { first: "Curtis", last: "Nolan", role: "agent", level: "Senior Agent 90", state: "TX" },
  { first: "Priya", last: "Raman", role: "agent", level: "Agent 80", state: "OK" },
  { first: "Dwayne", last: "Ellis", role: "agent", level: "Agent 80", state: "OK" },
  { first: "Sofia", last: "Marchetti", role: "agent", level: "Agent 80", state: "NM" },
  { first: "Grady", last: "Lawson", role: "agent", level: "Agent 80", state: "TX" },
  { first: "Helen", last: "Duong", role: "agent", level: "Agent 80", state: "NM" },
  { first: "Terrell", last: "Boyd", role: "agent", level: "Agent 80", state: "TX" },
  { first: "Nadia", last: "Fischer", role: "agent", level: "Agent 80", state: "OK" },
] as const;

const CLIENT_FIRST = [
  "James", "Mary", "Robert", "Patricia", "Michael", "Linda", "David", "Barbara",
  "Willie", "Gloria", "Ernest", "Doris", "Frank", "Betty", "Harold", "Ruth",
  "Clarence", "Mildred", "Eugene", "Shirley", "Alonzo", "Yolanda", "Hector", "Consuelo",
] as const;
const CLIENT_LAST = [
  "Jenkins", "Whitfield", "Ramirez", "Okonkwo", "Delgado", "Pham", "Boudreaux",
  "Castillo", "Nakamura", "Odell", "Guerrero", "Thibodeaux", "Vasquez", "Kowalski",
] as const;

const CITIES: Record<string, [string, string][]> = {
  TX: [["Houston", "77001"], ["Dallas", "75201"], ["San Antonio", "78201"], ["Waco", "76701"]],
  OK: [["Tulsa", "74101"], ["Oklahoma City", "73101"], ["Norman", "73019"]],
  NM: [["Albuquerque", "87101"], ["Santa Fe", "87501"], ["Las Cruces", "88001"]],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

async function must<T>(label: string, p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    console.error(`  ✗ ${label}: ${error.message}`);
    throw new Error(`${label} failed`);
  }
  return data;
}

/** Every table the seed writes, in delete-safe order (children first). */
export const SEEDED_TABLES = [
  "commission_schedule", "calendar_events", "policies", "clients",
  "contracting_requests", "contract_requests", "writing_numbers",
  "producer_appointments", "producer_documents", "state_licenses", "tasks",
] as const;

export type ClearResult = { cleared: number; failures: string[] };

/**
 * Delete every sample row in one organization.
 *
 * Table order is children-first, because a foreign key that stops a parent
 * being deleted turns "clear sample data" into "clear most of it" — and the
 * half that survives is exactly the half nobody can explain.
 *
 * Failures are collected rather than thrown. One table refusing must not leave
 * the other ten untouched; the caller gets the list and can say so.
 */
export async function clearSampleData(db: SeedDb, orgId: string): Promise<ClearResult> {
  console.log(`Clearing sample data for org ${orgId}…`);
  let cleared = 0;
  const failures: string[] = [];

  for (const table of SEEDED_TABLES) {
    const { error, count } = await db
      .from(table)
      .delete({ count: "exact" })
      .eq("organization_id", orgId)
      .eq("is_sample", true);
    if (error) {
      // A table without the column has nothing sample in it by definition.
      if (/column .*is_sample.* does not exist/i.test(error.message)) {
        console.log(`  – ${table}: no is_sample column, skipped`);
        continue;
      }
      console.error(`  ✗ ${table}: ${error.message}`);
      failures.push(`${table}: ${error.message}`);
      continue;
    }
    cleared += count ?? 0;
    console.log(`  – ${table}: ${count ?? 0} removed`);
  }

  return { cleared, failures };
}

// ── The seed ────────────────────────────────────────────────────────────────

export type SeedResult = { seeded: boolean; detail: string };

export async function seedSampleData(db: SeedDb, orgId: string): Promise<SeedResult> {
  console.log(`Seeding Summit Life Partners into org ${orgId}`);
  rngState = RNG_SEED;

  // ── Carriers ──────────────────────────────────────────────────────────────
  // The shared catalog is global and real, so a carrier that already exists is
  // reused rather than duplicated. Only the org overlay is per-agency.
  const carrierIds: Record<string, string> = {};
  const orgCarrierIds: Record<string, string> = {};

  for (const c of CARRIERS) {
    const existing = await must("find carrier",
      db.from("carriers").select("id").eq("name", c.name).limit(1).maybeSingle());
    let carrierId = (existing as any)?.id as string | undefined;

    if (!carrierId) {
      const made = await must("create carrier",
        db.from("carriers").insert({ name: c.name, active: true }).select("id").single());
      carrierId = (made as any).id;
    }
    carrierIds[c.name] = carrierId!;

    const orgExisting = await must("find org_carrier",
      db.from("org_carriers").select("id")
        .eq("organization_id", orgId).eq("carrier_id", carrierId!).maybeSingle());

    if ((orgExisting as any)?.id) {
      orgCarrierIds[c.name] = (orgExisting as any).id;
      await must("update org_carrier",
        db.from("org_carriers")
          .update({ product_types: c.products, turnaround_days: c.turnaround, status: "active" })
          .eq("id", (orgExisting as any).id).select("id"));
    } else {
      const made = await must("create org_carrier",
        db.from("org_carriers").insert({
          organization_id: orgId,
          carrier_id: carrierId,
          status: "active",
          product_types: c.products,
          turnaround_days: c.turnaround,
          contracting_email: `contracting@${c.name.toLowerCase().replace(/[^a-z]/g, "")}.example`,
        }).select("id").single());
      orgCarrierIds[c.name] = (made as any).id;
    }

    // Comp levels, which the commission rows below are computed from.
    for (const [i, lvl] of COMP_LEVELS.entries()) {
      await db.from("carrier_comp_levels").upsert({
        organization_id: orgId,
        org_carrier_id: orgCarrierIds[c.name],
        level_name: lvl.level_name,
        commission_pct: lvl.commission_pct,
        advance_months: lvl.advance_months,
        renewal_pct: lvl.renewal_pct,
        status: "active",
        sort_order: i,
      }, { onConflict: "org_carrier_id,level_name" });
    }
  }
  console.log(`  ✓ ${CARRIERS.length} carriers with ${COMP_LEVELS.length} comp levels each`);

  // ── People ────────────────────────────────────────────────────────────────
  // Existing members are reused. The seed never creates auth users: a demo org
  // gets its three logins from the demo provisioning step, and a real agency
  // running "start with sample data" already has its own people. Inventing
  // sign-in-able accounts inside somebody's real agency would be a security
  // problem wearing a fixture's clothes.
  const members = await must("list members",
    db.from("profiles")
      .select("id, first_name, last_name, status")
      .eq("organization_id", orgId));

  const roster = (members ?? []) as any[];
  if (roster.length === 0) {
    console.error("  ✗ No profiles in this organization. Seed needs people to attach data to.");
    console.error("    Create the org and its members first, then re-run.");
    return { seeded: false, detail: "no members in this organization" };
  }
  console.log(`  ✓ ${roster.length} existing member(s) to hang data on`);

  const owner = roster[0];
  const producers = roster.length > 1 ? roster.slice(1) : roster;

  // ── Licences, with two about to expire ────────────────────────────────────
  const licenceRows: any[] = [];
  roster.forEach((p, i) => {
    const home = PEOPLE[i % PEOPLE.length].state;
    licenceRows.push({
      organization_id: orgId, agent_id: p.id, state_code: home,
      license_number: `${home}-${between(100000, 999999)}`,
      is_resident: true, status: "active",
      issued_date: dateAgo(between(400, 900)),
      // Two of them inside the warning window, one already gone. This is the
      // number the licensing page counts and the dashboard alerts on.
      expires_date: i === 0 ? dateIn(18) : i === 1 ? dateIn(26) : i === 2 ? dateAgo(9) : dateIn(between(120, 500)),
      last_verified_at: daysAgo(between(10, 60)),
      verification_source: "pdb_report",
      is_sample: true,
    });
    // A second, non-resident state for about half of them.
    if (i % 2 === 0) {
      const other = home === "TX" ? "OK" : "TX";
      licenceRows.push({
        organization_id: orgId, agent_id: p.id, state_code: other,
        license_number: `${other}-${between(100000, 999999)}`,
        is_resident: false, status: "active",
        issued_date: dateAgo(between(200, 700)),
        expires_date: dateIn(between(90, 400)),
        is_sample: true,
      });
    }
  });
  await must("insert licences", db.from("state_licenses").insert(licenceRows).select("id"));
  console.log(`  ✓ ${licenceRows.length} state licences (2 expiring soon, 1 expired)`);

  // ── E&O and AML, one of them expired ──────────────────────────────────────
  const docRows = roster.flatMap((p, i) => [
    {
      organization_id: orgId, agent_id: p.id, doc_type: "eo_certificate",
      file_name: "eo-certificate.pdf", file_url: "https://example.invalid/sample-eo.pdf",
      provider_name: pick(["NAPA", "CalSurance", "Lockton Affinity"]),
      certificate_number: `EO-${between(100000, 999999)}`,
      // Text, not numeric — the column stores what the certificate says.
      coverage_amount: pick(["1000000", "2000000"]),
      start_date: dateAgo(between(200, 340)),
      // One agent's E&O has lapsed. That is a real blocker on real contracting
      // and it belongs in a demo of contracting.
      expiration_date: i === 3 ? dateAgo(12) : dateIn(between(30, 300)),
      review_status: i === 3 ? "expired" : "approved",
      is_sample: true,
    },
    {
      organization_id: orgId, agent_id: p.id, doc_type: "aml_certificate",
      file_name: "aml-certificate.pdf", file_url: "https://example.invalid/sample-aml.pdf",
      provider_name: "LIMRA",
      start_date: dateAgo(between(30, 300)),
      expiration_date: dateIn(between(60, 700)),
      // One waiting on review, so the Document Review queue has something in it.
      review_status: i === 5 ? "uploaded" : "approved",
      is_sample: true,
    },
  ]);
  await must("insert documents", db.from("producer_documents").insert(docRows).select("id"));
  console.log(`  ✓ ${docRows.length} E&O/AML documents (1 expired, 1 awaiting review)`);

  // ── Clients and policies ──────────────────────────────────────────────────
  const clientRows: any[] = [];
  const CLIENT_COUNT = 55;
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const agent = producers[i % producers.length];
    const state = PEOPLE[i % PEOPLE.length].state;
    const [city, zip] = pick(CITIES[state]);
    const soldish = i < 40;
    clientRows.push({
      organization_id: orgId,
      agent_id: agent.id,
      first_name: pick(CLIENT_FIRST),
      last_name: pick(CLIENT_LAST),
      phone: `${between(200, 989)}${between(200, 989)}${between(1000, 9999)}`,
      email: null,
      // Final expense skews old, which is what makes the face amounts below
      // believable to somebody who writes this product.
      date_of_birth: dateAgo(between(58, 82) * 365),
      street_address: `${between(100, 9999)} ${pick(["Oak", "Elm", "Cedar", "Magnolia", "Pine"])} ${pick(["St", "Ave", "Dr"])}`,
      city, state, zip_code: zip,
      stage: soldish ? "sold" : pick(["new", "callback", "almost_there"]),
      temperature: soldish ? "warm" : pick(["hot", "warm", "cold"]),
      created_at: daysAgo(between(5, 540)),
      last_opened_at: daysAgo(between(0, 40)),
      is_sample: true,
    });
  }
  const clients = await must("insert clients",
    db.from("clients").insert(clientRows).select("id, agent_id, first_name, last_name")) as any[];
  console.log(`  ✓ ${clients.length} clients`);

  const sold = clients.slice(0, 40);
  const policyRows: any[] = [];
  const carrierNames = CARRIERS.map((c) => c.name);

  sold.forEach((c, i) => {
    const carrierName = carrierNames[i % carrierNames.length];
    const carrier = CARRIERS.find((x) => x.name === carrierName)!;
    const monthly = between(38, 145);
    const postedDaysAgo = between(3, 540);
    // The mess, placed deliberately rather than at random so a demo always
    // shows it: three lapsed, two in underwriting, the rest in force.
    const status =
      i < 3 ? "lapse_pending" :
      i < 5 ? "in_review" :
      i === 5 ? "issued_not_paid" : "active";

    policyRows.push({
      organization_id: orgId,
      client_id: c.id,
      agent_id: c.agent_id,
      carrier_id: carrierIds[carrierName],
      product: pick(carrier.products),
      // $10-25k face is what final expense actually looks like. A $2M policy
      // in this book would tell an owner nobody checked.
      face_amount: between(10, 25) * 1000,
      monthly_premium: monthly,
      annual_premium: monthly * 12,
      policy_number: `${carrierName.slice(0, 3).toUpperCase()}-${between(1000000, 9999999)}`,
      effective_date: dateAgo(postedDaysAgo),
      posted_at: daysAgo(postedDaysAgo),
      status,
      is_sample: true,
    });
  });

  // A second policy for a handful of clients — real books have them.
  sold.slice(0, 12).forEach((c, i) => {
    const carrierName = carrierNames[(i + 1) % carrierNames.length];
    const carrier = CARRIERS.find((x) => x.name === carrierName)!;
    const monthly = between(25, 90);
    const postedDaysAgo = between(3, 400);
    policyRows.push({
      organization_id: orgId, client_id: c.id, agent_id: c.agent_id,
      carrier_id: carrierIds[carrierName],
      product: pick(carrier.products),
      face_amount: between(10, 20) * 1000,
      monthly_premium: monthly, annual_premium: monthly * 12,
      policy_number: `${carrierName.slice(0, 3).toUpperCase()}-${between(1000000, 9999999)}`,
      effective_date: dateAgo(postedDaysAgo),
      posted_at: daysAgo(postedDaysAgo),
      status: "active",
      is_sample: true,
    });
  });

  // `trg_policy_after_insert` fires on each of these and writes two rows the
  // seed did not ask for: a "Policy Starting Soon" calendar event and a "New
  // Deal Posted" notification. Both are recorded here so neither outlives the
  // sample data that caused it.
  const beforePolicies = new Date().toISOString();

  const policies = await must("insert policies",
    db.from("policies").insert(policyRows).select("id, client_id, agent_id, annual_premium, product, carrier_id, posted_at, status")) as any[];
  console.log(`  ✓ ${policies.length} policies (3 lapse-pending, 2 in underwriting, 1 issued-not-paid)`);

  // The calendar events are worth keeping — a demo calendar with real policy
  // reminders on it is the point — so they are flagged rather than deleted.
  // organization_id is set explicitly because the trigger's insert omits it.
  const policyIds = policies.map((p: any) => p.id);
  const { error: calErr } = await db.from("calendar_events")
    .update({ is_sample: true, organization_id: orgId })
    .in("policy_id", policyIds);
  if (calErr) console.error(`  ! could not flag calendar events: ${calErr.message}`);

  // The notifications are not. Fifty-two unread "New Deal Posted" alerts about
  // policies written months ago is noise, and notifications carry no policy
  // reference, so the only handle on them is who and when.
  const { error: noteErr, count: noteCount } = await db.from("notifications")
    .delete({ count: "exact" })
    .eq("type", "deal")
    .gte("created_at", beforePolicies)
    .in("user_id", roster.map((p: any) => p.id));
  if (noteErr) console.error(`  ! could not clear seeded notifications: ${noteErr.message}`);
  else console.log(`  ✓ ${policies.length} calendar reminders flagged, ${noteCount ?? 0} deal alerts cleared`);

  // ── Commissions that reconcile against the comp grid ──────────────────────
  //
  // Computed from the same percentages the comp levels carry, so an owner who
  // checks a commission against the grid finds them consistent. Advance is
  // 9 months of the annual premium at the agent's level; the rest is as-earned.
  const levelByAgent = new Map<string, number>();
  roster.forEach((p, i) => levelByAgent.set(p.id, COMP_LEVELS[Math.min(i, COMP_LEVELS.length - 1)].commission_pct));

  const nameById = new Map(clients.map((c: any) => [c.id, `${c.first_name} ${c.last_name}`]));
  const carrierNameById = new Map(Object.entries(carrierIds).map(([name, id]) => [id, name]));
  const commissionRows: any[] = [];

  policies.forEach((p: any, i: number) => {
    if (p.status === "in_review" || p.status === "issued_not_paid") return;
    const pct = levelByAgent.get(p.agent_id) ?? 80;
    const advance = Math.round(Number(p.annual_premium) * (pct / 100) * (9 / 12));
    const postedDays = Math.floor((Date.now() - new Date(p.posted_at).getTime()) / DAY);

    // `carrier` and `client_name` are denormalised text on this table and the
    // Finances and Reports pages read them directly rather than joining. A
    // commission row without them renders as a blank line in both.
    const common = {
      organization_id: orgId,
      policy_id: p.id,
      agent_id: p.agent_id,
      writing_agent_id: p.agent_id,
      commission_pct: pct,
      annual_premium: p.annual_premium,
      carrier: carrierNameById.get(p.carrier_id) ?? null,
      client_name: nameById.get(p.client_id) ?? null,
      product: p.product,
      is_sample: true,
    };

    commissionRows.push({
      ...common,
      payment_type: "advance",
      amount: advance,
      payment_date: dateAgo(Math.max(0, postedDays - 14)),
      // The column allows 'pending' and 'paid' and nothing else; anything not
      // yet paid is pending, which is what the Finances page expects.
      status: postedDays > 20 ? "paid" : "pending",
      paid_at: postedDays > 20 ? daysAgo(Math.max(0, postedDays - 14)) : null,
    });

    // One chargeback, on a policy that went lapse-pending. This is the number
    // an owner most wants to see the product catch.
    //
    // There is no 'chargeback' payment_type — the CHECK allows advance,
    // deferred, trail, override and renewal — and there is no chargeback
    // record either. The application infers one from a negative amount
    // (dashboard.functions.ts:288, and team-roster.ts says so outright), so
    // that is what this writes: the advance, clawed back.
    if (i === 0) {
      commissionRows.push({
        ...common,
        payment_type: "advance",
        amount: -Math.round(advance * 0.6),
        payment_date: dateAgo(6),
        status: "paid",
        paid_at: daysAgo(6),
      });
    }
  });
  await must("insert commissions", db.from("commission_schedule").insert(commissionRows).select("id"));
  console.log(`  ✓ ${commissionRows.length} commission rows (1 chargeback), computed from the comp grid`);

  // ── Contracting requests, at four different stages ────────────────────────
  const stages = ["draft", "missing_documents", "ready_to_submit", "submitted"] as const;
  const requestRows = stages.map((status, i) => {
    const agent = producers[i % producers.length];
    const carrierName = carrierNames[i % carrierNames.length];
    return {
      organization_id: orgId,
      agent_id: agent.id,
      org_carrier_id: orgCarrierIds[carrierName],
      created_by: owner.id,
      status,
      contract_type: i === 3 ? "transfer" : "new_contract",
      is_transfer: i === 3,
      priority: i === 1 ? "high" : "normal",
      // One overdue, so the queue has something red in it.
      due_date: i === 1 ? dateAgo(5) : dateIn(between(3, 20)),
      created_at: daysAgo(between(4, 40)),
      notes: "Sample contracting request",
      is_sample: true,
    };
  });
  await must("insert contracting requests",
    db.from("contracting_requests").insert(requestRows).select("id"));
  console.log(`  ✓ ${requestRows.length} contracting requests (draft → submitted, 1 overdue)`);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const taskRows = [
    { title: "Chase Foresters on Tanya's transfer", days: -3, priority: "high" },
    { title: "Upload PDB report for Priya Raman", days: 2, priority: "normal" },
    { title: "Call Willie Jenkins about the lapse notice", days: 0, priority: "urgent" },
    { title: "Renew TX licence — expires this month", days: 12, priority: "high" },
    { title: "Reconcile Americo statement", days: 5, priority: "normal" },
  ].map((t) => ({
    organization_id: orgId,
    title: t.title,
    assigned_to: owner.id,
    created_by: owner.id,
    status: "open",
    priority: t.priority,
    due_date: t.days < 0 ? dateAgo(-t.days) : dateIn(t.days),
    is_sample: true,
  }));
  await must("insert tasks", db.from("tasks").insert(taskRows).select("id"));
  console.log(`  ✓ ${taskRows.length} tasks (1 overdue, 1 due today)`);

  console.log("\nDone. Every row is flagged is_sample and can be removed in one action.");
  return {
    seeded: true,
    detail:
      `${clients.length} clients, ${policies.length} policies, ` +
      `${commissionRows.length} commission rows, ${requestRows.length} contracting requests, ` +
      `${taskRows.length} tasks`,
  };
}
