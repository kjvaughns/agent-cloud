import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

/**
 * Shared Agent Cloud email shell.
 *
 * Every template renders through this so branding cannot drift. Table-based,
 * 600px, inline styles only — Tailwind classes do not survive most clients.
 * The body background stays #ffffff so dark-mode clients that invert do not
 * turn the message into an unreadable smear; the premium feel comes from the
 * gold rule, gold CTA and uppercase wordmark rather than a dark canvas.
 *
 * NOTE: the unsubscribe footer is appended by the sending infrastructure.
 * Never add unsubscribe copy or links inside a template.
 */

export const GOLD = '#C9A227'
export const INK = '#0F172A'
export const BODY_TEXT = '#475569'
export const MUTED = '#94A3B8'
export const BORDER = '#E2E8F0'

export interface EmailBrand {
  /** Display name in the wordmark + footer. */
  name: string
  /** Absolute https logo URL. Falls back to the Agent Cloud wordmark. */
  logoUrl?: string | null
  /** Hex accent. Falls back to Agent Cloud gold. */
  accentColor?: string | null
  /** Absolute site URL used by the footer link. */
  siteUrl?: string | null
}

export const DEFAULT_BRAND: EmailBrand = {
  name: 'Agent Cloud',
  logoUrl: null,
  accentColor: GOLD,
  siteUrl: 'https://useagentcloud.com',
}

export interface EmailLayoutProps {
  /** Inbox preview line. Keep it useful — it is read before the body. */
  preview: string
  heading: string
  /** Optional short line under the heading. */
  lead?: string
  brand?: EmailBrand
  cta?: { label: string; href: string }
  /** Small print under the card. */
  note?: string
  children?: React.ReactNode
}

export function EmailLayout({
  preview,
  heading,
  lead,
  brand,
  cta,
  note,
  children,
}: EmailLayoutProps) {
  const b: EmailBrand = { ...DEFAULT_BRAND, ...(brand ?? {}) }
  const accent = b.accentColor || GOLD
  const siteUrl = b.siteUrl || 'https://useagentcloud.com'
  const siteLabel = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...topRule, backgroundColor: accent }} />

          <Section style={header}>
            {b.logoUrl ? (
              // alt text carries the brand when images are blocked
              <Img src={b.logoUrl} alt={b.name} height="32" style={logo} />
            ) : (
              <Text style={wordmark}>{b.name.toUpperCase()}</Text>
            )}
          </Section>

          <Section style={card}>
            <Heading style={h1}>{heading}</Heading>
            {lead ? <Text style={leadStyle}>{lead}</Text> : null}

            {children}

            {cta ? (
              <Section style={buttonWrap}>
                <Button style={{ ...ctaStyle, backgroundColor: accent }} href={cta.href}>
                  {cta.label}
                </Button>
              </Section>
            ) : null}

            {note ? <Text style={fine}>{note}</Text> : null}
          </Section>

          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerBrand}>
              © {new Date().getFullYear()} {b.name} ·{' '}
              <Link href={siteUrl} style={{ ...footerLink, color: accent }}>
                {siteLabel}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/* ---------- shared building blocks used inside `children` ---------- */

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={paragraph}>{children}</Text>
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={sectionHeading}>{children}</Text>
}

export function Bullet({ children }: { children: React.ReactNode }) {
  return <Text style={bullet}>• {children}</Text>
}

/** Label/value rows. Never render sensitive values here — link into the app. */
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Text style={detailRow}>
      <span style={detailLabel}>{label}</span>
      <span style={detailValue}>{value}</span>
    </Text>
  )
}

/* ---------------------------- styles ---------------------------- */

const FONT =
  "'Hanken Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
const DISPLAY_FONT =
  "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"

const main = {
  backgroundColor: '#ffffff',
  fontFamily: FONT,
  color: BODY_TEXT,
  margin: 0,
  padding: '32px 16px',
}
const container = { maxWidth: '600px', margin: '0 auto' }
const topRule = { height: '4px', borderRadius: '2px' }
const header = { padding: '24px 0 8px' }
const logo = { display: 'block' }
const wordmark = {
  fontFamily: DISPLAY_FONT,
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
  fontFamily: DISPLAY_FONT,
  fontSize: '26px',
  lineHeight: '1.25',
  color: INK,
  margin: '0 0 14px',
  fontWeight: 700 as const,
}
const leadStyle = { fontSize: '15px', lineHeight: '1.6', color: BODY_TEXT, margin: '0 0 18px' }
const paragraph = { fontSize: '14px', lineHeight: '1.65', color: BODY_TEXT, margin: '0 0 14px' }
const sectionHeading = {
  fontSize: '12px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: INK,
  fontWeight: 700 as const,
  margin: '18px 0 8px',
}
const bullet = { fontSize: '14px', lineHeight: '1.6', color: BODY_TEXT, margin: '0 0 6px' }
const detailRow = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: BODY_TEXT,
  margin: '0 0 6px',
  borderBottom: `1px solid ${BORDER}`,
  paddingBottom: '6px',
}
const detailLabel = { color: MUTED, display: 'inline-block', minWidth: '150px' }
const detailValue = { color: INK, fontWeight: 600 as const }
const buttonWrap = { textAlign: 'center' as const, padding: '22px 0 6px' }
const ctaStyle = {
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
const footerBrand = { fontSize: '12px', color: MUTED, margin: 0 }
const footerLink = { textDecoration: 'none', fontWeight: 600 as const }
