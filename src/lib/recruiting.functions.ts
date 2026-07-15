import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const slugRe = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

export const listFunnels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: funnels, error } = await supabase
      .from("recruiting_funnels")
      .select("id,name,slug,template_slug,published,page_views,applications,created_at")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Recruited production: sum policies.annual_premium for linked agents per funnel
    const ids = (funnels ?? []).map((f) => f.id);
    let production: Record<string, number> = {};
    if (ids.length) {
      const { data: prospects } = await supabase
        .from("recruiting_prospects")
        .select("funnel_id,linked_agent_id")
        .in("funnel_id", ids)
        .not("linked_agent_id", "is", null);
      const byAgent: Record<string, string> = {};
      const agentIds: string[] = [];
      for (const p of prospects ?? []) {
        if (p.linked_agent_id && p.funnel_id) {
          byAgent[p.linked_agent_id] = p.funnel_id;
          agentIds.push(p.linked_agent_id);
        }
      }
      if (agentIds.length) {
        const { data: pols } = await supabase
          .from("policies")
          .select("agent_id,annual_premium")
          .in("agent_id", agentIds);
        for (const pol of pols ?? []) {
          const fid = byAgent[pol.agent_id];
          if (fid) production[fid] = (production[fid] ?? 0) + Number(pol.annual_premium ?? 0);
        }
      }
    }

    return (funnels ?? []).map((f) => ({ ...f, production: production[f.id] ?? 0 }));
  });

export const createFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        slug: z.string().trim().min(3).max(50).regex(slugRe, "Use lowercase letters, numbers, and hyphens"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("recruiting_funnels")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (existing) return { ok: false as const, error: "That URL is already taken." };
    const { data: row, error } = await supabase
      .from("recruiting_funnels")
      .insert({ agent_id: userId, name: data.name, slug: data.slug, published: true })
      .select()
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, funnel: row };
  });

export const deleteFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("recruiting_funnels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getRecruitingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("recruiting_prospects")
      .select("stage")
      .eq("recruiter_id", userId);
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {
      new: 0,
      callback: 0,
      in_course: 0,
      getting_licensed: 0,
      onboarded: 0,
    };
    for (const r of data ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
    const total = (data ?? []).length;
    const conversion = total ? Math.round((counts.onboarded / total) * 100) : 0;
    return { total, conversion, counts };
  });

export const listProspects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("recruiting_prospects")
      .select(
        "id,first_name,last_name,phone,email,stage,source,notes,created_at,funnel_id,linked_agent_id,tracker_type," +
          "recruiter:profiles!recruiting_prospects_recruiter_id_fkey(first_name,last_name)," +
          "recruiting_prospect_stage_history(changed_at)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => {
      const times = (p.recruiting_prospect_stage_history ?? []).map((h: any) => new Date(h.changed_at).getTime());
      const entered = times.length ? Math.max(...times) : new Date(p.created_at).getTime();
      const { recruiting_prospect_stage_history: _h, ...rest } = p;
      return { ...rest, stage_entered_at: new Date(entered).toISOString() };
    });
  });

const stageEnum = z.enum(["new", "callback", "in_course", "getting_licensed", "onboarded"]);

export const createProspect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        first_name: z.string().trim().min(1).max(60),
        last_name: z.string().trim().min(1).max(60),
        phone: z.string().trim().min(7).max(30),
        email: z.string().trim().email().max(120).optional().or(z.literal("")),
        source: z.string().trim().max(60).optional(),
        notes: z.string().trim().max(2000).optional(),
        stage: stageEnum.default("new"),
        tracker_type: z.enum(["recruiting", "client"]).default("recruiting"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("recruiting_prospects")
      .insert({
        recruiter_id: userId,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        email: data.email || null,
        source: data.source ?? null,
        notes: data.notes ?? null,
        stage: data.stage,
        tracker_type: data.tracker_type,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateProspectStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), stage: stageEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("recruiting_prospects")
      .update({ stage: data.stage })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProspect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("recruiting_prospects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProspectDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [prospect, history, notes] = await Promise.all([
      supabase.from("recruiting_prospects").select("*").eq("id", data.id).maybeSingle(),
      supabase
        .from("recruiting_prospect_stage_history")
        .select("from_stage,to_stage,changed_at")
        .eq("prospect_id", data.id)
        .order("changed_at", { ascending: true }),
      supabase
        .from("recruiting_prospect_notes")
        .select("id,note,created_at,agent_id")
        .eq("prospect_id", data.id)
        .order("created_at", { ascending: false }),
    ]);
    if (prospect.error) throw new Error(prospect.error.message);
    return {
      prospect: prospect.data,
      history: history.data ?? [],
      notes: notes.data ?? [],
    };
  });

export const addProspectNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ prospect_id: z.string().uuid(), note: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("recruiting_prospect_notes")
      .insert({ prospect_id: data.prospect_id, agent_id: userId, note: data.note });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfileBasics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("first_name,last_name,email,phone,avatar_url,agent_slug")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });
