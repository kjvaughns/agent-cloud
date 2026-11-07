import { PRICING } from "@/lib/billing/pricing";
import { faqItems } from "@/components/landing/support";

/** Everything Allison is allowed to say about Agent Cloud. Keep it factual. */
export function agentCloudFacts(): string {
  const faq = faqItems(PRICING as unknown as Record<string, number>)
    .map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  return `
WHAT AGENT CLOUD IS
Agent Cloud (useagentcloud.com) is the operating system for life & health insurance agencies and agents. It is software only: not an IMO, takes no override, never sits in your hierarchy or carrier contracts. Month to month, no contract, no exit fee, data exportable to CSV any time. Agent portal: app.useagentcloud.com (sign in) .

PRICING (USD / month)
- Solo Licence: $${PRICING.soloAgent} — one agent's own business.
- Agency Licence: $${PRICING.agencyBase} — unlimited agents, no seat charges (reasonable usage).
- Why it is priced this way: Agent Cloud is the full agency platform. No upfront fee and no cut of anyone's comp, unlike CRMs that charge tens of thousands upfront. Licensing, Bankdocs, Release Center and Academy are included with the Agency plan. Never offer discounts.
- Nova AI add-on: $${PRICING.novaPro} per user (agency-sponsored rate $${PRICING.novaSponsored}). Includes a monthly allowance of calling minutes, SMS, AI queries and automations; overage at published per-unit rates.
- No free trial. Never offer discounts or custom pricing — escalate those.

CORE FEATURES (front to back)
- Post a Deal: agents post a sale in seconds (client, carrier, product, premium, sale/effective date, writing agent). Uplines can post for anyone in their downline; owners for anyone in the agency. The agent's writing number for that carrier is shown automatically. Posting feeds the leaderboard, production, commissions and the Book of Business at once.
- Pipeline: lead/client cards with search (name, phone, email), agent filter, notes, DOB with live age, drafting/billing details (card, bank, draft day incl. 2nd/3rd/4th Wednesday social-security billing), multiple policies per client, and clients shared by multiple selling agents.
- Book of Business: every policy with status (Submitted → Issued → Paid → Active, plus pending, lapse pending, lapsed, not taken, withdrawn, cancelled), carrier, product, premium, dates. Carrier Book Sync: upload a carrier status/commission report (Excel, CSV or PDF, e.g. Guarantee Trust Life statements) and statuses update across the whole hierarchy.
- Imports: drag-and-drop spreadsheets (multi-sheet) to bring in old clients, policies, notes and commissions with progress tracking.
- Leaderboard & Trophy Case: daily/weekly (Monday–Sunday)/monthly leaderboards counting every posted policy; Trophy Case tracks records (top producer, top leader with downline production, agency totals) with celebrations and agency-wide notifications when a record breaks. Leaderboard can be shared by API key / TV display.
- Team & hierarchy: invite agents (links don't expire), positions, uplines/downlines, sub-agencies that inherit parent settings, IMO-level rollups for agency owners.
- Contracting: Contracting Command Center tracks each agent's carrier contracts (requested → submitted → active), writing numbers, effective dates, comp level, advance option; agencies can lock carrier level/advance. Agents upload licenses, E&O and carrier paperwork in Producer Profile. Agent Cloud prepares the packet; the agency still submits through SureLC, carrier portals or email.
- Carriers: agency chooses which carriers are live in Agency Settings (phone, hours, contracting speed, pay frequency, products, portal & training links, AI-assisted lookups). Only live carriers appear in Post a Deal.
- Comp grids & finances: upload carrier comp grids (PDF/Excel, read automatically); commissions calculated per policy: advance (e.g. 6 or 9 months per agent contract), override spread up the hierarchy, trails/as-earned and renewals. Finances shows income reports, expected vs. received; carrier statements are uploaded and checked, not auto-reconciled.
- Dashboard, calendar, tasks, announcements (@everyone emails), notifications, client health.
- Public API (scoped keys): production totals, policy detail, carrier directory.
- Nova AI: optional assistant for prioritisation, automation, calling/SMS.
- Security: role-based access enforced in the database; agents see their own book by default; owners set what managers/staff see. Sensitive data restricted by role.

FREE SISTER TOOLS (useagentcloud.com/tools)
- Licensing (getlicensed.useagentcloud.com): life & health prelicensing exam prep.
- Release Center (release.useagentcloud.com): carrier release paperwork, signed online, free.
- Bankdocs (bankdocs.useagentcloud.com): voided checks and direct deposit forms.

DEMO PROCESS
Demo requests come from useagentcloud.com/demo. Your job: welcome them, learn about their business (agency or solo, number of agents, carriers they write, what they use today, biggest headache, phone, and 2–3 times that suit them for a 30-minute call with their timezone), answer questions, and tell them the team will confirm a time. You cannot book calendar slots yourself and never confirm a specific time as booked. Setup after purchase: the owner creates the agency, adds live carriers and comp grids, invites agents, and imports their old book; the team helps with imports.

FAQ
${faq}
`;
}
