import * as React from 'react'
import { EmailLayout, Bullet, DetailRow, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  state?: 'activated' | 'ended'
  seats?: number
  appUrl?: string
}

const NovaProChanged = ({ brand, state, seats, appUrl }: Props) => {
  const ended = state === 'ended'
  return (
    <EmailLayout
      brand={brand}
      preview={ended ? 'Nova AI Pro has ended' : 'Nova AI Pro is active'}
      heading={ended ? 'Nova Pro has ended' : 'Nova AI Pro activated'}
      lead={
        ended
          ? 'Your agency no longer has Nova Pro. Nova falls back to the standard assistant.'
          : 'Nova Pro is switched on for your agency. Automations, briefs and deeper analysis are live.'
      }
      cta={{ label: 'Open Nova AI', href: `${appUrl || 'https://useagentcloud.com'}/nova-ai` }}
    >
      <DetailRow label="Status" value={ended ? 'Ended' : 'Active'} />
      {typeof seats === 'number' ? <DetailRow label="Seats" value={String(seats)} /> : null}
      {ended ? null : (
        <>
          <Bullet>Morning agency briefs land before you start dialing.</Bullet>
          <Bullet>Retention cases get ranked so the urgent ones surface first.</Bullet>
          <Bullet>Commission variances come with an explanation, not just a number.</Bullet>
        </>
      )}
    </EmailLayout>
  )
}

export const template = {
  component: NovaProChanged,
  subject: (d: Record<string, any>) =>
    d?.state === 'ended' ? 'Nova AI Pro has ended' : 'Nova AI Pro is now active',
  displayName: 'Nova Pro activated / ended',
  previewData: { state: 'activated', seats: 12 },
} satisfies TemplateEntry

export default NovaProChanged
