import * as React from 'react';
import { EmailLayout, Paragraph } from './layout';
import type { TemplateEntry } from './registry';

function DemoConfirmation({ firstName }: { firstName?: string }) {
 return <EmailLayout preview="We received your demo request. Our team will reach out shortly." heading="Your demo request is received" lead={firstName ? `Hi ${firstName},` : 'Hello,'}>
  <Paragraph>Thank you for requesting an Agent Cloud demo. We’ve received your request, and our team will reach out shortly.</Paragraph>
  <Paragraph>Our support team will follow up to learn more about your agency and help you get started.</Paragraph>
  <Paragraph>If you have anything to add, reply to this email. Your message will go straight to our support inbox.</Paragraph>
  <Paragraph>The Agent Cloud team</Paragraph>
 </EmailLayout>;
}
export const template = {
 component: DemoConfirmation,
 subject: 'We received your demo request — Agent Cloud',
 displayName: 'Demo request confirmation',
 previewData: { firstName: 'Jordan' },
} satisfies TemplateEntry;