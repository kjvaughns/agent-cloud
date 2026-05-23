import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listNewsArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ category: z.string().optional() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("news_articles")
      .select("*")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(60);
    if (data.category && data.category !== "all") {
      q = q.eq("category", data.category);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
