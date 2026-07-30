import * as React from 'react'
import { EmailLayout, DetailRow, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  state?: 'activated' | 'cancelled'
  planName?: string
  renewsOn?: string
  appUrl?: string
}

const SubscriptionChanged = ({ brand, state, planName, renewsOn, appUrl }: Props) => {
  const cancelled = state === 'cancelled'
  return (
    <EmailLayout
      brand={brand}
      preview={cancelled ? 'Your subscription has been cancelled' : 'Your subscription is active'}
      heading={cancelled ? 'Subscription cancelled' : 'Subscription activated'}
      lead={
        cancelled
          ? `${planName || 'Your plan'} has been cancelled. You keep access until the end of the current period.`
          : `${planName || 'Your plan'} is active. Everything on it is switched on for your agency.`
      }
      cta={{ label: 'Manage billing', href: `${appUrl || 'https://useagentcloud.com'}/billing` }}
    >
      <DetailRow label="Plan" value={planName || '—'} />
      <DetailRow label="Status" value={cancelled ? 'Cancelled' : 'Active'} />
      {renewsOn ? (
        <DetailRow label={cancelled ? 'Access until' : 'Renews'} value={renewsOn} />
      ) : null}
      <Paragraph>
        {cancelled
          ? 'Your data stays exactly where it is. You can reactivate any time from the billing page.'
          : 'Invoices and receipts are available on the billing page.'}
      </Paragraph>
    </EmailLayout>
  )
}

export const template = {
  component: SubscriptionChanged,
  subject: (d: Record<string, any>) =>
    d?.state === 'cancelled' ? 'Your subscription was cancelled' : 'Your subscription is active',
  displayName: 'Subscription activated / cancelled',
  previewData: { state: 'activated', planName: 'Agency', renewsOn: 'August 1, 2026' },
} satisfies TemplateEntry

export default SubscriptionChanged
