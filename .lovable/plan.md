# Automations tab: drop the run log, rebuild Discord as separate bots

## What's wrong today (verified)

- The "Add channel" form only collects a webhook URL, a channel label, and a premium threshold. It never asks which events the bot handles, so a new bot lands on the database defaults: deals **on**, announcements **on**, new agents **off**. That's exactly the reported symptom — you create a "sales" webhook and it also posts announcements.
- The per-bot event switches read `value !== false`, and the announcement sender does the same, so "off" is hard to trust from the UI.
- The delivery ledger has no stable event identifier (only a per-policy uniqueness rule for deals). Announcements and new-agent posts can be sent twice on a retry, and there is no way to retry a failed delivery.
- The Automations tab also renders a scheduled-jobs run log that you want removed.

## What I'll build

### 1. Remove the run log

Delete the run-log table and the scheduled-job cards from the Automations tab so the tab is only agency-owned workflows (Discord for now). The underlying job scheduler keeps running; only this surface goes away.

### 2. "Add Discord Bot" as one real form

One **Add Discord Bot** button opens a dialog collecting everything up front:

- Bot name
- Purpose / description
- Discord channel name
- Discord webhook URL
- Event types — Sales, Announcements, New Agents (any combination, checkboxes, at least one required)
- Enabled toggle
- Optional: only post sales at or above an annual premium

Nothing is defaulted behind your back: whatever you check is exactly what that bot sends. So a Sales Bot posts only sales, an Announcements Bot posts only announcements, and an Agency Bot posts all three — each pointed at its own channel.

### 3. Bot cards

Each saved bot shows: name, purpose, channel, selected events as pills, enabled status, masked webhook, last successful delivery, last error, and actions — Send test, Edit, Enable/Disable, Remove. The full webhook URL is never returned to the browser; editing shows the masked value and you can paste a replacement.

### 4. Deliveries: stable identity + retry

- Add a `description` column and an `event_key` column to the delivery ledger, with a uniqueness rule on successfully-sent keys so the same event can never post twice into the same bot.
- Failed deliveries get a **Retry** action that re-sends using the same event key, so a retry either lands once or is recognised as already sent.
- A per-bot deliveries list showing sent / skipped / failed with the reason.

### 5. Message contents (tightened)

- Sales: agent name, carrier, product **category**, monthly and annual premium, face amount. No client or insured name, no policy number.
- Announcements: published title and body only.
- New agents: agent name, position, agency welcome message. No application or licensing detail.
- The existing PII scan runs on every outgoing message; a blocked send is recorded with its reason rather than sent.

## Technical notes

- Migration: `discord_deliveries` gains `event_key text` plus a unique index on `(integration_id, event_key)` where `status = 'sent'`; `discord_integrations` gains `description text`. Grants and RLS stay as they are.
- `src/lib/discord.functions.ts`: `saveDiscordSettings` accepts the full create payload (name, description, channel, events, enabled, threshold) and requires explicit event booleans on create; event filters switch from `!== false` to `=== true`. Adds `retryDiscordDelivery` and a per-bot `listDiscordDeliveries`. Senders route through `eventKey()` from `src/lib/discord/message.ts` and the allowlisted builders so a sale carries product category, not the specific plan.
- `src/components/discord-settings.tsx` is rewritten as a bot-card list plus an add/edit dialog.
- `src/components/settings/automations-panel.tsx` loses the job cards and run-log table; `src/routes/_authenticated/settings.agency.tsx` renders Discord as the Automations tab's content.
- Checks in `scripts/discord-message-check.ts` and `scripts/discord-channels-check.ts` extended to assert per-bot event isolation and event-key idempotency.
