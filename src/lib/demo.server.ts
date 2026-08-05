/**
 * What the demo agency is not allowed to do.
 *
 * The demo org is an ordinary tenant — ordinary rows, ordinary RLS, ordinary
 * queries. Reads all work. Most writes work too, because a demo where nothing
 * works is worse than no demo: a visitor who clicks "Add client" and gets a
 * shrug learns that the product does not work, not that the demo is read-only.
 *
 * Five things are refused, and they share a shape — each one reaches outside
 * the database and touches somebody who did not ask to be part of a demo:
 *
 *   - Email and SMS, because the recipient is a real person.
 *   - Billing and checkout, because the card is a real card.
 *   - Invites, because they email a real person and mint a real account.
 *   - Outbound webhooks, because the far end is a real Discord channel.
 *   - Deleting the org, because the next visitor needs it.
 *
 * These are enforced here rather than in RLS deliberately. "This is an email
 * send" is not a fact the database has — the send happens in a server function
 * against a third party — so a policy could only ever approximate it. The
 * guard belongs where the outbound call is.
 */

import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";

const supabaseAdmin = _admin as any;

/** Every refusal names one of these, so the message is never a bare "no". */
export type DemoAction =
  | "send email"
  | "send a text message"
  | "start a checkout"
  | "open the billing portal"
  | "invite someone"
  | "send a webhook"
  | "delete the organization";

/**
 * There is exactly one demo org (a unique index says so), it changes roughly
 * never, and this is called on paths that already do real work. Caching the id
 * for the life of the server process turns a per-send round trip into one.
 *
 * `undefined` means not looked up yet; `null` means looked up and there is no
 * demo org, which is the normal state of a self-hosted deployment.
 */
let cachedDemoOrgId: string | null | undefined;

async function demoOrgId(): Promise<string | null> {
  if (cachedDemoOrgId !== undefined) return cachedDemoOrgId;
  try {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("is_demo", true)
      .maybeSingle();
    // A missing column means the migration has not landed, which means there
    // is no demo org yet. Cache that: retrying on every email send would turn
    // a pending migration into a per-send round trip that always fails.
    if (error) {
      cachedDemoOrgId = null;
      return null;
    }
    cachedDemoOrgId = (data?.id as string | undefined) ?? null;
  } catch {
    cachedDemoOrgId = null;
  }
  return cachedDemoOrgId;
}

/** Drops the cache. Called by the reset endpoint, and by provisioning. */
export function forgetDemoOrg(): void {
  cachedDemoOrgId = undefined;
}

export async function isDemoOrg(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  return orgId === (await demoOrgId());
}

/** The demo org a user belongs to, or null. Used where only a user id is in hand. */
export async function isDemoUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const demo = await demoOrgId();
  if (!demo) return false;
  try {
    const { data } = await supabaseAdmin
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("organization_id", demo)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

export class DemoRefusal extends Error {
  readonly action: DemoAction;
  constructor(action: DemoAction) {
    super(
      `This is the sample agency, so Agent Cloud will not ${action} from it. ` +
        `Everything else works — start a free account to do this for real.`,
    );
    this.name = "DemoRefusal";
    this.action = action;
  }
}

/**
 * Throws if this org is the demo. For write paths where refusing is the whole
 * answer and the caller should see why.
 */
export async function assertNotDemo(
  orgId: string | null | undefined,
  action: DemoAction,
): Promise<void> {
  if (await isDemoOrg(orgId)) throw new DemoRefusal(action);
}

/**
 * Throws if the signed-in user is a member of the demo org.
 *
 * The org-id variant is preferable where the org is already in hand, but the
 * billing functions resolve their org lazily and sometimes not at all
 * (`nova_pro_personal` is a personal subscription with no org involved), so
 * they need the check keyed on the caller.
 */
export async function assertNotDemoCaller(
  userId: string | null | undefined,
  action: DemoAction,
): Promise<void> {
  if (await isDemoUser(userId)) throw new DemoRefusal(action);
}

/**
 * The quiet variant, for paths that must not throw.
 *
 * `sendTransactionalEmail` never throws by contract — a failed email must not
 * break the operation that triggered it — so it needs a boolean, not an
 * exception. Same for the Discord notifier, which is fire-and-forget.
 */
export async function refusedForDemo(
  orgId: string | null | undefined,
  action: DemoAction,
): Promise<boolean> {
  const demo = await isDemoOrg(orgId);
  if (demo) console.log(`[demo] refused to ${action} for the demo org`);
  return demo;
}
