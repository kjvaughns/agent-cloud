import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  statementLabel?: string
  matched?: number
  varianceCount?: number
  unmatched?: number
  appUrl?: string
}

const StatementReconciled = ({
  brand,
  statementLabel,
  matched,
  varianceCount,
  unmatched,
  appUrl,
}: Props) => (
  <EmailLayout
    brand={brand}
    preview={`Statement reconciled — ${varianceCount ?? 0} variance${varianceCount === 1 ? '' : 's'}`}
    heading="Statement reconciled"
    lead={`${statementLabel || 'A commission statement'} finished reconciling.`}
    cta={{ label: 'Review the statement', href: `${appUrl || 'https://useagentcloud.com'}/finances` }}
    note={
      (varianceCount ?? 0) > 0
        ? 'Variances are lines where the carrier paid something other than what was expected. Review them before the next pay cycle.'
        : undefined
    }
  >
    <DetailRow label="Statement" value={statementLabel || '—'} />
    <DetailRow label="Matched lines" value={String(matched ?? 0)} />
    <DetailRow label="Variances" value={String(varianceCount ?? 0)} />
    <DetailRow label="Unmatched" value={String(unmatched ?? 0)} />
    <Paragraph>Line-level detail is in the app.</Paragraph>
  </EmailLayout>
)

export const template = {
  component: StatementReconciled,
  subject: (d: Record<string, any>) =>
    `Statement reconciled — ${d?.varianceCount ?? 0} variance${d?.varianceCount === 1 ? '' : 's'}`,
  displayName: 'Statement reconciled',
  previewData: { statementLabel: 'Americo — June 2026', matched: 148, varianceCount: 6, unmatched: 2 },
} satisfies TemplateEntry

export default StatementReconciled
