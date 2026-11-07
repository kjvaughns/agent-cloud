# Redesign every Agent Cloud page in the Agency-settings style

The new style: soft rounded cards with a clear title and a short line under it, big tap-friendly choices instead of dropdowns, autosave with a "Saved" tick, a sticky preview or summary column on wide screens, and the detailed controls tucked under an "Advanced" section at the bottom.

There are about 60 signed-in pages, and 106 files share the same page frame (335 cards in total). So the work happens in two layers.

## Layer 1: restyle the shared frame (every page changes at once)
- Page header: bigger title, one-line description, actions on the right as pill buttons. This matches the Agency settings header.
- Cards: the same rounded hub card everywhere (padding, title size, blurb, optional "Saved" indicator).
- Empty states: one friendly empty card with an icon, one sentence and one main button.
- Loading: soft skeleton cards shaped like the real content, not grey bars.
- Tables: lighter rows, avatar or initial circles, badges for status, and a stacked card list on phones.
- Filters: pill chips instead of dropdowns where there are 5 or fewer options.
- One shared "Advanced" drawer and side-preview column, available to any page.

## Layer 2: page-by-page polish, in groups
Each group gets the full treatment: main card first, a summary or preview column where it helps, and the rarely used controls moved under Advanced.

1. **Daily work**: Dashboard, Pipeline, Clients, Book of Business, Post a Deal, Tasks, Calendar. Post a Deal gets a live "how this deal will look" preview.
2. **Money**: Finances, Reconciliation, Reports, Analytics, Leaderboard, Challenges, Trophy Case. Summary column with key totals.
3. **Agency and team**: Agency, Team, Back office, Licensing, Intake, Onboarding, Retention, Announcements, News feed. Announcements gets a preview of the post.
4. **Contracting**: Contracting, Contracting ops, Comp grids, Carrier sync, Import. Big upload drop zones and step cards.
5. **Account and the remaining settings**: Account, Billing, Security, Notifications, Nova Pro, Usage, Emails, Templates, Support/Help, Sub-agencies. Each becomes one hub card with autosave and an Advanced section. Email templates get a live preview.
6. **Nova, Resources and Tools**: Nova, AI assistant, Resources, Tools, Phone.

After each group I'll check desktop and phone in the browser as your account before moving to the next one.

## What stays the same
- No features removed, no data or permission changes. Everything is only moved, regrouped or restyled.
- Marketing pages (landing, pricing, /start) are not part of this. They already have their own look.
- Gold, cream and ink colors stay. Dark mode keeps working.

## Technical details
- Promote `hub-card.tsx` primitives (HubCard, HubLayout, PreviewCard, AdvancedDrawer, ChoiceCards, SavedIndicator) into `src/components/ui-kit/` and re-export them from `page-shell.tsx`.
- Restyle `PageShell`, `Panel`, `HeroBand` and `SectionHeader` in place so all 106 importers update without edits. Keep their props backwards compatible.
- Add shared `EmptyCard`, `CardSkeleton`, `ResponsiveTable` (table on desktop, card list under `md`) and `FilterChips`.
- Tokens only: any new surface or shadow values go in `src/styles.css`. No hard-coded colors.
- Page groups are done one at a time, with a typecheck and a Playwright pass at 1280px and 390px after each group.
- Record one AGENTS.md rule: signed-in pages compose from the shared hub primitives.
