/** Sends one "finish building" reminder per unfinished builder session idle for 24h. */
export async function sendOnboardingResumes() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { queueEmail, APP_ORIGIN } = await import("@/lib/email/send.server");
  const admin = supabaseAdmin as any;
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: rows } = await admin.from("onboarding_sessions")
    .select("user_id, path, answers").is("completed_at", null).is("resume_sent_at", null).lt("updated_at", cutoff).limit(25);
  let sent = 0;
  for (const r of rows ?? []) {
    // Claim first so overlapping runs can't double-send.
    const { data: claimed } = await admin.from("onboarding_sessions").update({ resume_sent_at: new Date().toISOString() })
      .eq("user_id", r.user_id).is("resume_sent_at", null).select("user_id");
    if (!claimed?.length) continue;
    const { data: u } = await admin.auth.admin.getUserById(r.user_id);
    if (!u?.user?.email) continue;
    await queueEmail({
      template: "onboarding-resume", to: u.user.email, profileId: r.user_id, category: "transactional",
      key: `onboarding-resume:${r.user_id}`,
      data: { firstName: r.answers?.firstName, path: r.path, appUrl: APP_ORIGIN },
    }).catch(() => {});
    sent++;
  }
  return sent;
}
