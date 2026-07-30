import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  state?: 'complete' | 'needs_info'
  clientName?: string
  appUrl?: string
}

const headingFor = (state?: string) =>
  state === 'needs_info' ? 'Your case needs more information' : 'Your case recommendations are ready'

const CaseDesignUpdated = ({ brand, state, clientName, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={headingFor(state)}
    heading={headingFor(state)}
    lead={
      state === 'needs_info'
        ? 'The advanced desk needs a few more details before they can finish this case.'
        : 'The advanced desk has finished reviewing your case design request.'
    }
    cta={{ label: 'Open case design', href: `${appUrl || 'https://useagentcloud.com'}/enablement/advanced-market` }}
  >
    {clientName ? <DetailRow label="Client" value={clientName} /> : null}
    <Paragraph>
      Open the case in Agent Cloud to read the full write-up and reply to the desk.
    </Paragraph>
  </EmailLayout>
)

export const template = {
  component: CaseDesignUpdated,
  subject: (d: Record<string, any>) => headingFor(d?.state),
  displayName: 'Case design updated',
  previewData: { state: 'complete', clientName: 'Marcus Hill' },
} satisfies TemplateEntry

export default CaseDesignUpdated
