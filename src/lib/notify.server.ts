/**
 * The one way an in-app notification gets sent.
 *
 * The notifications screen offers seven categories a person can switch off.
 * `public.may_notify(profile, category)` exists to enforce them, and the email
 * sender has consulted it since it shipped.
 *
 * In-app notifications did not. Eleven writers insert into `notifications`
 * across the contracting modules, the transfer flow, tasks and SureLC, and
 * exactly two of them — the invite path and announcements — asked the
 * preference first. Everything else wrote regardless.
 *
 * So an agent who turned "Contracting updates" off, a switch whose own
 * description reads "Carrier appointments, level changes, transfers", kept
 * receiving every carrier-request status change, every level decision and
 * every transfer. The switch changed nothing. That is the same defect as a
 * dead toggle, on the screen where a person goes specifically to be left
 * alone.
 *
 * ── Defaulting to send ──
 *
 * A null answer from `may_notify` — the function missing, the row absent, an
 * error — means send. The preference defaults to on, so the safe failure is
 * the one that matches what somebody who has never opened the screen expects.
 * Silence caused by a broken lookup is the worse outcome: nobody reports a
 * notification they never knew was coming.
 *
 * ── Never fatal ──
 *
 * Same contract every notification path here already keeps. The thing being
 * announced has already happened by the time this runs, and a failed insert
 * must not undo it.
 */

/** Every category the notifications screen offers, as `may_notify` names them. */
export type NotifyCategory =
  | "task_assigned"
  | "policy_at_risk"
  | "commission_posted"
  | "contract_updates"
  | "team_activity"
  | "announcements"
  | "billing";

export type NotificationInput = {
  /** Who to tell. Duplicates and falsy ids are dropped. */
  userIds: (string | null | undefined)[];
  category: NotifyCategory;
  title: string;
  description?: string | null;
  /** `notifications.type` — the icon and grouping, not the preference. */
  type: string;
  /** Nobody is told about something they did to themselves. */
  exceptUserId?: string | null;
};

/**
 * Filter a list of people down to those who still want this kind of message.
 *
 * Exported separately because a couple of callers need the count of people
 * who were reachable, not just the send.
 */
export async function allowedRecipients(
  client: any,
  userIds: (string | null | undefined)[],
  category: NotifyCategory,
  exceptUserId?: string | null,
): Promise<string[]> {
  const ids = Array.from(
    new Set(userIds.filter((id): id is string => Boolean(id) && id !== exceptUserId)),
  );
  if (ids.length === 0) return [];

  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const { data } = await client.rpc("may_notify", { _profile: id, _category: category });
        // Only an explicit false silences. See the note above.
        return data === false ? null : id;
      } catch {
        return id;
      }
    }),
  );
  return results.filter((id): id is string => Boolean(id));
}

/**
 * Send one notification to everybody who still wants it.
 *
 * Returns how many were written, which is what a caller that logs a delivery
 * outcome needs — "nobody was told because everybody opted out" and "nobody
 * was told because the insert failed" are different answers.
 */
export async function notifyPeople(client: any, input: NotificationInput): Promise<number> {
  try {
    const recipients = await allowedRecipients(
      client,
      input.userIds,
      input.category,
      input.exceptUserId,
    );
    if (recipients.length === 0) return 0;

    const { error } = await client.from("notifications").insert(
      recipients.map((id) => ({
        user_id: id,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        read: false,
      })),
    );
    if (error) {
      console.error("[notify] insert failed:", error.message);
      return 0;
    }
    return recipients.length;
  } catch (e: any) {
    console.error("[notify] failed:", e?.message);
    return 0;
  }
}
