/**
 * A Discord message carries no client, and one event posts once.
 *
 *   npx tsx scripts/discord-message-check.ts
 *
 * ── The defect ──
 *
 * The senders did not leak client data, but only because each had been written
 * carefully. Nothing structural stopped the next one rendering a field off the
 * policy row because it would be nice to see, and a webhook posts into a
 * channel whose membership the agency does not control.
 *
 * ── Why three layers ──
 *
 * The allowlist says which fields exist. The builders cannot see anything
 * else, because they take narrow fact types rather than a policy row. And
 * `piiProblems` scans the finished text, which is the only layer that catches
 * a forbidden value arriving inside an allowed field — an announcement body
 * pasted full of a client's phone number passes the first two.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DISCORD_EVENTS, EVENT_LABEL, EVENT_PURPOSE, ALLOWED_FIELDS,
  buildSalesMessage, buildAnnouncementMessage, buildNewAgentMessage,
  piiProblems, isSafeToSend, eventKey, eventsFor, eventSummary,
} from "../src/lib/discord/message";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── The three the brief names ───────────────────────────────────────────────

check("exactly three event types", [...DISCORD_EVENTS], ["sales", "announcements", "new_agents"]);
check("each has a label", DISCORD_EVENTS.every((e) => EVENT_LABEL[e].length > 3), true);
check("…and says what it posts", DISCORD_EVENTS.every((e) => EVENT_PURPOSE[e].length > 15), true);

// ── The allowlist itself ────────────────────────────────────────────────────
//
// Asserted as data. A forbidden field added to a builder shows up here as a
// diff rather than as a behaviour change nobody reviews.

check("a sale may carry only these",
  [...ALLOWED_FIELDS.sales],
  ["agentName", "carrier", "productCategory", "annualPremium", "teamName", "at"]);
check("an announcement only these", [...ALLOWED_FIELDS.announcements], ["title", "body", "at"]);
check("a new agent only these",
  [...ALLOWED_FIELDS.new_agents], ["agentName", "position", "welcome", "at"]);

const FORBIDDEN_FIELDS = [
  "clientName", "insuredName", "phone", "email", "policyNumber",
  "dateOfBirth", "dob", "address", "beneficiary", "notes",
];
check("none of the forbidden fields appears in any allowlist",
  DISCORD_EVENTS.flatMap((e) => ALLOWED_FIELDS[e].filter((f) => FORBIDDEN_FIELDS.includes(f))), []);

// ── A sale posts the agent, never the insured ───────────────────────────────

const sale = buildSalesMessage({
  agentName: "Dana Reed", carrier: "Transamerica", productCategory: "Final Expense",
  annualPremium: 1200, teamName: "Team North", at: "2026-08-15T10:00:00Z",
});
check("the sale names the agent", /Dana Reed/.test(sale), true);
check("…the carrier", /Transamerica/.test(sale), true);
check("…the product category", /Final Expense/.test(sale), true);
check("…the premium, rounded and readable", /\$1,200/.test(sale), true);
check("…and the team", /Team North/.test(sale), true);
check("the sale is safe to send", isSafeToSend(sale), true);
// A premium is four digits with a comma; the phone rule must not eat it.
check("a premium is not mistaken for a phone number", piiProblems(sale), []);

const noTeam = buildSalesMessage({
  agentName: "Dana Reed", carrier: "Mutual", productCategory: null,
  annualPremium: 900, teamName: null, at: "x",
});
check("a missing team leaves no dangling word", /\bon\b\s*$/m.test(noTeam.split("\n")[0]), false);
check("…and a missing product leaves no dangling separator", / · /.test(noTeam), false);

// ── The text scan, which is the layer that catches the rest ─────────────────

check("an email is caught",
  /email address/.test(piiProblems("Reach them at bob@example.com")[0] ?? ""), true);
check("a dashed phone number is caught",
  /phone number/.test(piiProblems("call 555-123-4567")[0] ?? ""), true);
check("a bracketed one is too",
  /phone number/.test(piiProblems("call (555) 123 4567")[0] ?? ""), true);
check("a bare ten digit run is too",
  /phone number/.test(piiProblems("5551234567")[0] ?? ""), true);
check("an SSN is caught", piiProblems("123-45-6789").length, 1);
check("a date of birth mention is caught", piiProblems("DOB 1950").length, 1);
check("a policy number is caught", piiProblems("Policy #A12345").length, 1);
check("a beneficiary mention is caught", piiProblems("beneficiary updated").length, 1);
check("a street address is caught", piiProblems("12 Maple Street").length, 1);

// The asymmetry is deliberate: a false positive costs one blocked message and
// a ledger line, a false negative posts a phone number into a channel with
// unknown membership.
check("an ordinary announcement passes",
  piiProblems("**Q3 kickoff**\nWe are meeting Friday at 9am to review targets."), []);
check("a premium figure passes", piiProblems("$12,000 annual premium"), []);
check("a year passes", piiProblems("Best quarter since 2024"), []);

// The case only the text scan can catch: forbidden content inside an allowed
// field.
const leaky = buildAnnouncementMessage({
  title: "Reminder", body: "Call the Nguyen family on 555-867-5309 today.", at: "x",
});
check("a phone number pasted into an announcement body is caught",
  isSafeToSend(leaky), false);
check("…and the reason is recordable", piiProblems(leaky).length, 1);

// ── New agents ──────────────────────────────────────────────────────────────

const joined = buildNewAgentMessage({
  agentName: "Sam Ortiz", position: "Training Agent", welcome: "Say hello!", at: "x",
});
check("a new agent posts name and position", /Sam Ortiz.*Training Agent/s.test(joined), true);
check("…and the welcome", /Say hello!/.test(joined), true);
check("…with no application detail", isSafeToSend(joined), true);
check("a missing position still reads",
  buildNewAgentMessage({ agentName: "Sam Ortiz", position: null, welcome: null, at: "x" }),
  "**Sam Ortiz** joined");

// ── One event, one post ─────────────────────────────────────────────────────

// Built from what the event IS. A timestamp in here would make every retry
// look like a new event, which is the whole failure this prevents.
check("the key is stable across retries",
  eventKey("i1", "sales", "p1"), eventKey("i1", "sales", "p1"));
check("…and differs per channel", eventKey("i1", "sales", "p1") === eventKey("i2", "sales", "p1"), false);
check("…per event type", eventKey("i1", "sales", "p1") === eventKey("i1", "new_agents", "p1"), false);
check("…and per subject", eventKey("i1", "sales", "p1") === eventKey("i1", "sales", "p2"), false);

// ── Event selection ─────────────────────────────────────────────────────────

check("a bot can carry one event",
  eventsFor({ post_deals: true }), ["sales"]);
check("…several", eventsFor({ post_deals: true, post_new_agents: true }), ["sales", "new_agents"]);
check("…or all three",
  eventsFor({ post_deals: true, post_announcements: true, post_new_agents: true }),
  ["sales", "announcements", "new_agents"]);
// A bot with nothing selected looks configured and does nothing, which is the
// state most worth naming out loud.
check("none says so plainly",
  /will not post anything/.test(eventSummary(eventsFor({}))), true);
check("all three is summarised", eventSummary(eventsFor({
  post_deals: true, post_announcements: true, post_new_agents: true })), "All events");
check("a subset is listed", eventSummary(["sales", "new_agents"]), "Sales, New Agents");

// ── Every send goes through the gate ────────────────────────────────────────
//
// A scanner nothing calls blocks nothing. `postToDiscord` is the single choke
// point every event type passes through, which is why the check lives there
// rather than in each builder's caller.

console.log("");

const SEND = readFileSync(join(process.cwd(), "src/lib/discord.functions.ts"), "utf8");
check("the sender scans the payload before posting",
  /const problems = piiProblems\(JSON\.stringify\(body\)\);/.test(SEND), true);
check("…and refuses rather than redacting",
  /throw new DiscordPrivacyError\(problems\)/.test(SEND), true);
// Before the fetch, or it is not a gate.
check("…before the request is made",
  SEND.indexOf("piiProblems(JSON.stringify(body))") < SEND.indexOf("await fetch(webhookUrl"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
