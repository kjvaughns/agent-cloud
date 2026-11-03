import { SUPPORT_INBOX } from './rules';

export function demoConfirmation(lead: { id: string; email: string; first_name: string }) {
 return {
  template: 'demo-confirmation',
  to: lead.email,
  replyTo: SUPPORT_INBOX,
  category: 'transactional' as const,
  key: `demo-confirmation:${lead.id}`,
  data: { firstName: lead.first_name },
 };
}