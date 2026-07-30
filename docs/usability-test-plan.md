# Usability test plan

Step 8 of the consolidation plan. This is the one step that cannot be built —
it needs four real people and somebody watching them. This document is what
makes that session runnable; it is not a substitute for running it.

The governing question throughout:

> Could a fourth grader understand what this page does and what to click next?

## How to run it

Four people, one at a time, about 25 minutes each. Screen share, recording on
if they consent.

**Give them the task and then stop talking.** The single most common way a
usability test produces nothing is the person running it explaining the
interface. Silence is the data. If somebody sits still for thirty seconds,
that is a finding, not an awkward pause to rescue.

Say this once at the start:

> I'm testing the software, not you. If you get stuck, that's the software's
> fault and it's exactly what I need to see. Think out loud where you can.

When they ask "should I click there?" — answer "what would you do if I
weren't here?"

## What to record

For each task, one line:

- **Done / Gave up / Wrong place** — no partial credit
- **Seconds to first click** — hesitation before moving is the clearest signal
  a page failed to answer "what do I do next"
- **Where they looked first** — sidebar, page body, search, top bar
- **The sentence they said when confused** — verbatim. These are worth more
  than the timings; they are the words the interface should have used.

Do not record whether they "eventually figured it out." Everyone eventually
figures it out. That is what makes it a bad measure.

---

## Agency owner — 5 tasks

Someone who runs a downline and is paying for this.

1. **"Tell me what needs your attention today, without clicking anything."**
   Tests whether the work queue reads as actions rather than decoration. If
   they scroll past it to the metrics, the ordering is wrong.
2. **"One of your agents can't sell yet. Find out who, and what's blocking them."**
   Tests the onboarding roster (step 5). Watch whether they go to Team,
   Contracting, or Getting agents ready.
3. **"Find out how much production the agency did this month."**
   Tests the merged Reports page (step 4). Watch for anyone hunting for
   "Analytics".
4. **"Change what a manager is allowed to see."**
   Tests whether Agency Admin is discoverable, or whether they hunt through
   Settings.
5. **"Find the commission percentage a specific carrier pays."**
   Tests the merged Compensation page — levels vs grids was two entries and is
   now one. Watch which tab they expect.

## Solo agent — 5 tasks

No agency, no staff, paying for themselves. The five-item sidebar audience.

1. **"You just sold a policy. Log it."**
2. **"Find a client you spoke to last week."** Watch whether they use search or
   navigate. Either is fine; how long it takes is the finding.
3. **"Check what you're owed."**
4. **"Your licence is expiring. Sort it out."** Tests the single Licensing
   entry point (step 4b) — they should get their own licences, not a roster.
5. **"Ask Nova something useful about your book."**

Also worth noting: does anything in their sidebar look like it belongs to
somebody else's job? Anything they cannot explain is a candidate for removal.

## Staff member — 5 tasks

Processes contracting. Queues, not scoreboards.

1. **"What's waiting on you right now?"**
2. **"A carrier sent a request back. Find it and fix it."**
3. **"Approve a document an agent uploaded."** Note: the count driving this was
   reading zero before the step-5 fix; confirm it now shows real numbers.
4. **"Find every agent whose licence expires in the next 45 days."**
5. **"Submit a completed request to the carrier."** Tests whether the readiness
   gate explains itself when it blocks them.

## New agent — 5 tasks

Signed up this week. Knows nothing. This is the most important of the four.

1. **"You've just logged in for the first time. What are you supposed to do?"**
   Say nothing else. This is the single highest-value question in the whole
   plan.
2. **"Get yourself ready to sell."** Tests the dashboard onboarding panel
   (step 5) — one step at a time.
3. **"Upload your E&O certificate."**
4. **"Find out which carriers you can write with."**
5. **"Find help."**

---

## Reading the results

**A task nobody completes is a bug, not a training problem.** Resist writing
"we should add a tooltip."

**Watch for the second-guess.** Somebody who clicks the right thing, backs out,
and clicks it again did not find it — they guessed correctly and did not trust
it. That is a labelling failure and it will not show up in a completion rate.

**Compare the new agent against everyone else.** The other three have context.
If a page only works for people who already know the product, it does not work.

## What to do with it

Combine the results with the usage report at `/agency/usage` — but not yet.
That report needs roughly a week of real traffic before "never opened" means
anything; a page nobody opened in two days may just be a page nobody needed
this week.

Testing tells you what is confusing. Usage tells you what is ignored. Step 10's
keep / combine / remove list needs both, which is why tracking was built first.
