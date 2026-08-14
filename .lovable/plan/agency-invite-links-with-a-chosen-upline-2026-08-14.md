# Agency invite links with a chosen upline

Today every invite link places the new person under whoever created the link. The Invite Links page (Contracting > Invite) has no upline field, and both accept paths copy `created_by` onto the new profile's `upline_id`. An agency owner or manager cannot mint a link that puts someone under a different agent on their team.

## What changes

On the Invite Links builder, add an **Upline** picker:

- Defaults to "Me (<your name>)", so today's behaviour is unchanged if you don't touch it.
- Lists every agent with an account in your agency, searchable by name, showing name plus email so duplicates are distinguishable.
- Whoever is picked becomes the new agent's upline when the link is accepted — whether they sign up fresh or link an existing account.
- The created link's row in the table shows the upline it places people under, so a reusable link's effect is readable later.

Who may pick someone other than themselves:

- Agency owners, admins and super admins: any agent in the agency.
- Managers: themselves or anyone in their own downline (they cannot place recruits under a peer or above themselves).

The pre-assigned carriers and commission levels on the link continue to be validated against the creator's own levels, unchanged.

## Technical notes

1. Migration: add `upline_id uuid references public.profiles(id) on delete set null` to `public.invitation_links`, with an index. Nullable, so existing rows keep meaning "use `created_by`".
2. `createOnboardingInvite` (`src/lib/onboarding.functions.ts`): accept optional `upline_id`. Validate server-side that the target profile is in the caller's organization, and — when the caller is only a manager — that `is_in_downline(caller, target)` or target = caller. Store on the insert.
3. Resolve the upline once, in `loadInviteForUser`'s consumers: `acceptInviteCreateAccount` (line ~390) and `linkInviteToCurrentUser` (line ~556) use `inv.upline_id ?? inv.created_by`. Also pass the same value as `directUplineId` when the invite provisions contracting requests, so pre-assigned carrier requests route to the right upline.
4. New server fn `listAgencyAgentsForUpline` in `src/lib/onboarding.functions.ts` (or reuse `listScopeAgents` with scope `agency`/`team` based on role) returning `{ id, first_name, last_name, email }` for active agency profiles.
5. `listOnboardingInvites` selects `upline_id` plus the joined upline name so the table column can render it.
6. UI in `src/routes/_authenticated/contracting/invite.tsx`: a Popover + search Command list (same pattern as the existing carrier picker) beneath the role/position fields; state `uplineId` defaulting to `""` meaning self.
7. Regenerate Supabase types after the migration.
