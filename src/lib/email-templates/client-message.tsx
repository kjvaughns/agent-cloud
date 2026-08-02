import * as React from 'react'
import { EmailLayout, Paragraph, type EmailBrand } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  brand?: EmailBrand
  /** The agent's own words, already rendered from their template. */
  body?: string
  subject?: string
  agentName?: string
  agentEmail?: string
  agentPhone?: string
  agencyName?: string
}

/**
 * A message from an agent to their client.
 *
 * Every other template in this directory writes *to an agent* about something
 * the platform did. This one is the opposite: the agency is the sender, a
 * consumer is the recipient, and the words are the agent's rather than ours.
 * That changes what the email has to be.
 *
 * So: no Agent Cloud voice, no product call-to-action, and the agent's name
 * and contact details carry the signature — because the person receiving this
 * has a relationship with their agent, not with us. If they want to reply,
 * reaching a human is the only useful outcome.
 *
 * The body arrives as plain text and is split on blank lines rather than
 * interpolated as HTML. Agents write these; nothing they type should be able
 * to become markup in somebody else's inbox.
 */
const ClientMessage = ({
  brand, body, subject, agentName, agentEmail, agentPhone, agencyName,
}: Props) => {
  const paragraphs = String(body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  const contact = [agentEmail, agentPhone].filter(Boolean).join(' · ')

  return (
    <EmailLayout
      brand={brand}
      preview={subject || `A note from ${agentName || 'your agent'}`}
      heading={subject || `A note from ${agentName || 'your agent'}`}
    >
      {paragraphs.length > 0
        ? paragraphs.map((p, i) => <Paragraph key={i}>{p}</Paragraph>)
        : null}

      {agentName ? (
        <Paragraph>
          {agentName}
          {agencyName ? `, ${agencyName}` : ''}
          {contact ? ` — ${contact}` : ''}
        </Paragraph>
      ) : null}
    </EmailLayout>
  )
}

export const template = {
  component: ClientMessage,
  subject: (d: Record<string, any>) =>
    d?.subject || `A note from ${d?.agentName || 'your agent'}`,
  displayName: 'Message to a client',
  previewData: {
    subject: 'Happy birthday, Marcus!',
    body: 'Just wanted to wish you a happy birthday.\n\nHope you have a great one — and as always, give me a shout if anything about your coverage needs a look.',
    agentName: 'Dana Whitfield',
    agentEmail: 'dana@apexfinancial.com',
    agentPhone: '(555) 010-2288',
    agencyName: 'APEX Financial',
  },
} satisfies TemplateEntry

export default ClientMessage
