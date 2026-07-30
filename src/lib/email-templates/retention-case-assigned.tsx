import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  clientName?: string
  reason?: string
  appUrl?: string
}

const RetentionCaseAssigned = ({ brand, clientName, reason, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`Retention case assigned: ${clientName || 'a client'}`}
    heading="A retention case is yours"
    lead={`You've been assigned the retention case for ${clientName || 'a client'}.`}
    cta={{ label: 'Open retention', href: `${appUrl || 'https://useagentcloud.com'}/retention` }}
  >
    <DetailRow label="Client" value={clientName || '—'} />
    {reason ? <DetailRow label="Reason" value={reason} /> : null}
    <Paragraph>
      Work it from the retention board so the outcome is recorded against the case — that's what
      feeds persistency reporting.
    </Paragraph>
  </EmailLayout>
)

export const template = {
  component: RetentionCaseAssigned,
  subject: (d: Record<string, any>) =>
    `Retention case assigned: ${d?.clientName || 'a client'}`,
  displayName: 'Retention case assigned',
  previewData: { clientName: 'Denise Ward', reason: 'NSF on second draft' },
} satisfies TemplateEntry

export default RetentionCaseAssigned
