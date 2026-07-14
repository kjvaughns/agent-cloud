import { createServerFn } from "@tanstack/start-client-core";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

export const submitSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      subject: z.string().trim().min(1).max(200),
      category: z.string().default("general"),
      description: z.string().trim().min(1).max(5000),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("support_tickets").insert({
      agent_id: userId,
      subject: data.subject,
      category: data.category,
      description: data.description,
      status: "open",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
