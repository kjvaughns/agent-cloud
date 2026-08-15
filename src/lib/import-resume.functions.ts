/**
 * Nothing stays unread.
 *
 * Three ways a file gets finished, in order of who is around to do it:
 *
 *   the page, while you watch it — `claimStaleImports` hands back the files
 *   nobody is working on, with a link to the stored copy, so opening Import
 *   picks up whatever the last tab abandoned;
 *
 *   the server, when no tab is open — `processStoredImport` reads a stored
 *   spreadsheet end to end without a browser;
 *
 *   you, deliberately — `retryImportDoc` puts a failed file back in line.
 *
 * The claim is a conditional update, so a resume and the background sweep can
 * never read the same file twice.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/** A file whose reader hasn't checked in for this long is nobody's. */
const STALE_MS = 2 * 60_000;

/** Past this we stop retrying on our own and ask. */
export const MAX_ATTEMPTS = 3;

export type StaleImport = {
  id: string;
  batch_id: string;
  file_name: string;
  mime_type: string | null;
  file_url: string | null;
  user_note: string | null;
  attempts: number;
  /** A short-lived download link, when we hold a copy of the file. */
  signed_url: string | null;
  /** True when a browser is the only thing that can read this one. */
  needs_browser: boolean;
};

function needsBrowser(name: string, mime: string | null): boolean {
  return /pdf|image/i.test(mime ?? "") || /\.(pdf|png|jpe?g|webp|gif|bmp)$/i.test(name);
}

/**
 * Take ownership of everything of mine that was left unread, and hand back what
 * is needed to finish it.
 */
export const claimStaleImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();

    const { data: rows, error } = await supabase
      .from("document_intake")
      .select("id, batch_id, file_name, mime_type, file_url, user_note, attempts, heartbeat_at, created_at")
      .eq("uploaded_by", userId)
      .in("status", ["queued", "analyzing"])
      .is("parent_id", null)
      .or(`heartbeat_at.is.null,heartbeat_at.lt.${cutoff}`)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);

    const stale = (rows ?? []).filter(
      (r: any) => new Date(r.created_at).getTime() < Date.now() - 5_000,
    );

    const out: StaleImport[] = [];
    for (const r of stale) {
      // Claim it before anything else can: the heartbeat is what makes it mine.
      const { data: claimed } = await supabase
        .from("document_intake")
        .update({ status: "analyzing", heartbeat_at: new Date().toISOString(), attempts: (r.attempts ?? 0) + 1 })
        .eq("id", r.id)
        .in("status", ["queued", "analyzing"])
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      let signed: string | null = null;
      if (r.file_url) {
        const { data: sig } = await supabase.storage.from("imports").createSignedUrl(r.file_url, 600);
        signed = sig?.signedUrl ?? null;
      }
      out.push({
        id: r.id,
        batch_id: r.batch_id,
        file_name: r.file_name,
        mime_type: r.mime_type,
        file_url: r.file_url,
        user_note: r.user_note ?? null,
        attempts: (r.attempts ?? 0) + 1,
        signed_url: signed,
        needs_browser: needsBrowser(r.file_name, r.mime_type),
      });
    }
    return { files: out };
  });

/** Keep my claim alive while the browser is genuinely working on a file. */
export const heartbeatImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await supabase
      .from("document_intake")
      .update({ heartbeat_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

/** A file we could not read, said plainly, with its copy kept for a retry. */
export const failImportDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await supabase
      .from("document_intake")
      .update({ status: "failed", error: data.reason, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

/** Put one file back in line, from its stored copy. */
export const retryImportDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: doc, error } = await supabase
      .from("document_intake")
      .select("id, file_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("That import is no longer available.");
    if (!doc.file_url) {
      throw new Error("We don't have a copy of that file — upload it again and it'll finish this time.");
    }
    await supabase
      .from("document_intake")
      .update({ status: "queued", attempts: 0, heartbeat_at: null, error: null })
      .eq("id", data.id);
    return { ok: true };
  });

/**
 * Read a stored file entirely on the server.
 *
 * Used for spreadsheets and CSVs, which is most of what people migrate with.
 * Anything needing a rendered page comes back `deferred` and is left queued for
 * the page rather than being marked failed.
 */
export const processStoredImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: doc, error } = await supabase
      .from("document_intake")
      .select("id, batch_id, file_name, mime_type, file_url, user_note")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("That import is no longer available.");

    const { readStoredImport } = await import("@/lib/import-read.server");
    const out = await readStoredImport(supabase, userId, doc);

    if (out.status === "failed") {
      await supabase.from("document_intake")
        .update({ status: "failed", error: out.reason, updated_at: new Date().toISOString() })
        .eq("id", data.id);
    } else if (out.status === "deferred") {
      await supabase.from("document_intake")
        .update({ status: "queued", heartbeat_at: null, error: out.reason })
        .eq("id", data.id);
    }
    return out;
  });
