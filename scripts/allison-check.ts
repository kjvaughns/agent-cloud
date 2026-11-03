import { forcedEscalation, replyDelayMs, SUPPORT_INBOX } from "../src/lib/allison/rules";
const checks: [string, boolean][] = [
  ["uses support@useagentcloud.com", SUPPORT_INBOX === "support@useagentcloud.com"],
  ["waits at least 3 minutes", replyDelayMs(0) === 180_000],
  ["waits at most 5 minutes", replyDelayMs(0.999999) <= 300_000],
  ["refunds go to a person", forcedEscalation("can I get a refund") === "Refund or billing dispute"],
  ["discounts go to a person", forcedEscalation("any discount for 50 agents?") === "Pricing negotiation"],
  ["product questions stay with Allison", forcedEscalation("how does contracting work?") === null],
];
let fail = 0;
for (const [n, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${n}`); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
