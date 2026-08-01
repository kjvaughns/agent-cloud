import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Let somebody in, and only send them to the login page when they really are
 * signed out.
 *
 * Six route guards used to do this by hand, all the same way:
 *
 *     const { data } = await supabase.auth.getSession();
 *     if (!data.session) throw redirect({ to: "/login" });
 *
 * The problem is what that treats as "signed out". `getSession()` returning
 * nothing covers two very different situations — there are no credentials in
 * this browser, and there are credentials but we could not read or refresh
 * them just now. The second happens: the tab was asleep and the access token
 * expired, two tabs raced to rotate the same refresh token, the storage lock
 * was busy. Bouncing somebody to the login screen because of a moment like
 * that is the difference between an app that is signed in and an app that
 * keeps forgetting you.
 *
 * So: ask once, and if the answer is no, give it one honest chance to recover
 * before throwing anybody out. A person who is genuinely signed out fails both
 * and goes to the login page a few hundred milliseconds later than before. A
 * person who is signed in stays signed in.
 *
 * These guards decide what to *render*. They are not a security boundary and
 * never were — row-level security decides what anybody may read.
 */
export async function requireSession(currentHref?: string) {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;

  // Second chance. If a refresh token is in storage this succeeds and the
  // person never notices; if there is nothing to refresh it fails immediately
  // and costs nothing.
  try {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) return refreshed.session;
  } catch {
    // Fall through to the redirect — no session and nothing to recover.
  }

  throw redirect({
    to: "/login",
    search: currentHref ? { redirect: currentHref } : undefined,
  });
}
