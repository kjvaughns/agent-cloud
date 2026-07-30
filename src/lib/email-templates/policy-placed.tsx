import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  clientName?: string
  carrierName?: string
  annualPremium?: string
  appUrl?: string
}

const PolicyPlaced = ({ brand, clientName, carrierName, annualPremium, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`Policy placed${clientName ? ` for ${clientName}` : ''}`}
    heading="Policy placed"
    lead={`${clientName || 'A client'}'s policy is active${carrierName ? ` with ${carrierName}` : ''}. Nice work.`}
    cta={{ label: 'Open your book', href: `${appUrl || 'https://useagentcloud.com'}/book` }}
  >
    <DetailRow label="Client" value={clientName || '—'} />
    {carrierName ? <DetailRow label="Carrier" value={carrierName} /> : null}
    {annualPremium ? <DetailRow label="Annual premium" value={annualPremium} /> : null}
    <Paragraph>
      Commission posts to your ledger once the carrier reports it. Set a checkpoint with the client
      around month three — that's where persistency is won.
    </Paragraph>
  </EmailLayout>
)

export const template = {
  component: PolicyPlaced,
  subject: (d: Record<string, any>) => `Policy placed${d?.clientName ? ` — ${d.clientName}` : ''}`,
  displayName: 'Policy placed',
  previewData: { clientName: 'Marcus Hollis', carrierName: 'Americo', annualPremium: '$1,140.00' },
} satisfies TemplateEntry

export default PolicyPlaced
