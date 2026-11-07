import * as React from 'react'
import { EmailLayout, Bullet, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

type Path = 'agent' | 'agency'
interface Props {
  brand?: EmailBrand
  firstName?: string
  path?: Path
  agencyName?: string
  appUrl?: string
}

const origin = (u?: string) => u || 'https://useagentcloud.com'
const hi = (n?: string) => (n ? `${n}, ` : '')

const Welcome = ({ brand, firstName, path = 'agent', appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={path === 'agency' ? 'Your agency build is saved.' : 'Your book of business build is saved.'}
    heading={path === 'agency' ? 'Your agency is under construction' : 'Your book is under construction'}
    lead={`${hi(firstName)}your progress is saved to your account. Pick up on any device, right where you left off.`}
    cta={{ label: 'Continue building', href: `${origin(appUrl)}/start` }}
  >
    <Paragraph>{path === 'agency' ? 'Still ahead for your agency:' : 'Still ahead for your book:'}</Paragraph>
    {(path === 'agency'
      ? ['Brand your agency', 'Size your team and set a production goal', 'Pick your carriers', 'Switch on Licensing, Bankdocs, Release Center and Academy']
      : ['Your licensed states', 'The carriers you write', 'Your monthly production goal', 'Your license and E&O documents']
    ).map((i) => <Bullet key={i}>{i}</Bullet>)}
  </EmailLayout>
)

const Resume = ({ brand, firstName, path = 'agent', appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview="You're a few minutes from done."
    heading={path === 'agency' ? 'Your agency is waiting' : 'Your book is waiting'}
    lead={`${hi(firstName)}you started building ${path === 'agency' ? 'your agency' : 'your book of business'} on Agent Cloud. Everything you entered is saved.`}
    cta={{ label: 'Finish building', href: `${origin(appUrl)}/start` }}
    note="Questions? Reply to this email and Allison will help."
  />
)

const Live = ({ brand, firstName, path = 'agent', agencyName, appUrl }: Props) => (
  <EmailLayout
    brand={brand}
    preview={`${agencyName || 'Your workspace'} is ready.`}
    heading={`${agencyName || (path === 'agency' ? 'Your agency' : 'Your book')} is built`}
    lead={
      path === 'agency'
        ? `${hi(firstName)}your CRM, hierarchy, commission engine and Agency Suite are set up. Next: invite your first agents.`
        : `${hi(firstName)}your CRM, book of business and commission tracking are set up. Next: post your first deal.`
    }
    cta={{ label: 'Open Agent Cloud', href: `${origin(appUrl)}/dashboard` }}
  />
)

const props = { firstName: 'Jordan', path: 'agency' as Path, agencyName: 'Vantage Financial' }

export const welcomeTemplate = {
  component: Welcome,
  subject: (d: Record<string, any>) => (d?.path === 'agency' ? 'Your agency build is saved' : 'Your book of business build is saved'),
  displayName: 'Onboarding welcome',
  previewData: props,
} satisfies TemplateEntry

export const resumeTemplate = {
  component: Resume,
  subject: (d: Record<string, any>) => (d?.path === 'agency' ? 'Finish building your agency' : 'Finish building your book'),
  displayName: 'Onboarding resume',
  previewData: props,
} satisfies TemplateEntry

export const liveTemplate = {
  component: Live,
  subject: (d: Record<string, any>) => `${d?.agencyName || 'Your workspace'} is ready on Agent Cloud`,
  displayName: 'Onboarding live',
  previewData: props,
} satisfies TemplateEntry
