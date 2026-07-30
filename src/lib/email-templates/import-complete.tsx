import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  clients?: number
  policies?: number
  notes?: number
  appUrl?: string
}

const ImportComplete = ({ brand, clients, policies, notes, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview="Your book of business import finished"
    heading="Your book is in"
    lead="We finished importing your book of business into Agent Cloud."
    cta={{ label: 'Open book of business', href: `${appUrl || 'https://useagentcloud.com'}/book-of-business` }}
  >
    <DetailRow label="Clients" value={String(clients ?? 0)} />
    <DetailRow label="Policies" value={String(policies ?? 0)} />
    <DetailRow label="Notes" value={String(notes ?? 0)} />
    <Paragraph>
      Review the imported records and confirm carrier and status details so your commissions
      calculate correctly.
    </Paragraph>
  </EmailLayout>
)

export const template = {
  component: ImportComplete,
  subject: 'Your book of business import is complete',
  displayName: 'Import complete',
  previewData: { clients: 214, policies: 268, notes: 90 },
} satisfies TemplateEntry

export default ImportComplete
