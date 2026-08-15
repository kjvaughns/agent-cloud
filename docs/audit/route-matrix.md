# Agent Cloud — Route Matrix

Generated from `src/routes/**` joined against the navigation registry in `src/lib/navigation.ts`.

- 156 application routes (16 further routes under `src/routes/api` are HTTP endpoints, not pages).
- 56 of those are redirect stubs left behind by the settings and contracting-ops consolidation — they exist only to keep old links working. Verdict for all of them: **Keep as redirect**.
- 112 routes are not rows in the sidebar. That is mostly by design: the registry deliberately splits "sidebar" from "reachable by search", and public marketing/auth pages plus `$param` detail routes never belong in nav. The exceptions worth acting on are listed in `findings.md`.

Verdict key: Keep = works and earns its place. Repair = needed, currently wrong. Merge = fold into another page. Redirect = URL survives, page does not. Hide = keep code, remove from nav until complete. Remove = delete.

Where a route has no nav row and no redirect, its verdict is in `findings.md`; the default for the `/admin/*` platform pages is Keep (super-admin only, reached from the Admin Portal button).

| Route | Nav label | Access gate | Auth | Kind | Lines | File |
|---|---|---|---|---|---|---|
| `/` | — | not in nav (palette/deep-link only) | auth | page | 103 | `src/routes/_authenticated.tsx` |
| `/account/faq` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 10 | `src/routes/_authenticated/account/faq.tsx` |
| `/account/help` | Support desk | unlock=ticket-responder | auth | page | 333 | `src/routes/_authenticated/account/help.tsx` |
| `/account/my-landing-page` | Landing Page | everyone | auth | page | 289 | `src/routes/_authenticated/account/my-landing-page.tsx` |
| `/account/producer-profile` | Producer Profile | everyone | auth | page | 993 | `src/routes/_authenticated/account/producer-profile.tsx` |
| `/agency/team` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/agency.team.tsx` |
| `/agency/agents/$agentId` | — | not in nav (palette/deep-link only) | auth | page | 256 | `src/routes/_authenticated/agency/agents/$agentId.tsx` |
| `/agency/automations` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/agency/automations.tsx` |
| `/agency/emails` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/agency/emails.tsx` |
| `/agency/` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 16 | `src/routes/_authenticated/agency/index.tsx` |
| `/agency/settings` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/agency/settings.tsx` |
| `/agency/usage` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/agency/usage.tsx` |
| `/ai-assistant` | Nova | everyone | auth | page | 345 | `src/routes/_authenticated/ai-assistant.tsx` |
| `/analytics` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 9 | `src/routes/_authenticated/analytics.tsx` |
| `/announcements` | Announcements | unlock=agency-member | auth | page | 263 | `src/routes/_authenticated/announcements.tsx` |
| `/back-office` | — | not in nav (palette/deep-link only) | auth | page | 65 | `src/routes/_authenticated/back-office.tsx` |
| `/back-office/advanced-desk` | — | not in nav (palette/deep-link only) | auth | page | 624 | `src/routes/_authenticated/back-office/advanced-desk.tsx` |
| `/back-office/case-design` | — | not in nav (palette/deep-link only) | auth | page | 369 | `src/routes/_authenticated/back-office/case-design.tsx` |
| `/back-office/case-design_/admin` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 160 | `src/routes/_authenticated/back-office/case-design_.admin.tsx` |
| `/back-office/client-marketing` | Marketing | everyone | auth | page | 151 | `src/routes/_authenticated/back-office/client-marketing.tsx` |
| `/back-office/marketing-tracker` | — | not in nav (palette/deep-link only) | auth | page | 290 | `src/routes/_authenticated/back-office/marketing-tracker.tsx` |
| `/back-office/recruiting-funnels` | — | not in nav (palette/deep-link only) | auth | page | 232 | `src/routes/_authenticated/back-office/recruiting-funnels.tsx` |
| `/back-office/recruiting-tracker` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 8 | `src/routes/_authenticated/back-office/recruiting-tracker.tsx` |
| `/book-of-business` | Book of Business | staffPermission=staff_view_policies | auth | page | 443 | `src/routes/_authenticated/book-of-business.tsx` |
| `/calendar` | Calendar | everyone | auth | page | 887 | `src/routes/_authenticated/calendar.tsx` |
| `/carrier-sync` | — | not in nav (palette/deep-link only) | auth | page | 473 | `src/routes/_authenticated/carrier-sync.tsx` |
| `/challenges` | Challenges | unlock=agency-member | auth | page | 102 | `src/routes/_authenticated/challenges.tsx` |
| `/clients` | Clients | staffPermission=staff_view_clients | auth | page | 191 | `src/routes/_authenticated/clients.tsx` |
| `/contracting-ops` | Contracting Ops | unlock=agency-admin, audience=["core"] | auth | REDIRECT | 142 | `src/routes/_authenticated/contracting-ops.tsx` |
| `/contracting-ops/agents` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 8 | `src/routes/_authenticated/contracting-ops/agents.tsx` |
| `/contracting-ops/carriers` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 21 | `src/routes/_authenticated/contracting-ops/carriers.tsx` |
| `/contracting-ops/commission-levels` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/commission-levels.tsx` |
| `/contracting-ops/comp-grids` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 15 | `src/routes/_authenticated/contracting-ops/comp-grids.tsx` |
| `/contracting-ops/compensation` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 18 | `src/routes/_authenticated/contracting-ops/compensation.tsx` |
| `/contracting-ops/documents` | Document review | staffPermission=staff_view_contracts, audience=["staff"] | auth | page | 141 | `src/routes/_authenticated/contracting-ops/documents.tsx` |
| `/contracting-ops/hierarchies` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/hierarchies.tsx` |
| `/contracting-ops/hierarchy-changes` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/hierarchy-changes.tsx` |
| `/contracting-ops/hierarchy` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/hierarchy.tsx` |
| `/contracting-ops/import` | Import records | unlock=agency-admin, permission=staff_is_admin, staffPermission=staff_view_contracts | auth | page | 247 | `src/routes/_authenticated/contracting-ops/import.tsx` |
| `/contracting-ops/inbox` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/inbox.tsx` |
| `/contracting-ops/` | — | not in nav (palette/deep-link only) | auth | page | 220 | `src/routes/_authenticated/contracting-ops/index.tsx` |
| `/contracting-ops/licensing` | Licensing & PDB | unlock=agency-admin, permission=staff_is_admin, staffPermission=staff_view_contracts | auth | page | 498 | `src/routes/_authenticated/contracting-ops/licensing.tsx` |
| `/contracting-ops/onboarding` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/onboarding.tsx` |
| `/contracting-ops/pipeline` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/pipeline.tsx` |
| `/contracting-ops/queue` | Today's Work | audience=["staff"] | auth | page | 193 | `src/routes/_authenticated/contracting-ops/queue.tsx` |
| `/contracting-ops/ready-to-sell` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/ready-to-sell.tsx` |
| `/contracting-ops/requests` | Contract Requests | unlock=agency-admin, permission=staff_is_admin, staffPermission=staff_view_contracts | auth | page | 5 | `src/routes/_authenticated/contracting-ops/requests.tsx` |
| `/contracting-ops/requests/$requestId` | — | not in nav (palette/deep-link only) | auth | page | 817 | `src/routes/_authenticated/contracting-ops/requests/$requestId.tsx` |
| `/contracting-ops/requests/` | — | not in nav (palette/deep-link only) | auth | page | 429 | `src/routes/_authenticated/contracting-ops/requests/index.tsx` |
| `/contracting-ops/settings` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 9 | `src/routes/_authenticated/contracting-ops/settings.tsx` |
| `/contracting-ops/templates` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 9 | `src/routes/_authenticated/contracting-ops/templates.tsx` |
| `/contracting-ops/writing-numbers` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/contracting-ops/writing-numbers.tsx` |
| `/contracting/comp-grids-manage` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 10 | `src/routes/_authenticated/contracting.comp-grids-manage.tsx` |
| `/contracting` | Contracting | staffPermission=staff_view_contracts | auth | page | 13 | `src/routes/_authenticated/contracting.tsx` |
| `/contracting/annuity-training` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 8 | `src/routes/_authenticated/contracting/annuity-training.tsx` |
| `/contracting/carriers` | Carrier Directory | everyone | auth | page | 134 | `src/routes/_authenticated/contracting/carriers.tsx` |
| `/contracting/commission-grids` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 19 | `src/routes/_authenticated/contracting/commission-grids.tsx` |
| `/contracting/commission-levels` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 11 | `src/routes/_authenticated/contracting/commission-levels.tsx` |
| `/contracting/` | — | not in nav (palette/deep-link only) | auth | page | 1233 | `src/routes/_authenticated/contracting/index.tsx` |
| `/contracting/invite` | Invite an agent | unlock=can-invite | auth | page | 686 | `src/routes/_authenticated/contracting/invite.tsx` |
| `/contracting/transfers` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 308 | `src/routes/_authenticated/contracting/transfers.tsx` |
| `/contracting/writing-numbers` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 11 | `src/routes/_authenticated/contracting/writing-numbers.tsx` |
| `/dashboard` | Home | everyone | auth | page | 841 | `src/routes/_authenticated/dashboard.tsx` |
| `/finances` | Finances | staffPermission=staff_view_commissions | auth | page | 640 | `src/routes/_authenticated/finances.tsx` |
| `/finances_/reconciliation` | — | not in nav (palette/deep-link only) | auth | page | 627 | `src/routes/_authenticated/finances_.reconciliation.tsx` |
| `/import` | Import | everyone | auth | page | 751 | `src/routes/_authenticated/import.tsx` |
| `/intake` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 9 | `src/routes/_authenticated/intake.tsx` |
| `/leaderboard` | Leaderboard | unlock=agency-member, audience=["core"] | auth | page | 345 | `src/routes/_authenticated/leaderboard.tsx` |
| `/licensing` | State Licenses | everyone | auth | page | 47 | `src/routes/_authenticated/licensing.tsx` |
| `/news-feed` | News Feed | everyone | auth | page | 96 | `src/routes/_authenticated/news-feed.tsx` |
| `/notifications` | Notifications | everyone | auth | page | 131 | `src/routes/_authenticated/notifications.tsx` |
| `/nova` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 12 | `src/routes/_authenticated/nova.tsx` |
| `/nova/activity` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 8 | `src/routes/_authenticated/nova/activity.tsx` |
| `/nova/settings` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 8 | `src/routes/_authenticated/nova/settings.tsx` |
| `/onboarding` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 45 | `src/routes/_authenticated/onboarding.tsx` |
| `/phone` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/phone.tsx` |
| `/pipeline` | Pipeline | staffPermission=staff_view_clients | auth | page | 594 | `src/routes/_authenticated/pipeline.tsx` |
| `/post-deal` | Post a Deal | staffPermission=staff_post_policies | auth | page | 753 | `src/routes/_authenticated/post-deal.tsx` |
| `/reports` | Reports | staffPermission=staff_view_analytics | auth | page | 17 | `src/routes/_authenticated/reports.tsx` |
| `/resources` | — | not in nav (palette/deep-link only) | auth | page | 95 | `src/routes/_authenticated/resources.tsx` |
| `/resources/agent-academy` | Academy | everyone | auth | page | 655 | `src/routes/_authenticated/resources/agent-academy.tsx` |
| `/resources/agent-handbook` | Handbook | everyone | auth | page | 229 | `src/routes/_authenticated/resources/agent-handbook.tsx` |
| `/resources/edit` | Edit resources | unlock=resource-editor | auth | page | 15 | `src/routes/_authenticated/resources/edit.tsx` |
| `/resources/new-agent-guide` | Tools | everyone | auth | page | 242 | `src/routes/_authenticated/resources/new-agent-guide.tsx` |
| `/resources/scripts` | Scripts | everyone | auth | page | 249 | `src/routes/_authenticated/resources/scripts.tsx` |
| `/resources/state-licenses` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 10 | `src/routes/_authenticated/resources/state-licenses.tsx` |
| `/retention` | Retention | staffPermission=staff_view_policies | auth | page | 434 | `src/routes/_authenticated/retention.tsx` |
| `/settings/agency` | Carriers | unlock=agency-admin, staffPermission=staff_view_contracts | auth | page | 600 | `src/routes/_authenticated/settings.agency.tsx` |
| `/settings/automations` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/settings.automations.tsx` |
| `/settings/billing` | Billing | everyone | auth | page | 503 | `src/routes/_authenticated/settings.billing.tsx` |
| `/settings/carriers` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 9 | `src/routes/_authenticated/settings.carriers.tsx` |
| `/settings/comp-grids` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/settings.comp-grids.tsx` |
| `/settings/contracting` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/settings.contracting.tsx` |
| `/settings/emails` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/settings.emails.tsx` |
| `/settings/` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 18 | `src/routes/_authenticated/settings.index.tsx` |
| `/settings/integrations` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/settings.integrations.tsx` |
| `/settings/levels` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/settings.levels.tsx` |
| `/settings/notifications` | Notifications | everyone | auth | page | 31 | `src/routes/_authenticated/settings.notifications.tsx` |
| `/settings/nova-pro` | Nova Pro | staffPermission=staff_nova_pro_enabled | auth | page | 210 | `src/routes/_authenticated/settings.nova-pro.tsx` |
| `/settings/resources` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/settings.resources.tsx` |
| `/settings/roles` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/settings.roles.tsx` |
| `/settings/security` | Security | everyone | auth | page | 185 | `src/routes/_authenticated/settings.security.tsx` |
| `/settings/sub-agencies` | Sub-Agencies | unlock=has-sub-agencies | auth | page | 158 | `src/routes/_authenticated/settings.sub-agencies.tsx` |
| `/settings/support` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/settings.support.tsx` |
| `/settings/templates` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/settings.templates.tsx` |
| `/settings` | Settings | everyone | auth | page | 24 | `src/routes/_authenticated/settings.tsx` |
| `/settings/usage` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/settings.usage.tsx` |
| `/settings/white-label` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 6 | `src/routes/_authenticated/settings.white-label.tsx` |
| `/tasks` | Tasks | everyone | auth | page | 301 | `src/routes/_authenticated/tasks.tsx` |
| `/team` | Agency | unlock=agency-member | auth | page | 1131 | `src/routes/_authenticated/team.tsx` |
| `/tools/leads` | — | not in nav (palette/deep-link only) | auth | page | 26 | `src/routes/_authenticated/tools/leads.tsx` |
| `/tools/quoter` | — | not in nav (palette/deep-link only) | auth | page | 31 | `src/routes/_authenticated/tools/quoter.tsx` |
| `/white-label` | — | not in nav (palette/deep-link only) | auth | REDIRECT | 7 | `src/routes/_authenticated/white-label.tsx` |
| `/admin/agents` | — | not in nav (palette/deep-link only) | public | page | 336 | `src/routes/admin.agents.tsx` |
| `/admin/analytics` | — | not in nav (palette/deep-link only) | public | page | 21 | `src/routes/admin.analytics.tsx` |
| `/admin/announcements` | — | not in nav (palette/deep-link only) | public | page | 160 | `src/routes/admin.announcements.tsx` |
| `/admin/billing` | — | not in nav (palette/deep-link only) | public | REDIRECT | 8 | `src/routes/admin.billing.tsx` |
| `/admin/carriers` | — | not in nav (palette/deep-link only) | public | page | 202 | `src/routes/admin.carriers.tsx` |
| `/admin/commissions` | — | not in nav (palette/deep-link only) | public | page | 672 | `src/routes/admin.commissions.tsx` |
| `/admin/contracts` | — | not in nav (palette/deep-link only) | public | page | 192 | `src/routes/admin.contracts.tsx` |
| `/admin/csv-import` | — | not in nav (palette/deep-link only) | public | page | 522 | `src/routes/admin.csv-import.tsx` |
| `/admin/hierarchy` | — | not in nav (palette/deep-link only) | public | page | 159 | `src/routes/admin.hierarchy.tsx` |
| `/admin/import-requests` | — | not in nav (palette/deep-link only) | public | page | 222 | `src/routes/admin.import-requests.tsx` |
| `/admin/` | — | not in nav (palette/deep-link only) | public | page | 326 | `src/routes/admin.index.tsx` |
| `/admin/migration` | — | not in nav (palette/deep-link only) | public | page | 303 | `src/routes/admin.migration.tsx` |
| `/admin/migrations` | — | not in nav (palette/deep-link only) | public | page | 127 | `src/routes/admin.migrations.tsx` |
| `/admin/roles` | — | not in nav (palette/deep-link only) | public | page | 183 | `src/routes/admin.roles.tsx` |
| `/admin/settings` | — | not in nav (palette/deep-link only) | public | page | 212 | `src/routes/admin.settings.tsx` |
| `/admin/subscriptions` | — | not in nav (palette/deep-link only) | public | page | 95 | `src/routes/admin.subscriptions.tsx` |
| `/admin/support` | — | not in nav (palette/deep-link only) | public | page | 296 | `src/routes/admin.support.tsx` |
| `/admin` | — | not in nav (palette/deep-link only) | public | REDIRECT | 164 | `src/routes/admin.tsx` |
| `/agent/$agentSlug/$templateSlug` | — | not in nav (palette/deep-link only) | public | page | 121 | `src/routes/agent.$agentSlug.$templateSlug.tsx` |
| `/auth/callback` | — | not in nav (palette/deep-link only) | public | page | 34 | `src/routes/auth.callback.tsx` |
| `/cookies` | — | not in nav (palette/deep-link only) | public | page | 40 | `src/routes/cookies.tsx` |
| `/demo-login` | — | not in nav (palette/deep-link only) | public | page | 107 | `src/routes/demo-login.tsx` |
| `/demo` | — | not in nav (palette/deep-link only) | public | page | 238 | `src/routes/demo.tsx` |
| `/email/unsubscribe` | — | not in nav (palette/deep-link only) | public | page | 152 | `src/routes/email/unsubscribe.ts` |
| `/forgot-password` | — | not in nav (palette/deep-link only) | public | page | 61 | `src/routes/forgot-password.tsx` |
| `/` | — | not in nav (palette/deep-link only) | public | page | 224 | `src/routes/index.tsx` |
| `/invite/$token` | — | not in nav (palette/deep-link only) | public | page | 359 | `src/routes/invite.$token.tsx` |
| `/join/$slug` | — | not in nav (palette/deep-link only) | public | page | 141 | `src/routes/join.$slug.tsx` |
| `/login` | — | not in nav (palette/deep-link only) | public | page | 150 | `src/routes/login.tsx` |
| `/lovable/email/auth/preview` | — | not in nav (palette/deep-link only) | public | page | 112 | `src/routes/lovable/email/auth/preview.ts` |
| `/lovable/email/auth/webhook` | — | not in nav (palette/deep-link only) | public | page | 232 | `src/routes/lovable/email/auth/webhook.ts` |
| `/lovable/email/queue/process` | — | not in nav (palette/deep-link only) | public | page | 326 | `src/routes/lovable/email/queue/process.ts` |
| `/lovable/email/suppression` | — | not in nav (palette/deep-link only) | public | page | 158 | `src/routes/lovable/email/suppression.ts` |
| `/lovable/email/transactional/preview` | — | not in nav (palette/deep-link only) | public | page | 89 | `src/routes/lovable/email/transactional/preview.ts` |
| `/lovable/email/transactional/send` | — | not in nav (palette/deep-link only) | public | page | 324 | `src/routes/lovable/email/transactional/send.ts` |
| `/myagent/$agentSlug` | — | not in nav (palette/deep-link only) | public | page | 350 | `src/routes/myagent.$agentSlug.tsx` |
| `/privacy` | — | not in nav (palette/deep-link only) | public | page | 60 | `src/routes/privacy.tsx` |
| `/reset-password` | — | not in nav (palette/deep-link only) | public | page | 42 | `src/routes/reset-password.tsx` |
| `/robots.txt` | — | not in nav (palette/deep-link only) | public | page | 39 | `src/routes/robots[.]txt.ts` |
| `/signup` | — | not in nav (palette/deep-link only) | public | page | 35 | `src/routes/signup.tsx` |
| `/signup_/agent` | — | not in nav (palette/deep-link only) | public | page | 168 | `src/routes/signup_.agent.tsx` |
| `/sitemap.xml` | — | not in nav (palette/deep-link only) | public | page | 35 | `src/routes/sitemap[.]xml.ts` |
| `/terms` | — | not in nav (palette/deep-link only) | public | page | 62 | `src/routes/terms.tsx` |

Total app routes: 156 | redirect stubs: 56 | not in nav registry: 112
