# Agent Cloud — Landing Page Audit & Redesign Plan

**Date:** 2026-07-29
**Scope:** `src/routes/index.tsx` (857 lines), `src/routes/__root.tsx` head config, `src/routes/signup*.tsx`, `public/`.
**Deliverables A–G per §20.** Audit first — no rebuild until this is reviewed.

---

## A. Existing Landing Page Audit

### A.0 The headline finding

**The page is a pre-launch waitlist page for a product that is already purchasable.**

Every call to action on the page — the nav button, the hero form, the closing band — collects an email into `waitlist_signups`. There is no pricing section, no plan comparison, no trial, and no demo request. Meanwhile `/signup`, `/signup/agent`, Stripe Checkout, the Customer Portal, and the whole billing stack are built and wired.

The site is asking qualified buyers to wait for something they could buy today. Nothing else in this audit matters as much.

Consequence: **the primary conversion action must change** from "join waitlist" to "start / request a demo", and a real pricing section has to exist. That is the redesign's core job, not a cosmetic refresh.

### A.1 Strong sections — keep and adapt

| Section | Why it works |
|---|---|
| `DashboardMock` (`index.tsx:255`) | A hand-built product mock using the real design tokens, real nav labels, and a real `SmoothAreaChart`. It is far better than a stock image and reads as the actual app. **Keep.** |
| `FeatureSection` layout (`:548`) | Clean alternating copy/visual rhythm with a reusable `reverse` prop. Good bones for the new module and role sections. **Keep as a component.** |
| Per-feature mocks (`PipelineMock`, `CommissionMock`, `DownlineMock`, `NovaMock`, `AnalyticsMock`) | Five bespoke, on-brand visuals. Genuinely valuable and expensive to recreate. **Keep**, retitle where the underlying claim changes. |
| `SectionHead` (`:445`) | Consistent eyebrow / title / copy pattern. **Keep.** |
| Visual language | Dark premium palette, Space Grotesk display face, gold accent, restrained gradients. Matches the app. **Keep — this is not the problem.** |

### A.2 Unsupported claims — must be fixed before launch

§4 and §21 prohibit marketing unavailable functionality. These are the violations, each verified against source:

| # | Claim | Location | Reality |
|---|---|---|---|
| 1 | **"Built-in Phone & SMS — Click-to-dial, texting, and voicemail drops from any device — every touch logged"** | `:415-418` | **No telephony provider is connected.** `sendSms` (`phone.functions.ts:247`) inserts a row with `status: "sent"` and returns. Nothing is transmitted. Calls are recorded by a manual `logCall`. There is no click-to-dial and no voicemail drop anywhere in the codebase. This is the most serious claim on the page. |
| 2 | **Carrier logo bar** — 7 named carriers under *"Built around the carriers you already write"* | `:378-396` | Reads as a partnership/customer strip. §4 explicitly prohibits fabricated carrier partnerships. Named carriers do appear in commission-grid data, but the presentation implies a relationship that does not exist. |
| 3 | **Fake avatar stack** beside the waitlist count | `:147-151` | Three coloured circles styled as overlapping user avatars. Implied social proof with no people behind it. §4 prohibits fabricated usage signals. |
| 4 | **"Nova reads your pipeline, your policies, your carrier grids, and your calendar — then does the work"** | `:517` | Overstates autonomy. Nova drafts and summarises; the automation worker (Phase 6) sends email only, gated on org consent. "Does the work" implies autonomous action. |
| 5 | **"Draft the SMS"** (Nova) | `:517` | SMS cannot be sent. Drafting one is real; the sentence implies delivery. |
| 6 | **"Automations … on autopilot"** / birthday cards, anniversary touches | `:420`, `:522-523` | Now **partly true** after Phase 6 — the worker runs and is idempotent. But it sends **email only**, and only when the agency has enabled automated messaging. Needs qualifying, not deleting. |
| 7 | **"One-click carrier contracting with SureLC + AgentLink"** | `:485` | SureLC SSO exists (`surelc.functions.ts`), AgentLink import exists. "One-click contracting" overstates both. |
| 8 | **"White-label agency branding on every screen"** | `:504` | Was false at audit time; **now true** after Phase 6 (accent tokens, custom domain, logo). Keep, but scope it to the White Label plan. |
| 9 | **"Voicemail drops"**, **"Quote and case-design recommendations"** | `:418`, `:524` | Case design exists (`back-office.functions.ts`). Voicemail drops do not. |

### A.3 Missing sections

Measured against the §4 required IA. Present: 4 of 15.

| Required | Status |
|---|---|
| Announcement bar | **Missing** |
| Navigation (Product / Solutions / Nova / Pricing / Resources / Sign In) | **Partial** — 4 anchors, no Pricing, no Solutions, no Resources |
| Hero | Present — wrong positioning (see A.4) |
| Trust & credibility | **Missing** (logo bar is not credible proof) |
| The Problem | **Missing** |
| Platform overview (12 modules) | **Partial** — 4 features shown of 12 modules |
| Full agency lifecycle | **Missing** — this is the stated key differentiator |
| Role-based experience | **Missing** |
| Staff & operations | **Missing** |
| Nova AI Pro | Present — not priced, not positioned as an add-on |
| Integrations | **Missing** |
| Product screenshots | **Partial** — 5 mocks, no captions, no module coverage |
| **Pricing** | **Missing entirely** |
| Competitive differentiation | **Missing** |
| Data ownership & trust | **Missing** — the strongest available message is absent |
| Testimonials (placeholder) | **Missing** |
| FAQ | **Missing** |
| Final CTA | **Partial** — waitlist band |
| Footer | **Weak** — 3 links, no legal pages |

### A.4 Positioning mismatch

| | Current | Required |
|---|---|---|
| Headline | "Your entire insurance business. One cloud." | "The operating system for independent insurance agencies." |
| Audience | *"built for life insurance agents and the agencies that lead them"* — agent-first | Agency-owner-first |
| Framing | Feature list (dashboard, pipeline, phone, commissions) | Lifecycle: recruit → onboard → license → contract → sell → track → retain → grow |
| Scope | "life insurance" | "insurance agencies" — narrower than the product |

The current page sells a **better CRM for an agent**. The product is an **operating system for an agency owner**. The four headline features (dashboard, pipeline, phone, analytics) are the four *most* CRM-like things in the platform, and the genuinely differentiating modules — recruiting, onboarding, licensing, contracting, staff permissions, retention queues, reconciliation — are absent or buried.

### A.5 Broken and dead CTAs

| Element | Problem |
|---|---|
| Nav "Join waitlist" → `#waitlist` | Works, but is the wrong action — signup is live |
| Hero waitlist form | **Submits fabricated data**: hardcodes `first_name: "Friend"`, `last_name: "of Agent Cloud"` (`:179-180`). Those strings land in the database and in any email merge. |
| No route to `/signup` or `/signup/agent` | The two working signup flows are **unreachable from the landing page** |
| No pricing link | Nothing to link to |
| Footer | "Features" anchor, "Sign in", a `mailto:` — no legal pages, no support, no docs |

### A.6 Mobile issues

- **No mobile navigation.** `TopNav` uses `hidden md:flex` (`:90`) with **no hamburger and no drawer**. Below `md`, the only nav is the logo and two buttons. Every section link is unreachable on a phone.
- "Sign in" is `hidden sm:inline-flex` (`:99`) — invisible on the smallest screens.
- Hero `text-5xl` at the smallest breakpoint with a 3-line headline plus a 3-line paragraph — heavy above the fold.
- The five feature mocks are dense, fixed-layout compositions; they need mobile-specific treatment or to be swipeable.

### A.7 SEO issues

| Item | Status |
|---|---|
| Title / description | Present, but scoped to "life insurance agencies"; no target keywords |
| `og:image` | Points at `storage.googleapis.com/gpt-engineer-file-uploads/...` — **a third-party build-tool bucket**, not an owned asset. Fragile and off-brand. |
| Canonical URL | **Missing** |
| `sitemap.xml` | **Missing** |
| `robots.txt` | **Missing** |
| Structured data | **Missing** (`SoftwareApplication` + `Organization` + `FAQPage` all apply) |
| `public/` assets | Contains only `favicon.jpg` |
| Heading hierarchy | Sound — one `h1`, `h2` per section |
| Image alt text | N/A — all visuals are DOM mocks, which is good for SEO but means no image-search surface |

### A.8 No analytics

No Plausible, PostHog, GA, or equivalent. Zero of the §17 events are tracked. There is currently **no way to know** which audience converts, which plan draws interest, or where visitors abandon.

### A.9 Visual inconsistencies

- `LogoBar` renders carrier names as large bold text rather than logos — reads as filler.
- Section rhythm is uniform `py-24` throughout; no pacing between narrative and dense sections.
- Only one CTA style on the page, so nothing signals primary vs secondary intent.

---

## B. New Information Architecture

```
 1  Announcement bar        — one line, dismissible
 2  Navigation              — Product · Solutions · Nova AI · Pricing · Resources · Sign In · [CTA]
                              + mobile drawer  ← new
 3  Hero                    — agency-OS positioning, dual CTA, DashboardMock (reuse)
 4  Trust strip             — operator credibility statement (no fake logos)
 5  The Problem             — fragmented stack vs connected platform
 6  Platform Overview       — 12-module map
 7  Agency Lifecycle        — recruit → … → grow, the differentiator
 8  Role-Based Experience   — Owner / Manager / Staff / Agent / Solo tabs
 9  Staff & Operations      — bring your own back office
10  Nova AI Pro             — add-on, $49/user/mo, permission-scoped
11  Product Screenshots     — captioned, reuses the 5 existing mocks + new
12  Integrations            — Available / Beta / Coming soon labels
13  Pricing                 — Solo $50 · Agency $399+$25 · Nova $49 · White Label
14  Comparison table        — category-level, no named competitors
15  Data Ownership & Trust  — no overrides, no IMO, your data
16  Testimonials            — structural placeholder, unpopulated
17  FAQ                     — accordion, feeds FAQPage schema
18  Final CTA               — no new concepts
19  Footer                  — full, with legal
```

Sections 5, 7, 15 are the persuasion spine. Everything else supports them.

---

## C. Copy Document

### C.1 Announcement bar
> Agent Cloud is now accepting founding agencies. **Explore the platform →**

### C.2 Hero

**Headline**
> The operating system for independent insurance agencies.

**Sub**
> Recruit agents, manage onboarding, track licensing and contracting, organize clients and policies, monitor commissions, protect retention, and run your entire agency from one connected platform.

**Primary CTA:** `Start Free` → `/signup`
**Secondary CTA:** `See How It Works` → `#lifecycle`

**Reassurance line** (three items, no icons-as-decoration):
> No commission overrides · Your agency owns its data · Built for insurance operations

> **CTA decision.** §2 says prioritise `Start Free` only if a visitor can self-serve end to end. They can: `/signup` and `/signup/agent` both run account creation → Stripe Checkout → workspace. **So `Start Free` is correct — conditional on Stripe keys being configured.** Until they are, Checkout throws "Billing is not configured", and the page must show `Request a Demo` instead. This is a launch-blocking dependency, not a copy choice.

### C.3 Trust strip
> Built by insurance operators who understand the systems, workflows, and administrative problems agencies deal with every day.

No logos, no counts, no testimonials until real ones exist.

### C.4 The Problem

**Headline**
> Your agency should not require ten disconnected systems to operate.

**Fragmented column** — Applicants in a spreadsheet · Onboarding over text · Licensing in a folder · Contracting by email · Clients in a generic CRM · Policies tracked by hand · Commissions reconciled in Excel · Lapses found too late · Staff work scattered across chats

**Transition**
> Agent Cloud connects the entire operation.

### C.5 Platform Overview — outcome-first, one line each

| Module | Copy |
|---|---|
| Recruiting | Track every applicant from first contact to activated agent. |
| Onboarding | Give every new agent a structured checklist and visible progress. |
| Licensing | Keep state licenses, renewals, and gaps in one view. |
| Contracting | Carrier requests, required documents, and outstanding issues in one workspace. |
| Agents | One profile per producer — hierarchy, status, production, documents. |
| Clients | Insurance-specific records, not a generic contact list. |
| Policies | Organize the book without depending on spreadsheets. |
| Retention | Identify at-risk policies early and assign follow-up before business lapses. |
| Commissions | Estimate, import, reconcile, and track commission activity across the agency. |
| Tasks | Assign work, set due dates, and see what is actually getting done. |
| Reporting | Understand production, placement, retention, and operational health. |
| Nova AI | An assistant that works inside your agency's data — and only what each user may see. |

### C.6 Agency Lifecycle

**Headline**
> One record, from applicant to producing agent.

**Body**
> When you hire someone, they should not disappear into a different system. In Agent Cloud, a recruiting profile becomes an agent profile — carrying onboarding, licensing, contracting, production, and retention with it. Nothing is re-keyed. Nothing is lost between steps.

**Chain:** Applicant → Recruit → License → Onboard → Contract → Activate → Sell → Track Policy → Monitor Commission → Protect Retention

### C.7 Role-Based Experience

**Headline**
> One platform. A workspace designed for every role.

**Sub**
> People see the tools and records their role calls for — enforced on the server and in the database, not just hidden in the interface.

*(Five tabs, content per §8.)*

### C.8 Staff & Operations

**Headline**
> Give your staff the system they need to run the back office.

**Body**
> Invite your own administrators and virtual assistants, assign exactly the permissions they need, and give them organized queues instead of scattered messages. Sensitive fields stay restricted unless you grant access.

Explicit: *Agent Cloud does not supply staff. It makes the staff you already have measurably more effective.*

### C.9 Nova AI Pro

**Headline**
> Your insurance operations assistant, built into Agent Cloud.

**Body**
> Nova works inside your agency's records — summarizing activity, surfacing retention risk, drafting follow-ups, creating tasks, and explaining what is blocking an agent's onboarding.

**Permission line**
> Nova only accesses the records each user is already authorized to view.

**Price:** $49 per user / month · available to agency users and Solo Agents
**CTA:** `Add Nova AI Pro`

**Honesty line** (required — see A.2 #1):
> Voice and SMS features become available when a phone provider is connected to your workspace.

### C.10 Pricing

**Solo Agent — $50/month.** For individual agents organizing their own business.
Personal CRM · Clients · Policies · Book of business · Retention · Commission tracking · Tasks · Documents · Personal analytics
**Nova AI Pro sold separately.** → `Start Solo`

**Agency — $399/month. Includes up to 15 active users. $25/month per additional active user.**
Everything in Solo, plus Recruiting · Onboarding · Licensing · Contracting · Staff accounts · Role permissions · Retention queues · Commission reconciliation · Reporting · Agency settings · Support center → `Start Your Agency`

**Nova AI Pro — $49/user/month.** → `Add Nova Pro`

**White Label — $499/month + $999 one-time setup.** Custom branding, colors, logo, domain, branded login. Requires an active Agency Plan. → `Contact Sales`

**Active user definition** (must appear beside the Agency card):
> An active user is anyone with access to your workspace. Pending invitations are not billed until accepted.

*(Matches `BILLABLE_PROFILE_STATUSES` — `invited` is non-billable. Copy and code agree.)*

### C.11 Data Ownership & Trust

**Headline**
> Your agency. Your relationships. Your data.

> Agent Cloud is software, not an IMO. We do not take commission overrides, own your carrier relationships, own your clients, or recruit your agents. Your data is exportable whenever you want it.
>
> **Agent Cloud exists to make agencies more independent, not more dependent.**

### C.12 Final CTA

> **Run your agency from one connected platform.**
> Replace scattered spreadsheets, disconnected tools, and manual workflows with an operating system built specifically for insurance agencies.
> `Start Free` · `View Pricing`

---

## D. Wireframe

### Desktop (≥1024px)
```
┌──────────────────────────────────────────────────────┐
│ ANNOUNCEMENT — centered, 40px, dismissible           │
├──────────────────────────────────────────────────────┤
│ [logo] Product Solutions Nova Pricing Resources      │
│                                  Sign In [Start Free]│ sticky
├──────────────────────────────────────────────────────┤
│                    HERO — centered                    │
│              H1 (2 lines, max 60ch)                   │
│              sub (2 lines, max 70ch)                  │
│         [Start Free]  [See How It Works]              │
│      · no overrides · own your data · built for ins.  │
│  ┌────────────────────────────────────────────────┐  │
│  │        DashboardMock  (reused, full width)     │  │
│  └────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│ TRUST — single centered sentence, thin band          │
├──────────────────────────────────────────────────────┤
│ PROBLEM      ┌─ fragmented ─┐  →  ┌─ connected ─┐    │
│              │ 9 scattered  │     │ one platform │    │
├──────────────────────────────────────────────────────┤
│ PLATFORM MAP — 12 tiles, 4×3 grid, hover reveals copy│
├──────────────────────────────────────────────────────┤
│ LIFECYCLE — horizontal 10-node chain, scroll-linked  │
├──────────────────────────────────────────────────────┤
│ ROLES — [Owner|Manager|Staff|Agent|Solo] tabs        │
│         left: bullets   right: mock                  │
├──────────────────────────────────────────────────────┤
│ STAFF & OPS — copy left / permissions visual right   │
├──────────────────────────────────────────────────────┤
│ NOVA — copy right / NovaMock left (reuse, reversed)  │
├──────────────────────────────────────────────────────┤
│ SCREENSHOTS — captioned carousel, 5 existing mocks   │
├──────────────────────────────────────────────────────┤
│ INTEGRATIONS — grid w/ Available|Beta|Soon pills     │
├──────────────────────────────────────────────────────┤
│ PRICING — 3 cards + White Label strip below          │
│           comparison table (collapsed by default)    │
├──────────────────────────────────────────────────────┤
│ COMPARISON — Generic CRM | Spreadsheets | Agent Cloud│
├──────────────────────────────────────────────────────┤
│ TRUST/OWNERSHIP — full-bleed, high contrast          │
├──────────────────────────────────────────────────────┤
│ TESTIMONIALS — rendered only when data exists        │
├──────────────────────────────────────────────────────┤
│ FAQ — two-column accordion                           │
├──────────────────────────────────────────────────────┤
│ FINAL CTA — [Start Free] [View Pricing]              │
├──────────────────────────────────────────────────────┤
│ FOOTER — 4 columns + legal row                       │
└──────────────────────────────────────────────────────┘
```

### Mobile (<768px)
```
┌────────────────────┐
│ ANNOUNCEMENT (1 ln)│
│ [logo]        [☰]  │  ← NEW drawer
├────────────────────┤
│ H1 — 2 lines max   │
│ sub — 2 lines max  │
│ [Start Free] full  │
│ [How It Works] full│
│ · reassurance ×3   │
│ ┌────────────────┐ │
│ │ Mock — cropped │ │  single panel, not full app
│ └────────────────┘ │
├────────────────────┤
│ PROBLEM — stacked, │
│ fragmented ↓ then  │
│ connected          │
├────────────────────┤
│ MODULES — 2×6 grid │
├────────────────────┤
│ LIFECYCLE—vertical │
├────────────────────┤
│ ROLES — accordion  │  (tabs → accordion)
├────────────────────┤
│ SCREENSHOTS—swipe  │
├────────────────────┤
│ PRICING — stacked, │
│ Agency card first  │  (most relevant first)
│ comparison → cards │
├────────────────────┤
│ FAQ — accordion    │
├────────────────────┤
│ CTA / FOOTER       │
└────────────────────┘
        [Start Free]     ← sticky bottom bar after hero
```

---

## E. Component Plan

**Reuse as-is:** `DashboardMock`, `PipelineMock`, `CommissionMock`, `DownlineMock`, `NovaMock`, `AnalyticsMock`, `SectionHead`, `FeatureSection`, `BrandLogo`, `SmoothAreaChart`, `Icon`.

**New — `src/components/landing/`:**

| Component | Notes |
|---|---|
| `AnnouncementBar` | Dismissible, persists to `localStorage` |
| `LandingNav` | Sticky + **mobile drawer** (the current gap) |
| `HeroSection` | Dual CTA, reassurance row |
| `TrustStrip` | Single statement |
| `ProblemSplit` | Fragmented vs connected |
| `ModuleMap` | 12 tiles, expandable |
| `LifecycleChain` | Horizontal → vertical, scroll-linked |
| `RoleTabs` | Tabs desktop / accordion mobile |
| `IntegrationGrid` | Status pill per item, **status is data not decoration** |
| `ScreenshotCarousel` | Captioned, swipeable |
| `PricingCards` | Reads `plans` via a public endpoint |
| `ComparisonTable` | Table → cards on mobile |
| `TrustBand` | Ownership statement |
| `TestimonialGrid` | Renders nothing when empty — no placeholder faces |
| `FaqAccordion` | Emits `FAQPage` structured data |
| `CtaBanner` | Shared final CTA |
| `LandingFooter` | 4 columns + legal |
| `StickyMobileCta` | Appears after hero scroll |

**Shared:** `useAnalytics()` (§17 events), `usePricing()` (public plans fetch).

---

## F. Conversion Map

| CTA | Destination | After |
|---|---|---|
| Announcement link | `#platform` | Scroll |
| Nav `Start Free` | `/signup` | Chooser → Solo or Agency |
| Hero `Start Free` | `/signup` | Same |
| Hero `See How It Works` | `#lifecycle` | Scroll |
| Module tile | `#screenshots` w/ module selected | Carousel jumps |
| Role tab | In-place | No navigation |
| `Start Solo` | `/signup/agent` | Account → verify → Stripe ($50) → profile → workspace |
| `Start Your Agency` | `/signup` | Account → verify → Stripe ($399) → org → checklist |
| `Add Nova Pro` | `/signup` if anon, `/settings/nova-pro` if signed in | Nova Checkout ($49) |
| White Label `Contact Sales` | `/demo` | Lead form |
| `Request a Demo` (fallback) | `/demo` | Lead form |
| `View Pricing` | `#pricing` | Scroll |
| Footer legal | `/privacy`, `/terms`, `/cookies` | **These routes do not exist — must be created** |

**Demo form** (§14) — new `/demo` route + `demo_requests` table: save → confirm email → notify sales → assign owner → create follow-up task (the Phase 3 `tasks` table already supports this) → success page with calendar link.

**Dependency:** every `Start Free` path terminates in Stripe Checkout. **With no Stripe keys configured, all four purchase CTAs dead-end on "Billing is not configured."** Either configure Stripe before launch, or ship with `Request a Demo` as primary. §13 forbids a CTA that leads to an unfinished workflow.

---

## G. Implementation Plan

**Content** — rewrite all copy per C; delete the carrier logo bar and fake avatars; qualify or remove every A.2 claim; write FAQ entries.

**Design** — build the 18 components in E; two new patterns (module map, lifecycle chain); mobile drawer; sticky mobile CTA; responsive comparison table.

**Frontend** — split `index.tsx` (857 lines) into `components/landing/*`; new routes `/demo`, `/privacy`, `/terms`, `/cookies`; mobile nav; carousel; tabs→accordion.

**Backend** — public `GET /api/public/plans` (rate-limited, reusing `guardPublicEndpoint`); `demo_requests` table + RLS + submit endpoint; sales notification; auto-create a follow-up task on submit.

**Billing dependencies** — configure 7 Stripe price IDs, secret, webhook secret, `APP_ORIGIN`; **seed the `plans` table (Phase 7 migration) so the page and Checkout cannot disagree**; verify the active-seat copy against `BILLABLE_PROFILE_STATUSES`.

**Analytics** — pick a provider; implement the §17 event list; wire funnel from hero → pricing → signup → checkout.

**SEO** — owned `og:image` in `public/`; canonical; `sitemap.xml`; `robots.txt`; `SoftwareApplication` + `Organization` + `FAQPage` structured data; retitle to "Agent Cloud | Insurance Agency Management Software".

**QA** — every CTA reaches a working destination; both signup flows complete against Stripe test mode; 320/375/414/768/1024/1440 breakpoints; keyboard traversal and focus states; contrast audit; Lighthouse; verify no claim on the page lacks a shipped feature behind it.

### Suggested sequencing

1. **Truth pass** — strip the unsupported claims (A.2). Small diff, removes the legal and trust exposure immediately, ships independently.
2. **Conversion pass** — pricing section, real CTAs, mobile nav, `/demo`. This is where the revenue is.
3. **Story pass** — problem, lifecycle, roles, staff, ownership, comparison. This is where the *positioning* is.
4. **Polish pass** — screenshots, integrations, FAQ, footer, SEO, analytics.

Steps 1 and 2 are the launch-blocking ones.

---

## Open questions

1. **Stripe keys before launch?** Decides `Start Free` vs `Request a Demo` as the primary CTA. Everything in F depends on this.
2. **Is White Label pricing approved for public display?** §5 says keep it configurable and do not publish unapproved pricing.
3. **Do real testimonials or reference agencies exist?** If not, section 16 renders nothing — which is correct, not a gap.
4. **Integration status** — I can label SureLC and AgentLink from the code, but *Available vs Beta* is a business judgment about reliability, not a code fact.
5. **Legal pages** — privacy, terms, cookie policy do not exist. Needed before a public launch that collects leads.
