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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={topRule} />
        <Section style={header}>
          <Text style={wordmark}>AGENT CLOUD</Text>
          
        </Section>

        <Section style={card}>
          <Heading style={h1}>You've been invited</Heading>
          <Text style={lead}>
            You've been invited to join{' '}
            <Link href={siteUrl || 'https://useagentcloud.com'} style={inlineLink}>
              <strong>{siteName}</strong>
            </Link>
            . Accept your invitation to create your account and join your team's pipeline.
          </Text>

          <Section style={buttonWrap}>
            <Button style={cta} href={confirmationUrl}>
              Accept invite
            </Button>
          </Section>

          <Text style={fallbackLabel}>Button not working? Paste this link:</Text>
          <Text style={fallbackUrl}>{confirmationUrl}</Text>
        </Section>

        <Hr style={hr} />
        <Section style={footer}>
          <Text style={footerText}>
            If you weren't expecting this invitation, you can safely ignore this email.
          </Text>
          <Text style={footerBrand}>
            © {new Date().getFullYear()} Agent Cloud ·{' '}
            <Link href={siteUrl || 'https://useagentcloud.com'} style={footerLink}>
              useagentcloud.com
            </Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const GOLD = '#C9A227'
const INK = '#0F172A'
const BODY = '#475569'
const MUTED = '#94A3B8'
const BORDER = '#E2E8F0'
const SURFACE = '#F8FAFC'

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
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  fontSize: '24px',
  letterSpacing: '0.18em',
  color: INK,
  margin: 0,
  fontWeight: 700 as const,
}
const tagline = { fontSize: '12px', color: MUTED, margin: '4px 0 0', letterSpacing: '0.04em' }
const card = {
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  padding: '32px',
  backgroundColor: '#ffffff',
  marginTop: '16px',
}
const h1 = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  fontSize: '32px',
  letterSpacing: '0.04em',
  color: INK,
  margin: '0 0 16px',
  fontWeight: 700 as const,
  textTransform: 'uppercase' as const,
}
const lead = { fontSize: '15px', lineHeight: '1.6', color: BODY, margin: '0 0 24px' }
const inlineLink = { color: INK, fontWeight: 600 as const, textDecoration: 'underline' }
const buttonWrap = { textAlign: 'center' as const, padding: '8px 0 20px' }
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
const fallbackLabel = { fontSize: '12px', color: MUTED, margin: '12px 0 4px' }
const fallbackUrl = {
  fontSize: '12px',
  color: BODY,
  wordBreak: 'break-all' as const,
  backgroundColor: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  padding: '10px 12px',
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
const hr = { borderColor: BORDER, margin: '24px 0 16px' }
const footer = { padding: '0 8px' }
const footerText = { fontSize: '12px', color: MUTED, margin: '0 0 8px', lineHeight: '1.5' }
const footerBrand = { fontSize: '12px', color: MUTED, margin: 0 }
const footerLink = { color: GOLD, textDecoration: 'none', fontWeight: 600 as const }
