import { forcedEscalation, replyDelayMs, SUPPORT_INBOX } from "../src/lib/allison/rules";
import { demoNotification } from "../src/lib/allison/demo-notification";
import { demoConfirmation } from '../src/lib/allison/demo-confirmation';
import { ESCALATION_RECIPIENT, INTAKE_MARKER, canHandoff, intakeAnswered, escalationNotice, type EscalationDetails } from '../src/lib/allison/escalation';
const details: EscalationDetails = { project: 'Agent Cloud: Bankdocs', problem: 'Upload fails', impact: 'Cannot submit a statement', timing: 'Today, every attempt', attempted: 'Retried upload', desiredOutcome: 'Complete upload', suggestions: ['Review the upload error and file limits'] };
const notice = escalationNotice({ name: 'Test', email: 'requester@example.com', subject: 'Upload issue' }, 'Needs investigation', details, [{ sender: 'lead', body: 'Upload fails every time' }]);
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
  ['owner email is the requested recipient', ESCALATION_RECIPIENT === 'kjvaughns13@gmail.com' && notice.to === 'kjvaughns13@gmail.com'],
  ['cannot hand off before a customer answers questions', canHandoff(false, details) === false],
  ['cannot hand off with missing project context', canHandoff(true, { ...details, project: '' }) === false],
  ['cannot hand off without suggestions', canHandoff(true, { ...details, suggestions: [] }) === false],
  ['complete context after an answer permits handoff', canHandoff(true, details) === true],
  ['earlier customer message is not an intake answer', intakeAnswered([{ sender: 'lead', body: 'Refund please' }, { sender: 'team', body: INTAKE_MARKER, internal: true }]) === false],
  ['customer reply after questions counts as intake answer', intakeAnswered([{ sender: 'team', body: INTAKE_MARKER, internal: true }, { sender: 'lead', body: 'Bankdocs upload fails' }]) === true],
  ['owner report includes the referenced project', notice.text.includes('Project: Agent Cloud: Bankdocs')],
  ['owner report includes the complete problem and suggestions', notice.text.includes('Problem: Upload fails') && notice.text.includes('Review the upload error and file limits') && notice.text.includes('Requested outcome: Complete upload')],
];
let fail = 0;
for (const [n, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${n}`); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
