import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  carrierName?: string
  appUrl?: string
}

const CarrierAdded = ({ brand, carrierName, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`${carrierName || 'A new carrier'} was added to your contracting`}
    heading="New carrier added to your contracting"
    lead={`${carrierName || 'A new carrier'} is now on your contracting list.`}
    cta={{ label: 'Open contracting', href: `${appUrl || 'https://useagentcloud.com'}/contracting` }}
  >
    <DetailRow label="Carrier" value={carrierName || '—'} />
    <Paragraph>
      Check the request for anything still marked outstanding — a missing writing number or comp
      level is the usual reason a contract stalls before it goes active.
    </Paragraph>
  </EmailLayout>
)

export const template = {
  component: CarrierAdded,
  subject: (d: Record<string, any>) =>
    `${d?.carrierName || 'A new carrier'} added to your contracting`,
  displayName: 'Carrier added',
  previewData: { carrierName: 'Americo' },
} satisfies TemplateEntry

export default CarrierAdded
