## Goal

Replace the generic black/white React Email scaffolds with cohesive, branded Agent Cloud emails that match the app's gold-on-light identity.

## Brand tokens (email-safe hex)

- Gold primary: `#C9A227` (CTA, accent rules, brand mark)
- Gold hover/darker: `#A8861E`
- Ink (headings): `#0F172A`
- Body text: `#475569`
- Muted text/footer: `#94A3B8`
- Hairline border: `#E2E8F0`
- Soft surface: `#F8FAFC`
- Body background: `#FFFFFF` (required by email guidelines, even though app is light/neutral)
- Heading font: `'Bebas Neue', 'Arial Narrow', Arial, sans-serif` (web-safe fallback since Bebas isn't installed on most mail clients — falls back gracefully)
- Body font: `'Inter', -apple-system, 'Segoe UI', Arial, sans-serif`

## Shared layout (applied to all 6 templates)

```text
┌──────────────────────────────────────┐
│  [gold rule]                          │
│  AGENT CLOUD          (wordmark, ink) │
├──────────────────────────────────────┤
│  HEADING (Bebas, uppercase, ink)      │
│  Body copy (Inter, slate)             │
│                                       │
│  [  Gold CTA Button  ]                │
│                                       │
│  Fallback link: paste this URL …      │
├──────────────────────────────────────┤
│  Tiny footer — security note,         │
│  © Agent Cloud · useagentcloud.com    │
└──────────────────────────────────────┘
```

- 600px max container, centered, 32px padding.
- Gold 4px top rule + wordmark header on every email.
- Single gold CTA: `#C9A227` bg, white text, 8px radius, 14px/600 weight, 14px×24px padding.
- Always include the raw URL below the button as a fallback (many clients strip buttons).
- Footer: 12px muted text, security disclaimer + brand line + link to `https://useagentcloud.com`.

## Per-template content

| Template | Heading | Body framing | CTA label |
|---|---|---|---|
| `signup.tsx` | "Confirm your email" | Welcome to Agent Cloud, verify to activate your account | Verify email |
| `magic-link.tsx` | "Your sign-in link" | One-tap sign-in, expires in 1 hour | Sign in to Agent Cloud |
| `recovery.tsx` | "Reset your password" | Password reset requested, ignore if not you | Reset password |
| `invite.tsx` | "You've been invited" | Join your team on Agent Cloud | Accept invite |
| `email-change.tsx` | "Confirm your new email" | Verify the new address on your account | Confirm new email |
| `reauthentication.tsx` | "Verification code" | Display 6-digit code prominently in a bordered card, no button | (code only) |

## Implementation notes (technical)

- Edit only the 6 files in `src/lib/email-templates/*.tsx`.
- Keep each file's exported `template` object, props interface, and `previewData` intact — only restyle and restructure JSX.
- Use inline style constants (React Email convention); no external CSS, no `<style>` tags, no `dangerouslySetInnerHTML`.
- Use `Section`, `Hr`, and `Img` components from `@react-email/components` where helpful.
- For `reauthentication.tsx`, render the token in a 28px monospace, letter-spaced card instead of a button.
- Do not touch the unsubscribe footer (system-appended), the webhook route, the preview route, or the registry.
- No new packages, no schema changes.

## Out of scope

- Logo image asset (text wordmark only for now — avoids hosting/CDN dependency in emails).
- Marketing/app emails (auth templates only).
- DNS / domain verification (separate task).
