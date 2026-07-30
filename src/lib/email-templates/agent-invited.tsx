import * as React from 'react'
import { EmailLayout, Bullet, DetailRow, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  inviterName?: string
  orgName?: string
  inviteUrl: string
  roleLabel?: string
}

const AgentInvited = ({ brand, inviterName, orgName, inviteUrl, roleLabel }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`${inviterName || 'Your upline'} invited you to ${orgName || 'Agent Cloud'}`}
    heading="You've been invited"
    lead={`${inviterName || 'Your upline'} invited you to join ${orgName || 'Agent Cloud'}${roleLabel ? ` as ${roleLabel}` : ''}.`}
    cta={{ label: 'Accept your invite', href: inviteUrl }}
    note="This invite link is personal to you. If you weren't expecting it, you can ignore this email."
  >
    <DetailRow label="Invited by" value={inviterName || '—'} />
    <DetailRow label="Agency" value={orgName || 'Agent Cloud'} />
    <Bullet>Create your login and finish your profile.</Bullet>
    <Bullet>Submit contracting for the carriers you write.</Bullet>
    <Bullet>Start logging deals — your pipeline and commissions track automatically.</Bullet>
  </EmailLayout>
)

export const template = {
  component: AgentInvited,
  subject: (d: Record<string, any>) =>
    `You're invited to join ${d?.orgName || 'Agent Cloud'}`,
  displayName: 'Agent invited',
  previewData: {
    inviterName: 'Kaeden Vaughns',
    orgName: 'King of Sales',
    roleLabel: 'a producing agent',
    inviteUrl: 'https://useagentcloud.com/invite/example',
  },
} satisfies TemplateEntry

export default AgentInvited
