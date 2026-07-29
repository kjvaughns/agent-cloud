import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Tasks.
 *
 * Everything reads through the RLS-bound client, so the tasks policy decides
 * visibility: your own tasks, tasks you created, your downline's tasks, and —
 * for an agency owner — the whole org. No service-role escalation is needed
 * anywhere in this module.
 */

export type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  created_by: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  completed_at: string | null;
  related_type: string | null;
  related_id: string | null;
  created_at: string;
  assignee_name?: string | null;
};

const RELATED = ["client", "policy", "prospect", "contract", "ticket", "agent"] as const;

const SELECT =
  "id, title, description, assigned_to, created_by, status, priority, due_date, completed_at, related_type, related_id, created_at";

async function attachNames(supabase: any, rows: any[]) {
  const ids = Array.from(new Set(rows.map((t) => t.assigned_to).filter(Boolean)));
  if (!ids.length) return rows;
  const { data: people } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
  const byId = new Map<string, string>(
    (people ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]),
  );
  return rows.map((t) => ({ ...t, assignee_name: byId.get(t.assigned_to) ?? null }));
}

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      scope: z.enum(["mine", "assigned_by_me", "team"]).default("mine"),
      status: z.enum(["all", "open", "in_progress", "done", "cancelled"]).default("all"),
      related_type: z.enum(RELATED).optional(),
      related_id: z.string().uuid().optional(),
    }).parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    let q = supabase.from("tasks").select(SELECT).limit(500);

    if (data.scope === "mine") q = q.eq("assigned_to", userId);
    if (data.scope === "assigned_by_me") q = q.eq("created_by", userId).neq("assigned_to", userId);
    // "team" applies no extra filter — RLS already bounds it to what the
    // caller may see.

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.related_type) q = q.eq("related_type", data.related_type);
    if (data.related_id) q = q.eq("related_id", data.related_id);

    // Open work first, then soonest due, then newest.
    q = q.order("status", { ascending: true })
         .order("due_date", { ascending: true, nullsFirst: false })
         .order("created_at", { ascending: false });

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return { tasks: await attachNames(supabase, rows ?? []) as Task[] };
  });

export const getTaskCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: rows, error } = await supabase
      .from("tasks")
      .select("status, due_date")
      .eq("assigned_to", userId)
      .in("status", ["open", "in_progress"]);
    if (error) return { open: 0, overdue: 0, dueToday: 0 };

    const today = new Date().toISOString().slice(0, 10);
    let overdue = 0, dueToday = 0;
    for (const t of rows ?? []) {
      if (!t.due_date) continue;
      if (t.due_date < today) overdue++;
      else if (t.due_date === today) dueToday++;
    }
    return { open: (rows ?? []).length, overdue, dueToday };
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(2000).nullable().optional(),
      assigned_to: z.string().uuid().optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      related_type: z.enum(RELATED).nullable().optional(),
      related_id: z.string().uuid().nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Assigning to someone else is bounded by the tasks WITH CHECK policy —
    // it only permits an assignee inside the caller's org and downline.
    const assignee = data.assigned_to ?? userId;

    const { data: row, error } = await supabase
      .from("tasks")
      .insert({
        title: data.title,
        description: data.description ?? null,
        assigned_to: assignee,
        created_by: userId,
        priority: data.priority,
        due_date: data.due_date ?? null,
        related_type: data.related_type ?? null,
        related_id: data.related_id ?? null,
      })
      .select(SELECT)
      .single();

    if (error) {
      // A policy rejection here means the assignee is outside what the caller
      // may write, which is worth saying plainly.
      if (error.code === "42501") throw new Error("You can't assign a task to that person");
      throw new Error(error.message);
    }

    // Tell the assignee, unless they assigned it to themselves.
    if (assignee !== userId) {
      await supabase.from("notifications").insert({
        user_id: assignee,
        title: "New task assigned",
        description: data.title,
        type: "task",
      });
    }

    return { task: row as Task };
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      assigned_to: z.string().uuid().optional(),
      status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { id, ...patch } = data;

    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) return { ok: true };

    // completed_at and updated_at are handled by the touch_task trigger.
    const { error } = await supabase.from("tasks").update(clean).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
