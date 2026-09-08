/**
 * Carrying a half-typed policy from the pipeline drawer to Post a Deal.
 *
 * ── The trap this closes ──
 *
 * The drawer's Policy Information tab opens an Add Policy form automatically
 * for any client with no policies yet. Two inches above it, in the drawer
 * header, sits a "Post Deal" button — and it navigated to `/post-deal` with
 * nothing but the client id. Everything typed into the form was component
 * state, so it went in the bin, and `getClientDealPrefill` had nothing to
 * restore because it reads the `policies` table and the form was never
 * submitted.
 *
 * So the agent typed the carrier, the product, the policy number, the premium
 * and the face amount, pressed the most prominent button on the screen, and
 * arrived at an empty form. Every time. Nothing warned them, because from the
 * code's side nothing had been lost — it had never been saved.
 *
 * ── Why the URL rather than router state ──
 *
 * Router state is lost on a refresh, and the first thing somebody does when a
 * form looks wrong is reload it. The route already validates its search
 * params, so this is the mechanism that is there rather than a second one
 * beside it, and back/forward keep working.
 *
 * Only what the agent actually filled is carried. A draft with nothing
 * meaningful in it encodes to nothing at all, so pressing Post Deal on an
 * untouched form navigates exactly as it did before.
 *
 * Nothing here writes. A draft is a draft until Post a Deal is submitted, and
 * a half-typed policy must not become a row.
 */

/** The fields both forms share, all as strings — these came out of inputs. */
export type PolicyDraft = {
  carrier_id?: string;
  product?: string;
  policy_number?: string;
  effective_date?: string;
  face_amount?: string;
  monthly_premium?: string;
  status?: PostDealStatus;
  sale_date?: string;
};

/**
 * Post a Deal offers two statuses; the drawer and the policy table carry more.
 *
 * `getClientDealPrefill` had this rule inline. It is here so the two ways of
 * arriving at the form cannot disagree about what "active" preselects to —
 * anything past submission is not a status this form is entitled to set, and
 * silently preselecting one would let an agent re-post a live policy as new.
 */
export type PostDealStatus = "submitted" | "issued_not_paid" | "in_review";

export function postDealStatus(status: string | null | undefined): PostDealStatus {
  if (status === "in_review") return "in_review";
  if (status === "submitted") return "submitted";
  return "issued_not_paid";
}

/**
 * The fields that mean the agent has actually started.
 *
 * `status` and `sale_date` are excluded on purpose: both are prefilled by the
 * drawer with a default the agent never chose, so treating either as content
 * would make an untouched form look half-filled.
 */
const CONTENT_KEYS = [
  "carrier_id", "product", "policy_number", "effective_date", "face_amount", "monthly_premium",
] as const;

export function draftHasContent(draft: PolicyDraft | null | undefined): boolean {
  if (!draft) return false;
  return CONTENT_KEYS.some((k) => String(draft[k] ?? "").trim() !== "");
}

const DRAFT_KEYS = [
  ...CONTENT_KEYS, "status", "sale_date",
] as const;

/** Search params for the fields worth carrying, or nothing at all. */
export function encodePolicyDraft(draft: PolicyDraft | null | undefined): Record<string, string> {
  if (!draftHasContent(draft)) return {};
  const out: Record<string, string> = {};
  for (const k of DRAFT_KEYS) {
    const v = String(draft![k] ?? "").trim();
    if (v) out[`d_${k}`] = v;
  }
  return out;
}

/** The other side of the same wire. Unknown or empty values are simply absent. */
export function decodePolicyDraft(search: Record<string, unknown>): PolicyDraft {
  const out: PolicyDraft = {};
  for (const k of DRAFT_KEYS) {
    const raw = search[`d_${k}`];
    if (typeof raw !== "string" || raw.trim() === "") continue;
    if (k === "status") out.status = postDealStatus(raw);
    else out[k] = raw;
  }
  return out;
}

/**
 * The same draft, kept for the trip through any other door.
 *
 * The URL handoff only works for the one button that knows about the draft.
 * An agent who types a policy in the drawer and then reaches Post a Deal from
 * the sidebar, the top bar or the pipeline row lands on an empty form, which
 * from their side is identical to losing the lot.
 *
 * Session storage, not local: this is a half-finished thought inside one tab,
 * and it must not resurface tomorrow. Stale after 30 minutes for the same
 * reason. Still never written to the database.
 */
const SESSION_KEY = "agentcloud:policy-draft";
const MAX_AGE_MS = 30 * 60_000;

export function stashPolicyDraft(clientId: string, draft: PolicyDraft | null | undefined): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!draftHasContent(draft)) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ clientId, draft, at: Date.now() }));
  } catch {
    /* private mode, quota — a lost draft is not worth an exception */
  }
}

export function clearStashedPolicyDraft(): void {
  if (typeof sessionStorage === "undefined") return;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** The stashed draft, if there is a fresh one. */
export function readStashedPolicyDraft(): { clientId: string; draft: PolicyDraft } | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { clientId?: string; draft?: PolicyDraft; at?: number };
    if (!parsed?.draft || !draftHasContent(parsed.draft)) return null;
    if (!parsed.at || Date.now() - parsed.at > MAX_AGE_MS) return null;
    return { clientId: String(parsed.clientId ?? ""), draft: parsed.draft };
  } catch {
    return null;
  }
}
