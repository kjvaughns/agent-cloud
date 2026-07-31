import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Starred pages.
 *
 * Reads and writes through the RLS-bound client, so a person can only ever
 * see and change their own — there is no ownership check in this file because
 * the policy is the check.
 *
 * Stores page ids from the navigation registry rather than paths, so a
 * favourite survives a page moving. Ids that no longer exist are dropped when
 * the list is resolved rather than erroring.
 */

export const listFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("user_page_favorites")
      .select("page_id, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { pageIds: (data ?? []).map((r: any) => r.page_id as string) };
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      page_id: z.string().min(1).max(64),
      starred: z.boolean(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    if (data.starred) {
      // Starring something already starred is not an error worth surfacing —
      // two clicks racing should settle on "starred", not on a toast.
      const { error } = await supabase
        .from("user_page_favorites")
        .upsert(
          { profile_id: userId, page_id: data.page_id },
          { onConflict: "profile_id,page_id", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("user_page_favorites")
        .delete()
        .eq("profile_id", userId)
        .eq("page_id", data.page_id);
      if (error) throw new Error(error.message);
    }

    return { ok: true, starred: data.starred };
  });
