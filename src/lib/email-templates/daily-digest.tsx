import * as React from 'react'
import { EmailLayout, Bullet, SectionLabel, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

export interface DigestSection {
  label: string
  items: string[]
  href?: string
}

interface Props {
  brand?: EmailBrand
  agentName?: string
  dateLabel?: string
  sections?: DigestSection[]
  appUrl?: string
}

/** One email per day listing everything, instead of one email per event. */
const DailyDigest = ({ brand, agentName, dateLabel, sections, appUrl }: Props) => {
  const list = sections?.filter((s) => s.items?.length) ?? []
  return (
    <EmailLayout
      brand={brand}
      preview={`Your Agent Cloud digest${dateLabel ? ` for ${dateLabel}` : ''}`}
      heading="Your daily digest"
      lead={`${agentName ? `${agentName}, here's` : "Here's"} what needs you today${dateLabel ? `, ${dateLabel}` : ''}.`}
      cta={{ label: 'Open Agent Cloud', href: appUrl || 'https://useagentcloud.com' }}
      note="One email a day. Individual events don't send separately."
    >
      {list.length === 0 ? (
        <Paragraph>Nothing needs your attention today. Rare, and worth enjoying.</Paragraph>
      ) : (
        list.map((section) => (
          <React.Fragment key={section.label}>
            <SectionLabel>
              {section.label} ({section.items.length})
            </SectionLabel>
            {section.items.slice(0, 12).map((item, i) => (
              <Bullet key={`${section.label}-${i}`}>{item}</Bullet>
            ))}
            {section.items.length > 12 ? (
              <Paragraph>+ {section.items.length - 12} more in the app.</Paragraph>
            ) : null}
          </React.Fragment>
        ))
      )}
    </EmailLayout>
  )
}

export const template = {
  component: DailyDigest,
  subject: (d: Record<string, any>) =>
    `Your Agent Cloud digest${d?.dateLabel ? ` — ${d.dateLabel}` : ''}`,
  displayName: 'Daily digest',
  previewData: {
    agentName: 'Kaeden',
    dateLabel: 'Thursday, July 30',
    sections: [
      { label: 'Policies at risk', items: ['Marcus Hollis — lapse pending', 'Denise Ward — NSF'] },
      { label: 'Tasks due', items: ['Call the Hollis family', 'Send Ward a payment link'] },
      { label: 'New leads', items: ['Tasha Brooks — mortgage protection funnel'] },
    ],
  },
} satisfies TemplateEntry

export default DailyDigest
