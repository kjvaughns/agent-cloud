import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  amount?: string
  carrierName?: string
  clientName?: string
  appUrl?: string
}

const CommissionPosted = ({ brand, amount, carrierName, clientName, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`Commission posted${amount ? `: ${amount}` : ''}`}
    heading="Commission posted"
    lead={`A new commission${amount ? ` of ${amount}` : ''} has posted to your ledger.`}
    cta={{ label: 'View finances', href: `${appUrl || 'https://useagentcloud.com'}/finances` }}
  >
    {amount ? <DetailRow label="Amount" value={amount} /> : null}
    {carrierName ? <DetailRow label="Carrier" value={carrierName} /> : null}
    {clientName ? <DetailRow label="Client" value={clientName} /> : null}
    <Paragraph>
      Full policy and payout detail lives in the app — we keep it out of email on purpose.
    </Paragraph>
  </EmailLayout>
)

export const template = {
  component: CommissionPosted,
  subject: (d: Record<string, any>) =>
    d?.amount ? `Commission posted: ${d.amount}` : 'A commission posted to your ledger',
  displayName: 'Commission posted',
  previewData: { amount: '$1,284.00', carrierName: 'Americo', clientName: 'M. Hollis' },
} satisfies TemplateEntry

export default CommissionPosted
