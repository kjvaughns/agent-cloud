import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  leadName?: string
  source?: string
  phone?: string
  state?: string
  appUrl?: string
}

const NewLead = ({ brand, leadName, source, phone, state, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`New lead: ${leadName || 'someone just submitted a form'}`}
    heading="New lead"
    lead={`${leadName || 'A new lead'} came in${source ? ` from ${source}` : ''}. Speed to lead is the whole game — call now.`}
    cta={{ label: 'Open the lead', href: `${appUrl || 'https://useagentcloud.com'}/pipeline` }}
  >
    <DetailRow label="Name" value={leadName || '—'} />
    {source ? <DetailRow label="Source" value={source} /> : null}
    {state ? <DetailRow label="State" value={state} /> : null}
    {phone ? <DetailRow label="Phone" value={phone} /> : null}
    <Paragraph>Full contact detail and the rest of the submission are in your pipeline.</Paragraph>
  </EmailLayout>
)

export const template = {
  component: NewLead,
  subject: (d: Record<string, any>) => `New lead: ${d?.leadName || 'form submission'}`,
  displayName: 'New lead',
  previewData: { leadName: 'Tasha Brooks', source: 'Mortgage protection funnel', state: 'GA', phone: '(404) 555-0128' },
} satisfies TemplateEntry

export default NewLead
