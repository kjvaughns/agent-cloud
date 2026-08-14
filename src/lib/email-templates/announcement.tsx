import * as React from 'react'
import { EmailLayout, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  title?: string
  bodyHtml?: string
  fromName?: string
  appUrl?: string
}

/**
 * An agency announcement, delivered by email.
 *
 * The body is authored in the app's rich-text editor and already sanitised
 * with DOMPurify on the way in, which is why it can be set as HTML here. It is
 * rendered as a plain block rather than pushed through DetailRow: an
 * announcement is prose, not a set of fields.
 */
const Announcement = ({ brand, title, bodyHtml, fromName, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={title || 'A new announcement from your agency'}
    heading={title || 'A new announcement'}
    lead={fromName ? `From ${fromName}` : undefined}
    cta={{ label: 'Read it in the app', href: `${appUrl || 'https://useagentcloud.com'}/announcements` }}
  >
    {bodyHtml
      ? <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      : <Paragraph>Open the app to read this announcement.</Paragraph>}
  </EmailLayout>
)

export const template = {
  component: Announcement,
  subject: (d: Record<string, any>) => d?.title || 'A new announcement from your agency',
  displayName: 'Announcement',
  previewData: {
    title: 'Ethos rates change on the 1st',
    bodyHtml: '<p>New rate cards are in Comp Grids. Anything written before the 1st keeps the old rate.</p>',
    fromName: 'Vaughns Financial',
  },
} satisfies TemplateEntry

export default Announcement
