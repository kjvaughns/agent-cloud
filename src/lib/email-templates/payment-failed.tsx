import * as React from 'react'
import { EmailLayout, Bullet, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  amountDue?: string
  graceUntil?: string
  appUrl?: string
}

// Category: transactional — billing failure. Always sends, no unsubscribe.
const PaymentFailed = ({ brand, amountDue, graceUntil, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview="Your payment did not go through"
    heading="We couldn't process your payment"
    lead={`Your most recent payment${amountDue ? ` of ${amountDue}` : ''} was declined.`}
    cta={{ label: 'Update payment method', href: `${appUrl || 'https://useagentcloud.com'}/billing` }}
    note="We never include card details in email. Update your card in the app."
  >
    {amountDue ? <DetailRow label="Amount due" value={amountDue} /> : null}
    {graceUntil ? <DetailRow label="Retry until" value={graceUntil} /> : null}
    <Paragraph>If it isn't fixed:</Paragraph>
    <Bullet>We retry the charge over the next few days.</Bullet>
    <Bullet>After that, Nova AI and premium features pause for your agency.</Bullet>
    <Bullet>Your data stays intact — nothing is deleted.</Bullet>
  </EmailLayout>
)

export const template = {
  component: PaymentFailed,
  subject: 'Action needed: your payment was declined',
  displayName: 'Payment failed',
  previewData: { amountDue: '$149.00', graceUntil: 'July 12, 2026' },
} satisfies TemplateEntry

export default PaymentFailed
