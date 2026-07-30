import * as React from 'react'
import { EmailLayout, Bullet, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  state?: 'submitted' | 'action_required'
  agentName?: string
  detail?: string
  appUrl?: string
}

const TransferRequest = ({ brand, state, agentName, detail, appUrl }: Props) => {
  const action = state === 'action_required'
  return (
    <EmailLayout
      brand={brand}
      preview={action ? 'Your transfer request needs action' : 'A transfer request was submitted'}
      heading={action ? 'Action required on your transfer' : 'Transfer request submitted'}
      lead={
        action
          ? 'Your transfer request is missing something before it can move forward.'
          : `${agentName || 'An agent'} submitted a transfer request.`
      }
      cta={{ label: 'Open transfer requests', href: `${appUrl || 'https://useagentcloud.com'}/contracting` }}
    >
      {agentName ? <DetailRow label="Agent" value={agentName} /> : null}
      <DetailRow label="Status" value={action ? 'Action required' : 'Submitted'} />
      {detail ? <Paragraph>{detail}</Paragraph> : null}
      {action ? (
        <>
          <Bullet>Check the request for the flagged item.</Bullet>
          <Bullet>Upload or correct it in the app.</Bullet>
          <Bullet>Nothing moves at the carrier until it clears.</Bullet>
        </>
      ) : null}
    </EmailLayout>
  )
}

export const template = {
  component: TransferRequest,
  subject: (d: Record<string, any>) =>
    d?.state === 'action_required'
      ? 'Action required on your transfer request'
      : `Transfer request from ${d?.agentName || 'an agent'}`,
  displayName: 'Transfer request',
  previewData: { state: 'submitted', agentName: 'Jordan Reyes' },
} satisfies TemplateEntry

export default TransferRequest
