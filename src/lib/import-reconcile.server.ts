/**
 * Reconcile lives here so it has two callers, not one.
 *
 * It used to be the body of a server function, which meant the only thing that
 * could turn extracted rows into proposals was a browser with the page open.
 * A file left unread by a closed tab could never be finished. The logic is
 * unchanged; it just takes its client and its uploader as arguments now, so the
 * resume worker can run exactly the same reconciliation the page runs.
 */

import { z } from "zod";
import { KIND_TARGET, KIND_LABEL, type ImportKind } from "@/lib/import-router";
import { buildMatchIndex, classifyClient, policyExists, policyOnFile, rowKey, mergeAgencyMatches } from "@/lib/import-match";
import { resolveCarrierId, resolveAgentOwners } from "@/lib/import-helpers";
import { runContractingImport } from "@/lib/contracting-import.functions";

/** Rows we will hold for one document. Past this we are not reviewing, we are hoping. */
const MAX_PROPOSALS_PER_DOC = 5000;
const INSERT_CHUNK = 500;

export const SETUP_PENDING =
  "Import is waiting on a workspace update — the tables it needs haven't been added yet.";

export function isMissingTable(e: any): boolean {
  return e?.code === "42P01" || /relation .* does not exist/i.test(String(e?.message ?? ""));
}

/**
 * Proposal target table → the kind `runContractingImport` understands.
 * An explicit map so `scripts/migration-safety.ts` can still see the tables.
 */
const CONTRACTING_TABLES: Record<string, "writing_numbers" | "licenses" | "carriers"> = {
  writing_numbers: "writing_numbers",
  state_licenses: "licenses",
  carriers: "carriers",
};

const ClientRow = z.object({
  first_name: z.string().max(120).nullable().optional(),
  last_name: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  date_of_birth: z.string().max(20).nullable().optional(),
  street_address: z.string().max(300).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(60).nullable().optional(),
  zip_code: z.string().max(20).nullable().optional(),
  born_country_state: z.string().max(120).nullable().optional(),
  stage_raw: z.string().max(60).nullable().optional(),
  tobacco_use: z.boolean().nullable().optional(),
  medical_notes: z.string().max(4000).nullable().optional(),
  monthly_income: z.number().nullable().optional(),
  employment: z.string().max(200).nullable().optional(),
  pitch_carrier: z.string().max(160).nullable().optional(),
  pitch_face_amount: z.number().nullable().optional(),
  reminder_notes: z.string().max(2000).nullable().optional(),
  callback_date: z.string().max(20).nullable().optional(),
  /** The agent named on the row, resolved below. */
  agent_name: z.string().max(160).nullable().optional(),
  agent_id: z.string().uuid().nullable().optional(),
  assigned_to_email: z.string().max(200).nullable().optional(),
  notes: z.array(z.object({
    content: z.string().max(8000),
    note_type: z.string().max(60).nullable().optional(),
    author: z.string().max(160).nullable().optional(),
    created_at: z.string().max(30).nullable().optional(),
  })).max(200).optional(),
  policies: z.array(z.object({
    policy_number: z.string().max(80).nullable().optional(),
    product: z.string().max(200).nullable().optional(),
    carrier_name: z.string().max(160).nullable().optional(),
    monthly_premium: z.number().nullable().optional(),
    annual_premium: z.number().nullable().optional(),
    face_amount: z.number().nullable().optional(),
    effective_date: z.string().max(20).nullable().optional(),
    status: z.string().max(60).nullable().optional(),
  })).max(50).optional(),
});

/**
 * Turn extracted rows into proposals, deciding for each what it is against
 * what is already on file.
 *
 * Chunked and cursor-driven. The client calls this repeatedly with a slice of
 * the extraction, so a five-thousand-row book makes progress visibly instead of
 * timing out in one request — and, because proposals are rows, a failure
 * halfway through resumes where it stopped.
 */

export type ReconcileResult = {
  proposed: number; exact: number; fuzzy: number; inFile: number;
  capped: boolean; skipped: number;
};

export async function reconcileRowsCore(
  supabase: any,
  userId: string,
  documentId: string,
  kind: ImportKind,
  rows: Record<string, any>[],
): Promise<ReconcileResult> {

    const target = KIND_TARGET[kind];
    if (!target) throw new Error(`Nothing to import from a ${KIND_LABEL[kind].toLowerCase()} yet.`);

    const { data: doc, error: docErr } = await supabase
      .from("document_intake")
      .select("id, batch_id, uploaded_by")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("That import is no longer available.");

    const { count: existingCount, error: countErr } = await supabase
      .from("import_proposals")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId);
    if (countErr && isMissingTable(countErr)) throw new Error(SETUP_PENDING);

    const room = MAX_PROPOSALS_PER_DOC - (existingCount ?? 0);
    if (room <= 0) {
      // Say so. A silent cap reads as "we imported everything" when it did not.
      return { proposed: 0, exact: 0, fuzzy: 0, inFile: 0, capped: true, skipped: rows.length };
    }

    // Client rows are the only kind we match against existing records so far;
    // the others land as straightforward proposals until their slice is built.
    /*
      Pick up anything parked against this person's email first.

      An agency imports a book before its agents have accounts, so those rows
      carry `assigned_to_email` instead of an owner. Signing up claims what
      existed then; this claims what has been imported since — and it has to
      happen before matching, or the agent's own sales are invisible to the
      matcher and get created a second time.
    */
    if (target.table === "clients") {
      const { error: claimErr } = await supabase.rpc("claim_my_assigned_records", {});
      if (claimErr) console.error("Import: claim failed", claimErr.message);
    }

    const index = target.table === "clients"
      ? await buildMatchIndex(supabase, [userId])
      : null;

    // Then widen it to the agency, key by key, so a sale the upline already
    // imported is recognised rather than duplicated.
    if (index) await mergeAgencyMatches(supabase, index, rows);

    /**
     * Who owns each row.
     *
     * A migration export names the writing agent per client, and filing four
     * hundred of somebody else's clients under the uploader is the sort of
     * quiet wrong that is very expensive to unpick later. So the name is
     * resolved once for the whole chunk: a real teammate becomes the owner;
     * somebody who is only on the roster so far becomes `assigned_to_email`,
     * which is how this app already parks a record for an agent who has not
     * signed up yet.
     */
    const owners = target.table === "clients"
      ? await resolveAgentOwners(supabase, userId, rows)
      : new Map<string, { agentId: string | null; email: string | null }>();

    const seen = new Set<string>();
    const proposals: any[] = [];
    let exact = 0, fuzzy = 0, inFile = 0;

    /**
     * For contracting records, the dry run *is* the reconciliation.
     *
     * `runContractingImport` already resolves agents by NPN or email, carriers
     * against the agency's own directory, and reports per row whether it would
     * create, skip or fail — with a sentence saying why. Re-deriving any of
     * that here would mean two answers to the same question, and the one
     * downstream is the one that decides.
     */
    /**
     * Emails already spoken for — a real account, or a pending record from a
     * previous import. Loaded once rather than queried per row, for the same
     * reason the client matcher is: a roster is a list, and a query per name
     * is a query too many.
     */
    const takenEmails = new Set<string>();
    if (target.table === "pending_agents") {
      const emails = rows
        .map((r) => String((r as any).email ?? "").trim().toLowerCase())
        .filter(Boolean);
      if (emails.length) {
        const [{ data: profs }, { data: pend }] = await Promise.all([
          supabase.from("profiles").select("email").in("email", emails),
          supabase.from("pending_agents").select("email").in("email", emails),
        ]);
        for (const p of [...(profs ?? []), ...(pend ?? [])]) {
          if (p.email) takenEmails.add(String(p.email).trim().toLowerCase());
        }
      }
    }

    const contractKind = CONTRACTING_TABLES[target.table];
    const dryRun: Map<number, any> = new Map();
    if (contractKind) {
      const out: any = await runContractingImport(
        userId, contractKind, rows as Record<string, string>[], false,
      );
      for (const r of out?.results ?? []) dryRun.set(r.row, r);
    }

    // A grid is dozens of rows naming the same one or two carriers. Look each
    // name up once.
    const carrierCache = new Map<string, string | null>();
    async function carrierFor(name: string | null | undefined): Promise<string | null> {
      const key = (name ?? "").trim().toLowerCase();
      if (carrierCache.has(key)) return carrierCache.get(key) ?? null;
      const id = await resolveCarrierId(supabase, name);
      carrierCache.set(key, id);
      return id;
    }

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const raw = rows[rowIdx];
      if (proposals.length >= room) break;

      const parsed = target.table === "clients" ? ClientRow.safeParse(raw) : null;
      if (parsed && !parsed.success) continue;
      const row: Record<string, any> = parsed ? parsed.data : raw;

      if (target.table === "clients" && row.agent_name) {
        const hit = owners.get(String(row.agent_name).trim().toLowerCase());
        if (hit?.agentId) row.agent_id = hit.agentId;
        else if (hit?.email) row.assigned_to_email = hit.email;
      }

      // Within the file. A carrier report that lists a policy on two pages, or
      // a sheet with a repeated header block, would otherwise import twice —
      // and no amount of checking the database catches it, because neither row
      // is there yet.
      const key = rowKey(target.table, row);
      if (seen.has(key)) { inFile++; continue; }
      seen.add(key);

      let match_id: string | null = null;
      let match_kind: "exact" | "fuzzy" | null = null;
      let match_reason: string | null = null;
      let confidence: number | null = null;
      let decision = "pending";
      let operation = "insert";

      // A grid row is worthless without a carrier we can name. Resolve it here
      // rather than at apply time so an unresolvable one is visible while
      // somebody is still looking at the review screen, and so `resolveCarrierId`
      // — which returns null rather than guessing between similar names — gets
      // to be the thing that decides.
      if (contractKind) {
        // `runContractingImport` numbers its results from 1, in input order.
        const verdict = dryRun.get(rowIdx + 1);
        if (verdict?.status === "skip") {
          // Already in the directory, or a repeat of an earlier row. Counted,
          // not shown — the same treatment an exact client duplicate gets.
          match_kind = "exact";
          match_reason = verdict.message ?? null;
          operation = "skip";
          decision = "skipped";
          exact++;
        } else if (verdict?.status === "error") {
          // An unresolvable agent or a carrier that is not in the directory.
          // These need a person, and the message already says which.
          match_kind = "fuzzy";
          match_reason = verdict.message ?? null;
          fuzzy++;
        }
      }

      if (target.table === "pending_agents") {
        const email = String(row.email ?? "").trim().toLowerCase();
        if (takenEmails.has(email)) {
          // Either they already have an account — in which case they are not
          // pending anything — or a previous import already recorded them.
          match_kind = "exact";
          match_reason = "Already on your team, or already imported";
          operation = "skip";
          decision = "skipped";
          exact++;
        }
      }

      if (target.table === "commission_grids" && !row.carrier_id) {
        row.carrier_id = await carrierFor(row.carrier_name);
        if (!row.carrier_id) {
          match_reason = `We don't have a carrier matching "${row.carrier_name ?? "(none given)"}".`;
          match_kind = "fuzzy";
          fuzzy++;
        }
      }

      if (index) {
        /*
          Policies are filtered before the client verdict is acted on, because
          the verdict depends on what is left.

          A policy number already on file anywhere in the agency is dropped: the
          commonest shape of this import is an agent uploading their own copy of
          a book their upline already loaded, and re-inserting those policies is
          exactly the doubled production this is meant to prevent.
        */
        if (Array.isArray(row.policies)) {
          row.policies = row.policies.filter(
            (p: any) =>
              !policyExists(index, userId, p?.policy_number) &&
              !policyOnFile(index, p?.policy_number),
          );
        }
        const bringsPolicies = Array.isArray(row.policies) && row.policies.length > 0;

        const v = classifyClient(index, row);
        match_id = v.matchId;
        match_reason = v.reason;
        confidence = v.confidence;
        if (v.verdict === "exact") {
          match_kind = "exact";
          if (bringsPolicies) {
            /*
              The person is already here, the sale is not.

              This used to skip the whole row, which reads as "no duplicates,
              nothing to do" and quietly loses every policy and note attached to
              a client we happen to already have — the second upload of a
              growing book is nothing but rows like this.
            */
            operation = "update";
            match_reason = `${v.reason ?? "already on file"} — adding ${row.policies.length} new polic${row.policies.length === 1 ? "y" : "ies"}`;
          } else {
            operation = "skip";
            // Counted in the summary, never shown. Nobody wants to click through
            // six hundred rows that a unique index would have refused anyway.
            decision = "skipped";
            exact++;
          }
        } else if (v.verdict === "fuzzy") {
          match_kind = "fuzzy";
          fuzzy++;
        }
      }

      proposals.push({
        document_id: documentId,
        batch_id: doc.batch_id,
        created_by: userId,
        target_table: target.table,
        operation,
        scope: target.scope,
        payload: row,
        match_id,
        match_kind,
        match_reason,
        confidence,
        decision,
      });
    }

    for (let i = 0; i < proposals.length; i += INSERT_CHUNK) {
      const { error } = await supabase
        .from("import_proposals").insert(proposals.slice(i, i + INSERT_CHUNK));
      if (error) throw new Error(isMissingTable(error) ? SETUP_PENDING : error.message);
    }

    const capped = proposals.length < rows.length - inFile;
    return {
      proposed: proposals.length,
      exact,
      fuzzy,
      inFile,
      capped,
      skipped: capped ? rows.length - inFile - proposals.length : 0,
    };
}
