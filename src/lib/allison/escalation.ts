import { SIGNATURE, SUPPORT_INBOX } from './rules';

export const ESCALATION_RECIPIENT = 'kjvaughns13@gmail.com';
export const INTAKE_MARKER = 'ALLISON_ESCALATION_INTAKE';
export const HANDOFF_MARKER = 'ALLISON_ESCALATION_OWNER_NOTIFIED';

export interface EscalationDetails {
  project: string;
  problem: string;
  impact: string;
  timing: string;
  attempted: string;
  desiredOutcome: string;
  suggestions: string[];
}

export function intakeAnswered(messages: { sender: string; body: string; internal?: boolean }[]): boolean {
  const start = messages.findIndex((m) => m.internal && m.body === INTAKE_MARKER);
  return start >= 0 && messages.slice(start + 1).some((m) => !m.internal && m.sender === 'lead');
}

export function canHandoff(answered: boolean, details: EscalationDetails | null): boolean {
  return answered && details !== null && [details.project, details.problem, details.impact,
    details.timing, details.attempted, details.desiredOutcome].every((value) => value.trim().length > 0)
    && details.suggestions.some((value) => value.trim().length > 0);
}

export function intakeReply(name: string | null, questions: string[]): string {
  const items = questions.filter((q) => q.trim()).slice(0, 3);
  const fallback = [
    'Which project is this about: Agent Cloud, Licensing, Release Center, or Bankdocs?',
    'What happened, when did it start, and how is it affecting you?',
    'What have you tried so far, and what would you like the team to resolve?',
  ];
  return `Hi${name ? ` ${name.split(' ')[0]}` : ''},\n\nI want to give our team the full picture before handing this over.\n\n${(items.length ? items : fallback).join('\n\n')}\n\nPlease don’t send passwords, verification codes, full card details, or sensitive client documents. If a detail isn’t available, just let me know.\n\n${SIGNATURE}`;
}

export function escalationNotice(
  lead: { name: string | null; email: string; subject: string },
  reason: string,
  details: EscalationDetails,
  conversation: { sender: string; body: string }[],
) {
  return {
    to: ESCALATION_RECIPIENT,
    subject: `[Needs you] ${details.project} — ${lead.name || lead.email}`,
    text: `Allison gathered the following problem details.\nFrom: ${lead.name || ''} <${lead.email}>\nSubject: ${lead.subject}\nProject: ${details.project}\nReason for handoff: ${reason}\n\nProblem: ${details.problem}\nImpact: ${details.impact}\nStarted / frequency: ${details.timing}\nAlready tried: ${details.attempted}\nRequested outcome: ${details.desiredOutcome}\n\nSuggested next steps (recommendations only, not actions taken):\n${details.suggestions.map((s) => `- ${s}`).join('\n')}\n\nConversation:\n${conversation.map((m) => `${m.sender}: ${m.body}`).join('\n\n')}\n\nReply to ${lead.email} from ${SUPPORT_INBOX}.`,
  };
}