import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiJson } from "@/lib/ai-gateway";
import { IMPORT_KINDS, KIND_TARGET, KIND_LABEL, type ImportKind } from "@/lib/import-router";
import { buildMatchIndex, classifyClient, policyExists, rowKey } from "@/lib/import-match";
import { saveClientFullRecord } from "@/lib/import-helpers";

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
      })).min(1).max(100),
      user_note: z.string().max(2000).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const batchId = crypto.randomUUID();
    const note = data.user_note?.trim() || null;

    const rows = data.files.map((f) => ({
      batch_id: batchId,
      file_name: f.file_name,
      mime_type: f.mime_type ?? null,
      size_bytes: f.size_bytes ?? null,
      file_url: f.storage_path ?? null,
      status: "queued",
      uploaded_by: userId,
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

// ── 3. Reconcile: rows in, proposals out ─────────────────────────────────────

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
  policies: z.array(z.object({
    policy_number: z.string().max(80).nullable().optional(),
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

    const target = KIND_TARGET[data.kind];
    if (!target) throw new Error(`Nothing to import from a ${KIND_LABEL[data.kind].toLowerCase()} yet.`);

    const { data: doc, error: docErr } = await supabase
      .from("document_intake")
      .select("id, batch_id, uploaded_by")
      .eq("id", data.document_id)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("That import is no longer available.");

    const { count: existingCount, error: countErr } = await supabase
      .from("import_proposals")
      .select("id", { count: "exact", head: true })
      .eq("document_id", data.document_id);
    if (countErr && isMissingTable(countErr)) throw new Error(SETUP_PENDING);

    const room = MAX_PROPOSALS_PER_DOC - (existingCount ?? 0);
    if (room <= 0) {
      // Say so. A silent cap reads as "we imported everything" when it did not.
      return { proposed: 0, exact: 0, fuzzy: 0, inFile: 0, capped: true, skipped: data.rows.length };
    }

    // Client rows are the only kind we match against existing records so far;
    // the others land as straightforward proposals until their slice is built.
    const index = data.kind === "book_of_business"
      ? await buildMatchIndex(supabase, [userId])
      : null;

    const seen = new Set<string>();
    const proposals: any[] = [];
    let exact = 0, fuzzy = 0, inFile = 0;

    for (const raw of data.rows) {
      if (proposals.length >= room) break;

      const parsed = data.kind === "book_of_business" ? ClientRow.safeParse(raw) : null;
      if (parsed && !parsed.success) continue;
      const row: Record<string, any> = parsed ? parsed.data : raw;

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

      if (index) {
        const v = classifyClient(index, row);
        match_id = v.matchId;
        match_reason = v.reason;
        confidence = v.confidence;
        if (v.verdict === "exact") {
          match_kind = "exact";
          operation = "skip";
          // Counted in the summary, never shown. Nobody wants to click through
          // six hundred rows that a unique index would have refused anyway.
          decision = "skipped";
          exact++;
        } else if (v.verdict === "fuzzy") {
          match_kind = "fuzzy";
          fuzzy++;
        }

        // Drop policies already on file even when the client is new to us.
        if (Array.isArray(row.policies)) {
          row.policies = row.policies.filter(
            (p: any) => !policyExists(index, userId, p?.policy_number),
          );
        }
      }

      proposals.push({
        document_id: data.document_id,
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

    const capped = proposals.length < data.rows.length - inFile;
    return {
      proposed: proposals.length,
      exact,
      fuzzy,
      inFile,
      capped,
      skipped: capped ? data.rows.length - inFile - proposals.length : 0,
    };
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

    for (const p of rows) {
      try {
        // Recomputed, not replayed. A proposal is client-influenced — someone
        // can edit a field before approving it — so the row we are about to
        // write is checked now rather than trusted from the preview.
        if (p.created_by !== userId && p.scope !== "shared") {
          throw new Error("That record belongs to someone else.");
        }

        let ref: string | null = null;
        if (p.target_table === "clients") {
          const res = await saveClientFullRecord(supabase, userId, p.payload, {
            match: { existing_client_id: p.match_id ?? null },
          });
          ref = res.clientId;
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
