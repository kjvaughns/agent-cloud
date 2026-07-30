import * as React from 'react'
import { EmailLayout, Bullet, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  agentName?: string
  missing?: string[]
  appUrl?: string
}

const OnboardingNudge = ({ brand, agentName, missing, appUrl }: Props) => {
  const items = missing?.length ? missing : ['Finish your profile']
  return (
    <EmailLayout
      brand={brand}
      preview="A few steps left before you're fully set up"
      heading="You're almost set up"
      lead={`${agentName ? `${agentName}, you` : 'You'} have a few onboarding steps still open. They take a couple of minutes and they gate your contracting.`}
      cta={{ label: 'Finish onboarding', href: `${appUrl || 'https://useagentcloud.com'}/onboarding` }}
      note="Already done these? Refresh your onboarding page — it updates as each item clears."
    >
      <Paragraph>Still outstanding:</Paragraph>
      {items.map((item) => (
        <Bullet key={item}>{item}</Bullet>
      ))}
    </EmailLayout>
  )
}

export const template = {
  component: OnboardingNudge,
  subject: "You're almost set up on Agent Cloud",
  displayName: 'Onboarding nudge',
  previewData: {
    agentName: 'Jordan',
    missing: ['Upload your E&O certificate', 'Add your resident license', 'Sign your producer agreement'],
  },
} satisfies TemplateEntry

export default OnboardingNudge
