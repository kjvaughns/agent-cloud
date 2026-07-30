import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  agentName?: string
  orgName?: string
  appUrl?: string
}

const InviteAccepted = ({ brand, agentName, orgName, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`${agentName || 'A new agent'} accepted your invite`}
    heading="Your invite was accepted"
    lead={`${agentName || 'A new agent'} just joined ${orgName || 'your agency'} on Agent Cloud.`}
    cta={{ label: 'View your team', href: `${appUrl || 'https://useagentcloud.com'}/team` }}
  >
    <DetailRow label="Agent" value={agentName || '—'} />
    <DetailRow label="Agency" value={orgName || '—'} />
    <Paragraph>
      They can start contracting right away. Keep an eye on their onboarding checklist — agents who
      finish contracting in the first week write their first deal far sooner.
    </Paragraph>
  </EmailLayout>
)

export const template = {
  component: InviteAccepted,
  subject: (d: Record<string, any>) => `${d?.agentName || 'A new agent'} accepted your invite`,
  displayName: 'Invite accepted',
  previewData: { agentName: 'Jordan Reyes', orgName: 'King of Sales' },
} satisfies TemplateEntry

export default InviteAccepted
