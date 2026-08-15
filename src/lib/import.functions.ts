import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "@/lib/ai-gateway";
import { IMPORT_KINDS, KIND_TARGET, KIND_LABEL, type ImportKind } from "@/lib/import-router";
import { buildMatchIndex, classifyClient, policyExists, policyOnFile, rowKey, mergeAgencyMatches } from "@/lib/import-match";
import { saveClientFullRecord, resolveCarrierId, upsertPendingAgent, resolveAgentOwners } from "@/lib/import-helpers";
import { writeGridRows, requireOrgId } from "@/lib/comp-grid.functions";
import { runContractingImport } from "@/lib/contracting-import.functions";
import { applyStatementImport, applyAgentDebt } from "@/lib/import-carrier-apply";

type Ctx = { supabase: any; userId: string };

/**
 * Import — one front door for any document.
 *
 * Document Intake, which this replaces, classified a file and stopped. Its
 * "applied" status was bookkeeping; nothing was ever written. That was a
 * defensible choice while it was an agency-admin triage inbox, and it is the
 * wrong one for a tool whose job is to get a book of business into the system
 * without anybody retyping it.
 *
 * So the pipeline gains an apply layer, and everything careful about it lives
 * in `import_proposals` — one row per intended change, decided individually,
 * applied once:
 *
 *   upload  →  classify  →  extract  →  reconcile  →  approve  →  apply
 *
 * Three rules the rest of this file exists to keep.
 *
 * **Nothing writes without a decision.** Extraction produces proposals, never
 * records. The uploader approves what lands in their own data; anything
 * touching the carrier catalogue, the comp grids or the roster waits for an
 * agency admin, because one misread document should not be able to change what
 * every agent's commission is calculated from.
 *
 * **Apply is idempotent.** A book of business is thousands of rows and an apply
 * can fail halfway. `applied_at` on each proposal means the retry resumes
 * rather than creating everything a second time — which is precisely the
 * double-entry this feature is supposed to prevent.
 *
 * **Authorization is recomputed at apply, never replayed.** A proposal is
 * client-influenced: someone can edit a field before approving it. So the
 * checks run again against the row we are about to write, in the spirit of
 * `applyCarrierSync`, which re-verifies every policy id rather than trusting
 * the preview it was handed.
 */

// ── Shapes ───────────────────────────────────────────────────────────────────

export type ImportDoc = {
  id: string;
  batch_id: string;
  /** Set when this row is one sheet of a workbook. */
  parent_id?: string | null;
  sheet_label?: string | null;
  file_name: string;
  status: string;
  doc_type: string | null;
  carrier_name: string | null;
  period_label: string | null;
  summary: string | null;
  confidence: number | null;
  error: string | null;
  user_note: string | null;
  created_at: string;
};

export type Proposal = {
  id: string;
  target_table: string;
  operation: string;
  scope: "own" | "shared";
  payload: Record<string, any>;
  match_id: string | null;
  match_kind: "exact" | "fuzzy" | null;
  match_reason: string | null;
  confidence: number | null;
  decision: string;
  applied_at: string | null;
  apply_error: string | null;
};

/**
 * Migrations are applied by hand, so this code ships before its tables exist.
 *
 * `import_proposals` is not optional the way a nice-to-have column is — without
 * it there is nowhere to put a proposal, so Import cannot work at all. What it
 * must not do is fail with a stack trace. The reads come back empty with
 * `pendingSetup`, the writes refuse with a sentence, and the page says the
 * workspace is still updating — the same treatment `resources-admin` gives
 * `can_manage_resources`.
 */
const SETUP_PENDING =
  "Import is waiting on a workspace update — the tables it needs haven't been added yet.";

function isMissingTable(e: any): boolean {
  return e?.code === "42P01" || /relation .* does not exist/i.test(String(e?.message ?? ""));
}

/**
 * Proposal target table → the kind `runContractingImport` understands.
 *
 * An explicit map rather than passing the table name through, so
 * `scripts/migration-safety.ts` can still see which tables this file touches —
 * it cannot follow `.from(variable)`.
 */
const CONTRACTING_TABLES: Record<string, "writing_numbers" | "licenses" | "carriers"> = {
  writing_numbers: "writing_numbers",
  state_licenses: "licenses",
  carriers: "carriers",
};

/** Rows we will hold for one document. Past this we are not reviewing, we are hoping. */
const MAX_PROPOSALS_PER_DOC = 5000;

/** Postgres is happy with far more; this keeps a single statement small. */
const INSERT_CHUNK = 500;

/** How many approved rows one apply call works through before returning. */
const APPLY_BATCH = 200;

// ── 1. Start a batch ─────────────────────────────────────────────────────────

/**
 * Record the files before touching any of them, so a crash mid-batch leaves a
 * list of what was meant to happen rather than nothing at all.
 */
export const createImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      files: z.array(z.object({
        file_name: z.string().min(1).max(255),
        mime_type: z.string().max(120).nullable().optional(),
        size_bytes: z.number().int().nonnegative().nullable().optional(),
        storage_path: z.string().max(500).nullable().optional(),
        /** The workbook these sheets came out of. */
        parent_id: z.string().uuid().nullable().optional(),
        /** The tab name, when this row is one sheet of a workbook. */
        sheet_label: z.string().max(200).nullable().optional(),
      })).min(1).max(100),
      /** Join an existing batch, so an undo covers the whole upload. */
      batch_id: z.string().uuid().nullable().optional(),
      user_note: z.string().max(2000).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const batchId = data.batch_id ?? crypto.randomUUID();
    const note = data.user_note?.trim() || null;

    const rows = data.files.map((f) => ({
      batch_id: batchId,
      file_name: f.file_name,
      mime_type: f.mime_type ?? null,
      size_bytes: f.size_bytes ?? null,
      file_url: f.storage_path ?? null,
      status: "queued",
      uploaded_by: userId,
      parent_id: f.parent_id ?? null,
      sheet_label: f.sheet_label ?? null,
      ...(note ? { user_note: note } : {}),
    }));

    let { data: inserted, error } = await supabase
      .from("document_intake").insert(rows).select("id, file_name, status, created_at");

    // `user_note` arrives with 20260802180000. Until that migration is applied
    // by hand, writing it is a 42703 and the whole batch would fail — so drop
    // the column and keep going. The note is a hint, not the payload.
    if (error?.code === "42703") {
      const withoutNote = rows.map(({ user_note: _drop, ...rest }: any) => rest);
      ({ data: inserted, error } = await supabase
        .from("document_intake").insert(withoutNote).select("id, file_name, status, created_at"));
    }
    if (error) throw new Error(error.message);

    return { batch_id: batchId, documents: inserted ?? [], note_saved: !!note };
  });

// ── 2. Classify ──────────────────────────────────────────────────────────────

const CLASSIFY_SYSTEM = `You identify documents an insurance agency needs to import.

Return JSON:
{"kind": one of ${IMPORT_KINDS.join("|")},
 "carrier_name": string|null,
 "period_label": string|null,
 "summary": string,
 "confidence": 0..1}

Rules:
- summary: at most two sentences, plain language, what this document is and what it contains.
- Prefer "unknown" over a guess. A document routed to the wrong place can overwrite good data,
  so low confidence is far cheaper than a confident mistake.
- The user's own description of the file, when given, is strong evidence — but if it clearly
  contradicts the content, say so in the summary and return "unknown".`;

/**
 * Only called when the free signals could not settle it. The client runs the
 * header fingerprint and the note lexicon first (`import-router.ts`); a
 * spreadsheet whose columns are recognisable never reaches this function, and
 * so never costs a token.
 */
export const classifyImportDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      text: z.string().max(200_000).nullable().optional(),
      images: z.array(z.string().max(12_000_000)).max(8).nullable().optional(),
      user_note: z.string().max(2000).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;

    await supabase.from("document_intake")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", data.id);

    try {
      const images = data.images ?? [];
      if (!data.text && !images.length) throw new Error("Nothing readable in that file");

      const instruction = data.user_note
        ? `Identify this document. The person uploading it describes it as: "${data.user_note}"`
        : "Identify this document.";

      const content: any[] = [{ type: "text", text: instruction }];
      if (data.text) content.push({ type: "text", text: data.text.slice(0, 120_000) });
      for (const url of images) content.push({ type: "image_url", image_url: { url } });

      const out = await callAiJson<{
        kind: string; carrier_name: string | null; period_label: string | null;
        summary: string; confidence: number;
      }>({
        maxTokens: 700,
        messages: [
          { role: "system", content: CLASSIFY_SYSTEM },
          { role: "user", content },
        ],
      });

      const kind = (IMPORT_KINDS as readonly string[]).includes(out.kind)
        ? (out.kind as ImportKind)
        : "unknown";

      await supabase.from("document_intake").update({
        status: "needs_review",
        doc_type: kind,
        carrier_name: out.carrier_name ?? null,
        period_label: out.period_label ?? null,
        summary: out.summary ?? null,
        confidence: out.confidence ?? null,
        error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);

      return { ok: true, kind, summary: out.summary, confidence: out.confidence ?? 0 };
    } catch (e: any) {
      await supabase.from("document_intake").update({
        status: "failed",
        error: e?.message ?? "Could not read that document",
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
      // Resolved, not thrown: one unreadable file must not sink the batch.
      return { ok: false, error: e?.message ?? "Could not read that document" };
    }
  });

/** Record a kind the client worked out for free, or the user picked by hand. */
export const setImportKind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      kind: z.enum(IMPORT_KINDS),
      carrier_name: z.string().max(120).nullable().optional(),
      summary: z.string().max(1000).nullable().optional(),
      confidence: z.number().min(0).max(1).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("document_intake").update({
      status: "needs_review",
      doc_type: data.kind,
      carrier_name: data.carrier_name ?? null,
      summary: data.summary ?? null,
      confidence: data.confidence ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * The workbook row itself, once its sheets have been split out.
 *
 * A four-tab migration export is not one importable thing, so its own row
 * stops being reviewable and becomes a heading: it says what was found on each
 * tab, and the children underneath are what gets approved. Without this the
 * parent would sit at "we couldn't tell what this is" forever, next to four
 * rows that were read perfectly.
 */
export const markWorkbookParent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      summary: z.string().max(2000),
      sheet_count: z.number().int().min(1).max(50),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("document_intake").update({
      status: "split",
      doc_type: null,
      summary: data.summary,
      error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, sheets: data.sheet_count };
  });

// ── 3. Reconcile: rows in, proposals out ─────────────────────────────────────

/**
 * Turn extracted rows into proposals, deciding for each what it is against
 * what is already on file.
 *
 * The deciding itself lives in `import-reconcile.server.ts` so the resume
 * worker can do it too — a file must not need an open tab to be finished.
 */
export const reconcileImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      document_id: z.string().uuid(),
      kind: z.enum(IMPORT_KINDS),
      rows: z.array(z.record(z.string(), z.any())).max(1000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { reconcileRowsCore } = await import("@/lib/import-reconcile.server");
    return reconcileRowsCore(supabase, userId, data.document_id, data.kind, data.rows);
  });

// ── 4. Review ────────────────────────────────────────────────────────────────

export const getImportSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ document_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: rows, error } = await supabase
      .from("import_proposals")
      .select("decision, match_kind, scope, applied_at")
      .eq("document_id", data.document_id);
    if (error) {
      if (isMissingTable(error)) {
        return { pendingSetup: true, total: 0, newRecords: 0, autoSkipped: 0, needsYou: 0, shared: 0, applied: 0 };
      }
      throw new Error(error.message);
    }

    const all = (rows ?? []) as any[];
    return {
      pendingSetup: false,
      total: all.length,
      newRecords: all.filter((r) => !r.match_kind && r.decision !== "skipped").length,
      autoSkipped: all.filter((r) => r.match_kind === "exact").length,
      needsYou: all.filter((r) => r.match_kind === "fuzzy" && r.decision === "pending").length,
      shared: all.filter((r) => r.scope === "shared" && r.decision === "pending").length,
      applied: all.filter((r) => r.applied_at).length,
    };
  });

/**
 * The review list. Defaults to the rows that actually need a person, because a
 * five-thousand-row book is a summary plus a couple of dozen decisions — not a
 * five-thousand-row table.
 */
export const listProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      document_id: z.string().uuid(),
      filter: z.enum(["needs_you", "all", "new", "skipped"]).default("needs_you"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().nonnegative().default(0),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let q = supabase
      .from("import_proposals")
      .select("id, target_table, operation, scope, payload, match_id, match_kind, match_reason, confidence, decision, applied_at, apply_error")
      .eq("document_id", data.document_id)
      .order("created_at", { ascending: true })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.filter === "needs_you") q = q.eq("match_kind", "fuzzy").eq("decision", "pending");
    else if (data.filter === "new") q = q.is("match_kind", null);
    else if (data.filter === "skipped") q = q.eq("match_kind", "exact");

    const { data: rows, error } = await q;
    if (error) {
      if (isMissingTable(error)) return { proposals: [] as Proposal[], pendingSetup: true };
      throw new Error(error.message);
    }
    return { proposals: (rows ?? []) as Proposal[], pendingSetup: false };
  });

export const decideProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(1000),
      decision: z.enum(["approved", "skipped", "rejected"]),
      /** For a fuzzy row, which existing record the user says this is. */
      match_id: z.string().uuid().nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const patch: Record<string, any> = {
      decision: data.decision,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (data.match_id !== undefined) patch.match_id = data.match_id;

    const { data: updated, error } = await supabase
      .from("import_proposals")
      .update(patch)
      .in("id", data.ids)
      .is("applied_at", null)
      .select("id");
    if (error) throw new Error(isMissingTable(error) ? SETUP_PENDING : error.message);

    // A silent zero here means RLS refused — most likely someone deciding a
    // shared-scope row without being an agency admin. Say so rather than
    // showing a success toast over nothing.
    if (!updated?.length) {
      throw new Error(
        "Nothing was updated. Records that affect the whole agency can only be approved by an agency admin.",
      );
    }
    return { updated: updated.length };
  });

// ── 5. Apply ─────────────────────────────────────────────────────────────────

/**
 * Write the approved rows.
 *
 * Works a batch at a time and returns how much is left, so the caller loops.
 * Every row is stamped `applied_at` the moment it lands, which is what makes
 * running this again safe: a crash, a timeout or an impatient second click
 * resumes from where it stopped instead of importing the book twice.
 */
export const applyProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ document_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: batch, error } = await supabase
      .from("import_proposals")
      .select("id, target_table, operation, scope, payload, match_id, created_by")
      .eq("document_id", data.document_id)
      .eq("decision", "approved")
      .is("applied_at", null)
      .order("created_at", { ascending: true })
      .limit(APPLY_BATCH);
    if (error) throw new Error(isMissingTable(error) ? SETUP_PENDING : error.message);

    const rows = (batch ?? []) as any[];
    let applied = 0;
    let failed = 0;

    /*
      Claim first, then find out what the agency already has.

      Review happened at some earlier point, possibly before this agent's rows
      were claimed and certainly before whatever else has been imported since.
      Both questions are asked again here, at the moment of writing, because
      this is the last point where a duplicate can still be prevented.
    */
    const clientRows = rows.filter((r) => r.target_table === "clients");
    const knownPolicyNumbers = new Set<string>();
    if (clientRows.length) {
      const { error: claimErr } = await supabase.rpc("claim_my_assigned_records", {});
      if (claimErr) console.error("Import apply: claim failed", claimErr.message);

      const numbers = new Set<string>();
      for (const r of clientRows) {
        for (const pol of r.payload?.policies ?? []) {
          const n = String(pol?.policy_number ?? "").trim().toLowerCase();
          if (n) numbers.add(n);
        }
      }
      if (numbers.size) {
        const { data: scan, error: scanErr } = await supabase.rpc("import_duplicate_scan", {
          _phones: [], _emails: [], _name_dobs: [], _names: [],
          _policy_numbers: [...numbers],
        });
        if (scanErr) console.error("Import apply: duplicate scan failed", scanErr.message);
        for (const pol of (scan?.policies ?? []) as any[]) {
          const n = String(pol?.policy_number ?? "").trim().toLowerCase();
          if (n) knownPolicyNumbers.add(n);
        }
      }
    }

    // Grid rows apply together, not one at a time. `saveGrid` in merge mode
    // clears the products it is about to write, so applying row by row would
    // have each row wipe the one before it — the second level of a product
    // would delete the first. One call per carrier, carrying every approved
    // row for it.
    const gridRows = rows.filter((p) => p.target_table === "commission_grids");
    if (gridRows.length) {
      const byCarrier = new Map<string, any[]>();
      for (const p of gridRows) {
        const cid = p.payload?.carrier_id;
        if (!cid) continue;
        const bucket = byCarrier.get(cid);
        if (bucket) bucket.push(p);
        else byCarrier.set(cid, [p]);
      }

      const orgId = await requireOrgId(supabase, userId);

      for (const [carrierId, group] of byCarrier) {
        try {
          await writeGridRows(supabase, userId, orgId, {
            carrier_id: carrierId,
            rows: group.map((p) => ({
              product_name: p.payload.product_name,
              level_name: p.payload.level_name,
              year_1_pct: Number(p.payload.year_1_pct) || 0,
              years_2_5_pct: p.payload.years_2_5_pct ?? null,
              years_6_plus_pct: p.payload.years_6_plus_pct ?? null,
              age_group_min: p.payload.age_group_min ?? null,
              age_group_max: p.payload.age_group_max ?? null,
            })),
            source: "ai_extracted",
            // Merge, never replace. A document is rarely the whole grid, and
            // replacing on a partial extraction deletes every product it did
            // not happen to mention.
            mode: "merge",
          });
          const stamp = new Date().toISOString();
          await supabase.from("import_proposals")
            .update({ applied_at: stamp, apply_error: null, updated_at: stamp })
            .in("id", group.map((p) => p.id));
          applied += group.length;
        } catch (e: any) {
          await supabase.from("import_proposals")
            .update({ apply_error: String(e?.message ?? "Couldn't save that grid"), updated_at: new Date().toISOString() })
            .in("id", group.map((p) => p.id));
          failed += group.length;
        }
      }

      // Anything with no carrier resolved cannot be written at all. Fail it
      // loudly rather than leaving it approved-but-never-applied forever.
      const orphans = gridRows.filter((p) => !p.payload?.carrier_id);
      if (orphans.length) {
        await supabase.from("import_proposals")
          .update({
            apply_error: "No carrier matched this row — add the carrier first, then import again.",
            updated_at: new Date().toISOString(),
          })
          .in("id", orphans.map((p) => p.id));
        failed += orphans.length;
      }
    }

    for (const p of rows.filter((r) => r.target_table !== "commission_grids")) {
      try {
        // Recomputed, not replayed. A proposal is client-influenced — someone
        // can edit a field before approving it — so the row we are about to
        // write is checked now rather than trusted from the preview.
        if (p.created_by !== userId && p.scope !== "shared") {
          throw new Error("That record belongs to someone else.");
        }

        let ref: string | null = null;
        if (p.target_table === "clients") {
          const opts = {
            match: { existing_client_id: p.match_id ?? null },
            // An imported book is history: policies count in the month they
            // were written, and their commission schedules are built from the
            // effective date rather than today.
            backdate: true,
            buildCommissions: true,
            knownPolicyNumbers,
          };
          const owner = p.payload?.agent_id && p.payload.agent_id !== userId
            ? String(p.payload.agent_id)
            : userId;
          try {
            const res = await saveClientFullRecord(supabase, owner, p.payload, opts);
            ref = res.clientId;
          } catch (e: any) {
            /**
             * Only an agency owner may file a record under another agent.
             *
             * When the database refuses, the row is not lost: it lands with the
             * uploader and keeps the teammate's email in `assigned_to_email`,
             * so ownership still moves the day that person signs in. Failing
             * the row instead would strand it, which is worse than filing it
             * one level too high.
             */
            if (owner !== userId) {
              const res = await saveClientFullRecord(supabase, userId, {
                ...p.payload,
                assigned_to_email: p.payload?.assigned_to_email ?? null,
              }, opts);
              ref = res.clientId;
            } else {
              throw e;
            }
          }
        } else if (p.target_table === "pending_agents") {
          // The uploader is the upline. Importing "my roster" means these
          // people sit under the person importing them; anything else would be
          // a guess about a hierarchy from a spreadsheet column.
          const res = await upsertPendingAgent(supabase, userId, userId, p.payload);
          if (res.status === "skipped") throw new Error(res.reason ?? "Nothing to do for this row");
          // Recorded so the batch can be rolled back. Without an id here, an
          // undo would silently skip every agent the import created and report
          // success — the worst kind of half-undo, because the person believes
          // it worked.
          ref = res.pendingAgentId ?? null;
        } else if (p.target_table === "commission_statements") {
          // Statements land unmatched on purpose. Reconciliation is its own
          // screen with a human applying the matches; pairing a paid amount to
          // a policy at import time is a guess nobody approved.
          const orgId = await requireOrgId(supabase, userId);
          ref = await applyStatementImport(supabase, userId, orgId, p.payload ?? {});
        } else if (p.target_table === "agent_debt_balances") {
          const orgId = await requireOrgId(supabase, userId);
          ref = await applyAgentDebt(supabase, orgId, p.payload ?? {});
        } else if (CONTRACTING_TABLES[p.target_table]) {
          // Straight through to the contracting importer, which owns the
          // permission check, the agent and carrier resolution, and the rule
          // that a row failing at the database is reported rather than taking
          // the batch with it. One row per call is not the cheapest shape, but
          // it keeps a failure attributable to the proposal that caused it.
          const out: any = await runContractingImport(
            userId, CONTRACTING_TABLES[p.target_table], [p.payload], true,
          );
          const bad = (out?.results ?? []).find((r: any) => r.status === "error");
          if (bad) throw new Error(bad.message ?? "That row could not be imported.");
        } else {
          throw new Error(`Applying ${p.target_table} isn't wired up yet.`);
        }

        await supabase.from("import_proposals").update({
          applied_at: new Date().toISOString(),
          applied_record_id: ref,
          apply_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", p.id);
        applied++;
      } catch (e: any) {
        const msg = String(e?.message ?? "Could not save that record");
        // 23505 is the database refusing a duplicate. That is the outcome we
        // wanted, arrived at the hard way — mark it done, do not count it a
        // failure and do not leave it to be retried forever.
        const isDuplicate = msg.includes("23505") || /duplicate key/i.test(msg);
        await supabase.from("import_proposals").update({
          applied_at: isDuplicate ? new Date().toISOString() : null,
          apply_error: isDuplicate ? "Already on file" : msg,
          updated_at: new Date().toISOString(),
        }).eq("id", p.id);
        if (isDuplicate) applied++;
        else failed++;
      }
    }

    const { count: remaining } = await supabase
      .from("import_proposals")
      .select("id", { count: "exact", head: true })
      .eq("document_id", data.document_id)
      .eq("decision", "approved")
      .is("applied_at", null);

    if (!remaining) {
      await supabase.from("document_intake")
        .update({ status: "applied", reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq("id", data.document_id);
    }

    return { applied, failed, remaining: remaining ?? 0, done: !remaining };
  });

// ── Listing ──────────────────────────────────────────────────────────────────

export const listImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["all", "needs_review", "applied", "failed"]).default("all") }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let q = supabase
      .from("document_intake")
      // `*` rather than a column list: `user_note` arrives with a migration
      // applied by hand, and naming a column the database does not have yet
      // fails the whole select rather than just that field.
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { documents: (rows ?? []) as ImportDoc[] };
  });

/** The agency admin's queue: everything shared and still waiting, across the org. */
export const listPendingApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data: rows, error } = await supabase
      .from("import_proposals")
      .select("id, document_id, target_table, operation, payload, match_kind, match_reason, confidence, created_by, created_at")
      .eq("scope", "shared")
      .eq("decision", "pending")
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) {
      if (isMissingTable(error)) return { proposals: [] as any[], pendingSetup: true };
      throw new Error(error.message);
    }
    return { proposals: (rows ?? []) as any[], pendingSetup: false };
  });

export const dismissImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: updated, error } = await supabase
      .from("document_intake")
      .update({ status: "dismissed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("That import is no longer available.");
    return { ok: true };
  });

/**
 * The carrier catalogue, for reading a carrier out of a tab name.
 *
 * One tab per carrier is the commonest workbook shape in this industry, and the
 * carrier is then in the sheet name and nowhere else. Deciding that on the
 * client needs the catalogue on the client — and it has to be the *real* one,
 * because the alternative is stamping a name nobody has verified across every
 * policy on the tab. Reference data, read through the caller's own client.
 */
export const listCarrierIndex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    try {
      const { buildCarrierIndex } = await import("@/lib/carrier-index");
      return { carriers: await buildCarrierIndex(supabase) };
    } catch {
      // A tab name is a convenience, never the only path to a carrier. If the
      // catalogue cannot be read, the column still works.
      return { carriers: [] };
    }
  });
