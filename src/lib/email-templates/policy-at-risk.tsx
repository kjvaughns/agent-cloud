import * as React from 'react'
import { EmailLayout, Bullet, DetailRow, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  clientName?: string
  carrierName?: string
  statusLabel?: string
  appUrl?: string
}

const PolicyAtRisk = ({ brand, clientName, carrierName, statusLabel, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`${clientName || 'A client'}'s policy needs attention`}
    heading="A policy is at risk"
    lead={`${clientName || 'A client'}'s policy is ${statusLabel || 'at risk of lapsing'}. Acting in the first few days is what saves it.`}
    cta={{ label: 'Open the policy', href: `${appUrl || 'https://useagentcloud.com'}/book` }}
    note="Policy numbers and banking details stay in the app — we don't put them in email."
  >
    <DetailRow label="Client" value={clientName || '—'} />
    {carrierName ? <DetailRow label="Carrier" value={carrierName} /> : null}
    <DetailRow label="Status" value={statusLabel || 'Lapse pending'} />
    <Bullet>Call the client before the grace period closes.</Bullet>
    <Bullet>Confirm the draft date and the account on file.</Bullet>
    <Bullet>Log the outcome so retention tracking stays accurate.</Bullet>
  </EmailLayout>
)

export const template = {
  component: PolicyAtRisk,
  subject: (d: Record<string, any>) =>
    `Policy at risk: ${d?.clientName || 'a client needs a call'}`,
  displayName: 'Policy at risk',
  previewData: { clientName: 'Marcus Hollis', carrierName: 'Americo', statusLabel: 'Lapse pending' },
} satisfies TemplateEntry

export default PolicyAtRisk
