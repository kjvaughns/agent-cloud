/**
 * Whether this deployment can place a call or send a text.
 *
 * It cannot. There is no telephony provider configured anywhere in the
 * codebase — no client, no credentials, no env var — and five separate places
 * had independently worked that out: the automation sender blocks every SMS
 * channel, the automations panel badges the SMS trigger, notification settings
 * greys out the SMS row, the Stripe webhook leaves the phone number unassigned,
 * and Nova Pro's settings page showed a calling meter that could never move.
 *
 * The two that state the *refusal* now share one sentence, and there is a
 * single line to change on the day a provider is connected. The other three
 * keep their own wording — a badge on a trigger and a note under a switch read
 * better in their own voice — but none of them may now say something this
 * contradicts.
 *
 * Deliberately not an env var: reading one would imply that setting it makes
 * calling work, and it would not.
 */
export const TELEPHONY_CONNECTED = false;

/** Said the same way wherever a call or a text is refused. */
export const TELEPHONY_UNAVAILABLE =
  "No telephony provider is connected, so calling and SMS are not available yet.";
