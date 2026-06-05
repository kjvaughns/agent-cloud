## AI Improvement Map for Agent Cloud

A page-by-page proposal for where Lovable AI (Gemini + GPT-5 via the AI Gateway) can be woven into the platform. Grouped by role, then by surface. No code changes yet — this is the menu to choose from.

### Existing AI footprint (baseline)
- `ai-assistant` — generic chat assistant
- `analytics` — AI-written insight cache
- `admin-import` — AI normalization of CSV/XLS rows
- `account` — narrative generator for producer profile
- `resources` — script suggestions
- `sophai` — UI shell only; automations are stubs (recovery, SMS, birthday, beneficiary)

Everything below builds on this same Gateway pattern (server function → `ai.gateway.lovable.dev`), keyed on `LOVABLE_API_KEY`.

---

## 1. Agent role — daily workflow

### Dashboard (`/dashboard`)
- **Daily AI briefing** at top: "You have 4 lapse-pending policies worth $1,840 ALP, 3 birthdays this week, and Charles is 28% below pace." Generated from `get_dashboard_metrics` + `get_team_alerts`.
- **Smart next actions** card: ranks the 5 highest-value actions for today (call X, send Y a quote, follow up on Z's app).
- **Anomaly callouts**: AI flags drops in production, unusual lapse spikes, or carrier mix shifts vs prior period.

### Pipeline (`/pipeline`)
- **AI lead scoring/temperature**: rescore `clients.temperature` weekly using contact history, stage age, and notes.
- **Stage stall detector**: flag prospects sitting in a stage too long with suggested unsticking move.
- **Auto note summarization**: collapse long `contact_history` into a one-line "where we left off" per client.
- **Next-best-message generator** per prospect (text, voicemail, email variants).

### Book of Business (`/book-of-business`)
- **Lapse risk score** per policy from premium/age/carrier/payment history; surfaces a "Save list" daily.
- **Cross-sell suggestions** per active client (e.g. add child rider, GTL upgrade, IUL) with talk-track.
- **Anniversary/birthday outreach drafts** generated for each upcoming event (ties into existing calendar triggers).
- **Carrier mix coaching**: "You write 70% A but B pays 12% more on this product band."

### Calendar (`/calendar`)
- **Smart scheduling assistant**: parse free-text ("call Mike Tuesday morning") into an event.
- **Pre-meeting prep brief** for each appointment: client snapshot, policies, last notes, suggested agenda.
- **Post-meeting recap** drafted from a typed/dictated summary into structured notes + follow-up tasks.

### Phone & SMS (`/phone`)
- **AI dialer coaching** (real-time or post-call): outcome tagging, objection summary, recommended next step.
- **Inbound call triage**: transcribe + classify (sales, service, lapse, recruiting) and route in `inbound-calls`.
- **SMS draft + tone match**: per-conversation reply suggestions in the agent's voice; auto-follow-up cadences.
- **Voicemail drop generator** per prospect using their context.

### Leads & Inbound Calls (`/tools/leads`, `/tools/inbound-calls`)
- **Dedupe + enrichment** on import (already partial — extend to phone-format normalization, address validation).
- **Lead quality score** + recommended dial order.

### Needs Analysis (`/tools/needs-analysis`)
- **Conversational intake**: AI asks the questions, fills the form, and produces the recommendation summary.
- **Coverage gap explanation** in plain English for the client (PDF-ready handout).

### Quoter (`/tools/quoter`)
- **Carrier/product recommender** from age/health/budget/state + your active commission levels.
- **Side-by-side narrative** explaining why option A vs B for this specific client.
- **Objection bank** auto-loaded for the chosen product.

### Post-Deal (`/post-deal`)
- **App QA assistant**: scan submitted app for missing fields, signature issues, beneficiary problems before submit.
- **Underwriting Q&A**: agent pastes the carrier email, AI drafts the response using stored client medical notes.
- **Status nudges** drafted to client during underwriting.

### Account → Producer Profile / Landing Page / Help / FAQ
- **Bio/landing copy writer** (already partial) extended to landing-page sections, testimonials prompts, CTA copy.
- **AI Help search** across handbook + FAQ + scripts (RAG over `handbook_sections`, `faq_items`, `academy_*`) — replaces keyword search.

### Resources (Academy, Handbook, Scripts, State Licenses, New Agent Guide)
- **Ask-the-Handbook chat** scoped to that section.
- **Personalized script generator**: pick carrier + product + objection → custom script.
- **Course recap & quiz generator** per academy module; auto-mark progress when the agent passes a generated quiz.
- **State license reminder summarizer**: "Your TX license renews in 41 days; here's the CE you still need."

### Sophai (move from stub to real)
- **Policy Recovery**: AI outbound calls / SMS sequences for `lapse_pending` policies with personalized scripts.
- **SMS Follow-ups**: AI-generated post-call / post-appointment texts tied to `call_logs`/`calendar_events`.
- **Birthday & Beneficiary** outreach generators using the existing calendar auto-events.
- **Activity feed**: every Sophai action logged with the AI rationale for trust + auditability.

### Finances (`/finances`)
- **Pay-period explainer**: AI summarizes the wallet & commission_schedule into "you'll receive $X on these dates, advance vs deferred breakdown."
- **Chargeback/lapse impact forecasting** based on book persistency.
- **Goal coaching**: "To hit your $10k/mo goal, you need 4 more avg deals — top carrier suggestions attached."

### Challenges & Leaderboard
- **Personalized challenge generator** vs static seeds (based on historical pace).
- **Trash-talk-free pep messaging** when an agent falls behind or surges.

### Notifications & News Feed
- **AI digest mode**: collapse 20 notifications into 3 prioritized bullets.
- **News feed summarizer** + relevance ranker (industry news → only what affects this agent's carriers/states).

---

## 2. Recruiter / Upline role

### Team (`/team`) and Team Command Center
- **Roster insights**: AI weekly read on each downline agent — risk of going inactive, training gaps, growth signals.
- **Reminder drafter** (already have `send_team_reminder`) — fill in personalized message bodies.
- **Org-chart coaching**: identifies bottleneck managers and recommends structural moves.

### Recruiting Funnels (`/back-office/recruiting-funnels`)
- **Landing page copywriter** per funnel slug.
- **Email/SMS nurture sequences** auto-generated for prospects sitting in each stage.
- **A/B copy variants** with conversion prediction.

### Recruiting Tracker (`/back-office/recruiting-tracker`)
- **Prospect summarizer** from notes + stage history.
- **Next-step recommender** per prospect; auto-draft outreach.
- **Stuck-prospect alerts** (mirrors stage-stall detector for clients).

### Invite (`/contracting/invite`)
- **Personalized invite messages** based on the prospect's background.
- **Onboarding step coach** during the invitation flow.

### Marketing / Client Marketing (`/back-office/client-marketing`)
- **Campaign generator**: pick audience + carrier → produces email, SMS, social post variants.
- **Image generation** for social/marketing using `/v1/images/generations` (`openai/gpt-image-2` low quality default).
- **Performance critique** of past campaigns.

### Case Design (`/back-office/case-design`)
- **AI case strategist**: given client financials + goals, drafts the recommended structure (UL/IUL/annuity ladder) with rationale and carrier picks.
- **Case design request triage** on the admin side: AI pre-fills a draft response for the case design team to edit.

---

## 3. Admin role

### Admin Index / Analytics
- **Org-wide AI brief**: weekly/daily summary of growth, churn, lapse, recruiting, and contracting velocity.
- **Anomaly detection** across agents, carriers, states (already partial in `analytics`).
- **Natural-language query** on the data: "Show me agents who wrote A but no B last quarter."

### Agents (`/admin/agents`)
- **Agent risk score** (active/inactive prediction, contracting completion, productivity trend).
- **Bulk-message composer** with AI personalization tokens.

### Carriers (`/admin/carriers`)
- **Carrier description + product catalog generator** when adding new carriers (saves manual data entry).
- **Carrier alias matcher** for import normalization (already partial in import flow — promote to admin-managed).

### Commissions (`/admin/commissions`)
- **Grid intake AI**: paste a carrier commission PDF/CSV → AI parses into `commission_grids` rows for review.
- **Commission anomaly detection** vs schedule.

### Contracts (`/admin/contracts`) & Contracting hub
- **Contract status summarizer** from carrier emails / `contract_requests` notes.
- **Stuck contract escalation drafts** to carriers.

### CSV/XLS Import & Import Requests (`/admin/csv-import`, `/admin/import-requests`)
- **AI column mapper** (likely already partial in admin-import) with confidence indicators.
- **Pre-import duplicate report** with merge recommendations across the team (extends the team-wide dedupe just added).

### Hierarchy / Roles / Migration
- **Reorg simulator**: "If I move Charles under Xaviar, projected override impact = $X."
- **Migration plain-English explainer** for each pending migration job.

### Announcements (`/admin/announcements`)
- **Drafter + tone tuner** + audience targeter.

### Support (`/admin/support`)
- **Auto-classify + suggested response** on every new `support_ticket`.
- **Sentiment + churn-risk flag** on conversations.
- **Knowledge-base retrieval** so suggested replies cite handbook/FAQ.

### Settings
- **Sophai global controls** (rate limits, allowed actions, audit log access).
- **AI model + budget controls**: pick reasoning vs flash, set per-feature monthly spend ceiling.

---

## 4. Cross-cutting capabilities

### a. RAG knowledge base
Build embeddings (via `google/gemini-embedding-001`) over `handbook_sections`, `faq_items`, `academy_modules/courses`, `scripts`, `news_articles`, and active carrier product catalogs. Power: AI Help, Sophai scripts, agent chat, support ticket replies.

### b. Universal "Ask Agent Cloud" command bar (⌘K)
Cross-page chat that can read the agent's own data (with RLS) and take safe write actions (create event, draft SMS, open quoter) via tool calling.

### c. Voice layer
Twilio + AI: live call transcripts, post-call summaries, real-time objection prompts in the dialer. Logs to `call_logs` automatically.

### d. Document intelligence
Drop a carrier PDF (commission grid, illustration, contract) → AI extracts structured data into the right table.

### e. Audit + trust
Every AI-authored action (message, call, change) is logged in `sophai_activity` or a new `ai_actions` table with the prompt, model, and editable draft state. Default = draft-for-approval; admins toggle full autonomy per automation.

### f. Cost guardrails
- Default chat model: `google/gemini-3-flash-preview`.
- Reasoning (`gpt-5.4` medium) only for case design, quoter recommendation, anomaly explanations.
- Image gen: `openai/gpt-image-2` low quality unless user upgrades.
- Per-feature monthly spend caps in admin settings.

---

## 5. Recommended phasing

```text
Phase 1 (high ROI, low complexity)
  • Dashboard AI briefing + next actions
  • Pipeline lead score & next-best-message
  • Book of Business lapse-risk + cross-sell
  • Sophai SMS follow-ups + birthday/beneficiary (replace stubs)
  • AI Help search (RAG over handbook/FAQ/scripts)

Phase 2 (workflow accelerators)
  • Calendar pre-meeting briefs + post-meeting recaps
  • Quoter recommender + Needs Analysis conversational intake
  • Post-deal QA + UW Q&A drafter
  • Recruiting nurture sequences + funnel copy

Phase 3 (admin & ops scale)
  • Support ticket auto-classify + reply suggestions
  • Commission PDF intake + carrier catalog generator
  • Org-wide weekly brief + NL data Q&A
  • Reorg simulator

Phase 4 (voice + autonomous)
  • Sophai policy-recovery calling
  • Real-time dialer coaching
  • Universal ⌘K agent with tool-calling write actions
```

---

## 6. Questions before we start building

1. Which **phase or specific features** do you want to start with? (I recommend Phase 1.)
2. Should Sophai automations send messages **autonomously**, or **draft for approval** as the default?
3. Any **areas to exclude** (e.g. you don't want AI touching client outbound until later)?
4. Confirm the **cost model**: default to Flash (cheap) for everything, upgrade to GPT-5/Gemini Pro only for the high-value surfaces listed in §4f?
