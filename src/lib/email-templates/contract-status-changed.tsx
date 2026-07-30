import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  carrierName?: string
  status?: string
  note?: string
  appUrl?: string
}

const STATUS_COPY: Record<string, string> = {
  submitted: 'Your contract request has been submitted to the carrier.',
  processing: 'The carrier is processing your contract.',
  active: 'Your contract is active — you can write business with this carrier.',
  issue: 'The carrier flagged an issue that needs your attention.',
  rejected: 'The carrier declined this contract request.',
}

const ContractStatusChanged = ({ brand, carrierName, status, note, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`${carrierName || 'Carrier'} contract is now ${status || 'updated'}`}
    heading="Contract status updated"
    lead={STATUS_COPY[status || ''] || 'Your contract status changed.'}
    cta={{ label: 'View contracting', href: `${appUrl || 'https://useagentcloud.com'}/contracting` }}
  >
    <DetailRow label="Carrier" value={carrierName || '—'} />
    <DetailRow label="Status" value={(status || 'updated').replace(/_/g, ' ')} />
    {note ? <Paragraph>{note}</Paragraph> : null}
  </EmailLayout>
)

export const template = {
  component: ContractStatusChanged,
  subject: (d: Record<string, any>) =>
    `${d?.carrierName || 'Carrier'} contract: ${(d?.status || 'updated').replace(/_/g, ' ')}`,
  displayName: 'Contract status changed',
  previewData: { carrierName: 'Mutual of Omaha', status: 'active' },
} satisfies TemplateEntry

export default ContractStatusChanged
