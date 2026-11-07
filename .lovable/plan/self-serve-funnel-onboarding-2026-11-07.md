# Self-Serve Funnel & Onboarding

Goal: a stranger from an ad can sign up, pay, set up their agency and start using Agent Cloud without ever talking to you. Demo stays as an option for big agencies.

## 1. Landing page and signup
- Main button becomes "Start now" (Solo $199 or Agency $999); "Book a demo" becomes the secondary button, labeled for 25+ agent teams.
- `/signup` stops redirecting to the demo form and becomes a real signup page: pick plan, name, email, password (or Google), agency name.
- Pricing cards link straight into signup with the plan picked.
- Existing `/signup/agent` (solo) folds into the same page; old links keep working.

## 2. Pay first, then set up
- After the account is created, the workspace opens in read-only mode (already built) with the checkout window on top.
- Paying with the card unlocks everything; closing it leaves them read-only with a "Choose a plan" banner (already built).
- Optional: 7-day free trial on both plans (question below).

## 3. Setup wizard (owners only, shown until finished)
1. **Agency** – name, logo, brand color, portal web address.
2. **Carriers & book** – pick carriers, upload a CSV or a carrier statement (uses existing import and carrier sync), or "skip, I'll add later".
3. **Team** – invite agents by email, set their comp level and upline (Agency plan only; Solo skips).
4. **Agency Suite** – one click turns on their Academy, Licensing partner code and recruit link, Bankdocs and Release Center. Shows the codes/links to copy.
- Progress saved after every step; they can leave and come back. Afterwards the existing dashboard checklist takes over.
- Sample data remains an option for people who just want to look around.

## 4. Short how-to videos
- A "Watch how it works" button on Post a Deal, Pipeline, Book of Business, Carrier Sync, Comp/Hierarchy, Contracting and Trophy Case.
- Opens a 45–60 second video in a small window; can be dismissed per page.
- Videos are stored in the app so you can swap them later. I will start with placeholder slots; real recordings come from you (or screen-recorded walkthroughs we produce later).

## 5. Allison inside the app
- Help bubble in the corner of every signed-in page, chatting with Allison.
- She uses the same product knowledge as her emails, plus knows which page the person is on and how far they got in setup.
- Same rules as email: no refunds, discounts, billing changes or account access; those get the question-first escalation that emails you at kjvaughns13@gmail.com.
- Conversations saved so you can read them in Admin → Support.

## 6. Welcome emails
- Branded email series from noreply (reply goes to Allison): Day 0 welcome + setup link, Day 1 "finish setup" if not done, Day 3 "add your team", Day 7 tips. Stops once they finish the matching step.

## 7. Tracking
- Funnel steps logged: landing visit → signup → paid → each wizard step → first deal posted. Admin page shows drop-off so you know where ads money leaks.

## Technical details
- New `signup` route with plan search param; server fn reuses the existing org-creation logic in billing.functions.ts (org, membership, agency_owner role, `billing_comped=false`), with `plan_type` = solo/agency.
- Checkout uses existing `useBillingCheckout`; access stays decided only by `computeAccess`.
- `organizations` gets `onboarding_step` / `onboarding_completed_at`; wizard at `_authenticated/onboarding` (extend existing route) with a redirect guard for unfinished owners.
- Agency Suite step stores partner code / academy link on the org; actual cross-app provisioning (calling Academy/Licensing apps) is Phase 3 of the suite plan — here it records and displays them.
- `help_videos` table (page key, video URL) + dismissals per user.
- In-app Allison: `allison_chats` table, server fn using the AI Gateway SDK and `knowledge.ts`; escalation reuses `escalation.ts`.
- Nurture emails via existing queue + a cron route; funnel events table + admin view.
- Tests: signup creates unpaid read-only agency; paying unlocks; wizard guard; email stop rules.

## Testing in the preview
1. Sign out, click "Start now" → Agency, create an account.
2. Pay with 4242 4242 4242 4242, any future date, any CVC.
3. Walk the four setup steps; confirm the dashboard opens after.
4. Open the help bubble and ask Allison a setup question.

## Open questions
- Free trial: none, or 7 days?
- Should Agency signups require a credit card before entering the app, or allow read-only browsing first (current plan)?
