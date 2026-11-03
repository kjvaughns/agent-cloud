import { forcedEscalation, replyDelayMs, SUPPORT_INBOX } from "../src/lib/allison/rules";
import { demoNotification } from "../src/lib/allison/demo-notification";
import { demoConfirmation } from '../src/lib/allison/demo-confirmation';
const checks: [string, boolean][] = [
  ["uses support@useagentcloud.com", SUPPORT_INBOX === "support@useagentcloud.com"],
  ["demo acknowledgment replies go to AgentMail", demoConfirmation({ id: 'request-1', email: 'requester@example.com', first_name: 'Test' }).replyTo === 'support@useagentcloud.com'],
  ["demo acknowledgment goes to requester", demoConfirmation({ id: 'request-1', email: 'requester@example.com', first_name: 'Test' }).to === 'requester@example.com'],
  ["demo acknowledgment retries use the same request key", demoConfirmation({ id: 'request-1', email: 'requester@example.com', first_name: 'Test' }).key === 'demo-confirmation:request-1'],
  ["demo forms go to support inbox", demoNotification("Test", "requester@example.com", "agency: Test").to === "support@useagentcloud.com"],
  ["waits at least 3 minutes", replyDelayMs(0) === 180_000],
  ["waits at most 5 minutes", replyDelayMs(0.999999) <= 300_000],
  ["refunds go to a person", forcedEscalation("can I get a refund") === "Refund or billing dispute"],
  ["discounts go to a person", forcedEscalation("any discount for 50 agents?") === "Pricing negotiation"],
  ["product questions stay with Allison", forcedEscalation("how does contracting work?") === null],
];
let fail = 0;
for (const [n, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${n}`); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
