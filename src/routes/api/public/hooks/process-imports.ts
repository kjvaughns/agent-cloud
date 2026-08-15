import { createFileRoute } from "@tanstack/react-router";

/**
 * The reader of last resort.
 *
 * An import used to depend entirely on the tab that started it: close the
 * laptop and the file sat on "queued" with nothing anywhere able to finish it.
 * Files are stored now, so this sweep picks up anything nobody has touched for
 * a couple of minutes and reads it with no browser involved.
 *
 * Called by pg_cron. Under /api/public/* because that prefix bypasses site
 * auth, so the handler does its own check: the caller must present the
 * project's publishable key in the `apikey` header. There is no session here,
 * which is why each file is read as the person who uploaded it, explicitly.
 */
export const Route = createFileRoute("/api/public/hooks/process-imports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { readStoredImport } = await import("@/lib/import-read.server");

        // Two minutes of silence means whoever was reading it is gone.
        const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("document_intake")
          .select("id, batch_id, file_name, mime_type, file_url, user_note, uploaded_by, attempts")
          .in("status", ["queued", "analyzing"])
          .is("parent_id", null)
          .not("file_url", "is", null)
          .lt("attempts", 3)
          .or(`heartbeat_at.is.null,heartbeat_at.lt.${cutoff}`)
          .lt("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(10);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: any[] = [];

        for (const doc of rows ?? []) {
          // Claim it first, and only if it is still unclaimed, so this sweep and
          // an open Import page can never read the same file twice.
          const { data: claimed } = await supabaseAdmin
            .from("document_intake")
            .update({
              status: "analyzing",
              heartbeat_at: new Date().toISOString(),
              attempts: (doc.attempts ?? 0) + 1,
            })
            .eq("id", doc.id)
            .in("status", ["queued", "analyzing"])
            .or(`heartbeat_at.is.null,heartbeat_at.lt.${cutoff}`)
            .select("id")
            .maybeSingle();
          if (!claimed) continue;

          try {
            const out = await readStoredImport(supabaseAdmin, doc.uploaded_by, doc as any);
            if (out.status === "failed") {
              await supabaseAdmin.from("document_intake")
                .update({ status: "failed", error: out.reason, updated_at: new Date().toISOString() })
                .eq("id", doc.id);
            } else if (out.status === "deferred") {
              // A scanned page needs a browser. Leave it queued with the reason
              // said plainly, rather than calling it a failure.
              await supabaseAdmin.from("document_intake")
                .update({ status: "queued", heartbeat_at: null, error: out.reason })
                .eq("id", doc.id);
            }
            results.push({ id: doc.id, file: doc.file_name, ...out });
          } catch (e: any) {
            const attempts = (doc.attempts ?? 0) + 1;
            await supabaseAdmin.from("document_intake")
              .update(
                attempts >= 3
                  ? { status: "failed", error: e?.message ?? "We couldn't read this file." }
                  : { status: "queued", heartbeat_at: null, error: e?.message ?? null },
              )
              .eq("id", doc.id);
            results.push({ id: doc.id, file: doc.file_name, status: "error", reason: e?.message });
          }
        }

        return new Response(JSON.stringify({ processed: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
