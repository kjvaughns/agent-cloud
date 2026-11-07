/** Kept legacy data is notification-only. Never consult it before sending. */
export interface TerminalEmailEvent {
  event_id: string;
  data: { recipient: string; message_id: string };
}

const OUTCOMES = {
  bounce: { status: "bounced", message: "Permanent bounce — email address is invalid or rejected" },
  complaint: { status: "complained", message: "Spam complaint — recipient marked email as spam" },
  unsubscribe: { status: "suppressed", message: "Recipient unsubscribed" },
} as const;

export async function recordEmailOutcome(
  database: any,
  event: TerminalEmailEvent,
  reason: keyof typeof OUTCOMES,
) {
  // Deterministic primary key makes the append-only log safe across retries
  // and concurrent deliveries without adding tables or changing constraints.
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`email-event:${event.event_id}`)));
  const hex = Array.from(hash.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const { data: existing, error: lookupError } = await database.from("email_send_log").select("id").eq("id", id).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) return;
  const recipient = event.data.recipient.toLowerCase();
  const { error: suppressionError } = await database.from("suppressed_emails").upsert({
    email: recipient, reason, metadata: null,
  }, { onConflict: "email" });
  if (suppressionError) throw new Error(suppressionError.message);
  const outcome = OUTCOMES[reason];
  const { error: logError } = await database.from("email_send_log").insert({
    id, message_id: event.data.message_id ?? null, template_name: "system",
    recipient_email: recipient, status: outcome.status,
    error_message: outcome.message, metadata: null,
  });
  if (logError && logError.code !== "23505") throw new Error(logError.message);
}