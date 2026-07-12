import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface WaitlistConfirmationProps {
  first_name?: string
}

const WaitlistConfirmation = ({ first_name }: WaitlistConfirmationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're on the Agent Cloud waitlist — early access is coming.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={topRule} />
        <Section style={header}>
          <Text style={wordmark}>AGENT CLOUD</Text>
        </Section>

        <Section style={card}>
          <Heading style={h1}>You're on the list</Heading>
          <Text style={lead}>
            {first_name ? `Hey ${first_name} — thanks` : 'Thanks'} for joining the Agent Cloud
            waitlist. We're building the operating system for life insurance agents and agencies,
            and we're rolling out early access in waves.
          </Text>

          <Text style={sectionHeading}>What happens next</Text>
          <Text style={bullet}>• You'll get launch updates and behind-the-scenes previews.</Text>
          <Text style={bullet}>• When your invite is ready, we'll email you a direct sign-in link.</Text>
          <Text style={bullet}>• Waitlist members get founder-tier pricing when we open the doors.</Text>

          <Section style={buttonWrap}>
            <Button style={cta} href="https://useagentcloud.com">
              Visit useagentcloud.com
            </Button>
          </Section>

          <Text style={fine}>
            Have a question or want to bring your whole agency in? Reply to this email — we read
            every one.
          </Text>
        </Section>

        <Hr style={hr} />
        <Section style={footer}>
          <Text style={footerText}>
            You're receiving this because you joined the Agent Cloud waitlist.
          </Text>
          <Text style={footerBrand}>
            © {new Date().getFullYear()} Agent Cloud ·{' '}
            <Link href="https://useagentcloud.com" style={footerLink}>
              useagentcloud.com
            </Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WaitlistConfirmation,
  subject: "You're on the Agent Cloud waitlist",
  displayName: 'Waitlist Confirmation',
  previewData: { first_name: 'Jane' },
} satisfies TemplateEntry

export default WaitlistConfirmation

const GOLD = '#C9A227'
const INK = '#0F172A'
const BODY = '#475569'
const MUTED = '#94A3B8'
const BORDER = '#E2E8F0'

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "Inter, -apple-system, 'Segoe UI', Arial, sans-serif",
  color: BODY,
  margin: 0,
  padding: '32px 16px',
}
const container = { maxWidth: '600px', margin: '0 auto' }
const topRule = { height: '4px', backgroundColor: GOLD, borderRadius: '2px' }
const header = { padding: '24px 0 8px' }
const wordmark = {
  fontFamily: "'Bebas Neue', 'Arial Narrow', Arial, sans-serif",
  fontSize: '24px',
  letterSpacing: '0.18em',
  color: INK,
  margin: 0,
  fontWeight: 700 as const,
}
const card = {
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  padding: '32px',
  backgroundColor: '#ffffff',
  marginTop: '16px',
}
const h1 = {
  fontFamily: "'Bebas Neue', 'Arial Narrow', Arial, sans-serif",
  fontSize: '32px',
  letterSpacing: '0.04em',
  color: INK,
  margin: '0 0 16px',
  fontWeight: 700 as const,
  textTransform: 'uppercase' as const,
}
const lead = { fontSize: '15px', lineHeight: '1.6', color: BODY, margin: '0 0 20px' }
const sectionHeading = {
  fontSize: '13px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: INK,
  fontWeight: 700 as const,
  margin: '4px 0 8px',
}
const bullet = { fontSize: '14px', lineHeight: '1.6', color: BODY, margin: '0 0 6px' }
const buttonWrap = { textAlign: 'center' as const, padding: '20px 0 8px' }
const cta = {
  backgroundColor: GOLD,
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600 as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
  letterSpacing: '0.02em',
}
const fine = { fontSize: '13px', lineHeight: '1.6', color: MUTED, margin: '18px 0 0' }
const hr = { borderColor: BORDER, margin: '24px 0 16px' }
const footer = { padding: '0 8px' }
const footerText = { fontSize: '12px', color: MUTED, margin: '0 0 8px', lineHeight: '1.5' }
const footerBrand = { fontSize: '12px', color: MUTED, margin: 0 }
const footerLink = { color: GOLD, textDecoration: 'none', fontWeight: 600 as const }
