-- A Discord channel says which kinds of message it wants, and means it.
--
-- `discord_integrations` already offers three per-channel switches. Two of
-- them do nothing at all:
--
--   post_deals        honoured by announceDeal
--   post_new_agents   stored, shown in Settings with the description "When
--                     someone joins the agency", read by nothing
--   post_milestones   stored, shown as "Production milestones and streaks",
--                     read by nothing — and there is no milestone or streak
--                     concept anywhere in the product for it to read
--
-- And agency announcements, which do send, honour none of them: the sender
-- filters on `enabled` alone. So a channel an owner set up purely for deal
-- alerts also receives every agency-wide announcement, and the only way to
-- stop that is to turn the whole channel off.
--
-- This adds the switch that was missing rather than another that is ignored.
-- It defaults to true, so every existing channel keeps receiving exactly what
-- it receives today and nobody's announcements go quiet because a migration
-- ran.
--
-- `post_milestones` is deliberately NOT dropped. The column stays and the
-- control is removed from Settings, because forward-only means a column that
-- has become unused is left alone — but a switch a person can set that can
-- never do anything is worse than no switch, and it is the UI that has to go.
-- If milestones are built later, the column is still here.
--
-- Forward only. Nothing is dropped and no existing row changes meaning.

alter table public.discord_integrations
  add column if not exists post_announcements boolean not null default true;

comment on column public.discord_integrations.post_announcements is
  'Whether agency announcements are posted to this channel. Defaults true: before this column existed every enabled channel received them.';

-- `discord_deliveries` already carries `event_type` and a nullable `policy_id`,
-- so an announcement and a new-agent post record through the same ledger the
-- deal posts use. Nothing to add there — but the partial unique index that
-- stops a deal being announced twice is keyed on policy_id, which these events
-- do not have, so they simply are not covered by it. That is correct: an
-- announcement posted twice is a visible duplicate somebody can delete, while
-- silently dropping the second of two genuinely different announcements would
-- not be.

notify pgrst, 'reload schema';
