# Announcement emails that actually send, and an @everyone ping for Discord

## What's wrong today

Announcement emails are being refused before they ever leave the app. The delivery ledger shows the last announcement went to 10 people in-app and 1 Discord channel, and "0 of 10" by email. The email log gives the exact reason: `org_emails_disabled` for all 10 attempts.

Email sending checks two consents. The second one (each person's notification preference) works. The first one — the agency-level "emails are on" switch, stored in `organization_settings.emails_enabled` — is `false` for every organization in the database, and there is no screen anywhere in the app that can turn it on. So every announcement email, and every other non-exempt app email, is suppressed by a switch nobody can reach.

The sender domain itself is fine: `notify.useagentcloud.com` is verified and the queue is healthy.

## What gets built

### 1. An email delivery control the agency owner can actually use

In Agency settings → Emails, above the activity log:

- A master switch: "Send email notifications from this agency."
- Per-category switches underneath (announcements, tasks, contracting, commissions, team activity, billing), stored in `email_categories`.
- When the master switch is off, a plain-language notice explains that only account-critical email (password resets, invitations) is sent.
- Only the agency owner can change it; everyone else sees it read-only.

### 2. The composer stops lying about email

In the announcement composer, the Email checkbox shows its real state: if the agency has email off, the checkbox is disabled with an inline "Email is turned off for your agency — turn it on in Settings → Emails" and a link. No more ticking a box that guarantees nothing.

### 3. Skips say why, in the ledger

`announcement_deliveries` currently records email as `skipped / "0 of 10"` with no reason. It will carry the dominant refusal reason (`org_emails_disabled`, `recipient_opted_out`, `address_suppressed`, …) so the next silent send is diagnosable from one row instead of by cross-referencing the email log.

### 4. @everyone for Discord announcements

Two layers, because both are wanted in practice:

- **Per channel default** (Settings → Integrations → Discord): each Discord channel gets a "Mention on announcements" choice — None, @here, @everyone.
- **Per post override** in the announcement composer: a "Ping @everyone in Discord" switch, on by default only if at least one channel already has a mention configured. Off means no ping regardless of channel defaults; on means @everyone even where the channel default is None.

Discord embeds cannot ping, so the mention goes in the message `content` line above the embed, with `allowed_mentions` set to permit exactly that mention and nothing else — so a body containing `@everyone` text can never ping on its own.

## Technical notes

- Migration: add `announcement_mention text default 'none'` (check constraint `none|here|everyone`) to `public.discord_integrations`. No new table.
- New server functions in a settings functions module: `getOrgEmailSettings` / `updateOrgEmailSettings`, both owner-gated (same check `canPostAnnouncements` uses), upserting `organization_settings`.
- `announceToDiscord(orgId, title, bodyHtml, subjectId, mention?)` gains an optional mention argument; `deliver()` in `src/lib/announcements.functions.ts` threads it through, and `createAnnouncement` / `updateAnnouncement` / `dispatchAllDueAnnouncements` accept and persist a `mentionEveryone` flag (stored on the announcement row so a scheduled post pings the same way when cron dispatches it).
- The idempotency key in `announceToDiscord` stays keyed on the announcement, so nothing double-posts.
- Email path itself is unchanged — `sendTransactionalEmail` already does the right thing once the org switch is on. No consent gate is weakened, and exempt categories keep working as they do now.
- `scripts/announcements-check.ts` and `scripts/discord-message-check.ts` get assertions for the mention payload shape and the email-skip reason.
