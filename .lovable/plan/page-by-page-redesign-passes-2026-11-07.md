# Page-by-page redesign passes

Goal: every signed-in page should feel like Agency settings. That means a clear title and one-line description, a small set of cards for the main job, a summary or preview column on the right, and the detailed or rarely used controls tucked under "Advanced". Data, rules and permissions stay the same. Only layout and presentation change.

## The pattern each page gets
- **Top:** a title, a one-line description and at most one main button (for example "Post a Deal" or "Add client").
- **Main column:** 1–3 cards for the page's core task. Big tap targets and plain-language labels.
- **Right column (desktop):** a summary or preview card, such as key numbers, "what's next" or a live preview of what you're editing. On phones it stacks below the main column.
- **Filters:** pill chips instead of rows of dropdowns. Rare filters go under "More filters".
- **Advanced:** bulk tools, exports, raw tables, audit logs and edge-case settings move into the shared Advanced drawer at the bottom.
- **States:** shared empty cards (with one helpful next step) and loading skeletons. No blank pages.

## Group 1: Daily work (first)
- **Dashboard:** greeting with 3 headline numbers (this month's premium, policies, commission). A "Today" card with tasks, callbacks and birthdays. Recent deals. Right column: goal progress ring and a leaderboard snapshot. Charts move into "More insights".
- **Pipeline:** stage columns as soft cards with counts. Hot/warm/cold chips. Right column: stage totals and next follow-ups.
- **Clients:** search plus chips (All, Mine, Hot, Birthdays this month). A simple list showing name, phone, last touch and status. Right column: a preview of the selected client (policies, notes, next step). Import, merge and bulk edit move to Advanced.
- **Client detail:** a header card with key facts. Tabs become stacked cards (Policies, Notes, Beneficiaries, Documents). Banking and sensitive fields stay under Advanced.
- **Book of Business:** status chips and a policy list with carrier logos. Right column: book totals (active premium, at-risk, lapsed). Columns and export move to Advanced.
- **Tasks and Calendar:** a "Today / This week" focus card and an upcoming list. Right column: a mini calendar and counts. Recurring events and settings move to Advanced.
- **Post a Deal:** already done. Light polish only.

## Group 2: Money
Finances, Reconciliation, Reports, Analytics, Leaderboard, Challenges and Trophy Case get headline money cards, a summary column (period totals and trends), period chips (Week, Month, Quarter, Year) and Advanced for statement lines, raw exports and adjustments. Leaderboard and Trophy Case get podium-style top 3 cards.

## Group 3: Agency and team
Agency overview, Team, Back office, Licensing, Intake, Onboarding, Retention, Announcements and News get people cards with avatars, a "needs attention" summary column and Advanced for bulk and audit tools. Announcements gets a live preview of the post while you write it.

## Group 4: Contracting
Contracting, Contracting ops, Comp grids, Carrier sync and Import get a request card flow (carrier → state → send) with a status preview, plus a progress summary column (pending, in review, active). Grid editors, field mappings and logs move to Advanced.

## Group 5: Account and settings
Account, Billing, Security, Notifications, Nova Pro, Usage, Emails, Templates, Support and Sub-agencies use the hub card layout from Agency settings: choice cards and switches with autosave. Billing shows a plan card with its renewal date. Templates and Emails get a live preview.

## Group 6: Nova, Resources and Tools
- **Nova:** a chat-first layout with suggestion chips, and a right column showing what Nova can do now and what's coming.
- **Resources and Tools:** a card grid with categories as chips.

## How each group ships
1. Rebuild the group's pages on the shared building blocks.
2. Open every page as your account on desktop (1280px) and phone (390px), and check it renders with real data, not just loading screens.
3. Mark the group done on the roadmap. Then move on to the next group.

Group 1 is first. After each group you get a summary before the next one starts.

## Technical details
- Use only the existing shared building blocks (HubCard, HubLayout/PreviewCard, AdvancedDrawer, ChoiceCards, FilterChips, EmptyCard, CardSkeleton, Panel, HeroBand). Add new shared pieces to the same shared folder only when two or more pages need them, for example a stat tile (StatTile) and a summary column (SummaryColumn).
- No database or server logic changes. Existing queries, access gates and permission checks stay untouched. Summary numbers come from data each page already loads, or from existing database functions (dashboard metrics, team KPIs, book of business).
- Colors come only from the theme's shared color settings (gold accents, traffic-light colors for statuses).
- Large pages are split into section components next to the page file to keep each one manageable.
