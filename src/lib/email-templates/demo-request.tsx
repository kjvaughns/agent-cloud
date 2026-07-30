import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  name?: string
  company?: string
  email?: string
  phone?: string
  teamSize?: string
  message?: string
  appUrl?: string
}

// Internal notification — goes to the Agent Cloud team, not a customer.
const DemoRequest = ({ brand, name, company, email, phone, teamSize, message, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`Demo request from ${company || name || 'a new agency'}`}
    heading="New demo request"
    lead={`${name || 'Someone'}${company ? ` at ${company}` : ''} requested a demo.`}
    cta={{ label: 'Open demo requests', href: `${appUrl || 'https://useagentcloud.com'}/admin/demo-requests` }}
  >
    <DetailRow label="Name" value={name || '—'} />
    {company ? <DetailRow label="Agency" value={company} /> : null}
    {teamSize ? <DetailRow label="Team size" value={teamSize} /> : null}
    {email ? <DetailRow label="Email" value={email} /> : null}
    {phone ? <DetailRow label="Phone" value={phone} /> : null}
    {message ? <Paragraph>“{message}”</Paragraph> : null}
  </EmailLayout>
)

export const template = {
  component: DemoRequest,
  subject: (d: Record<string, any>) =>
    `Demo request — ${d?.company || d?.name || 'new agency'}`,
  displayName: 'Demo request (internal)',
  previewData: {
    name: 'Alicia Grant',
    company: 'Grant Financial',
    teamSize: '10-25 agents',
    email: 'alicia@grantfinancial.com',
    phone: '(770) 555-0155',
    message: 'We run a mostly FEX shop and want to see the commission side.',
  },
} satisfies TemplateEntry

export default DemoRequest
