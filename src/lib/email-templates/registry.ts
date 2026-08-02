import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

// --- Auth templates (rendered by the auth webhook; registered here for preview) ---
import SignupEmail from './signup'
import MagicLinkEmail from './magic-link'
import RecoveryEmail from './recovery'
import InviteEmail from './invite'
import EmailChangeEmail from './email-change'
import ReauthenticationEmail from './reauthentication'

// --- Event templates ---
import { template as waitlistConfirmation } from './waitlist-confirmation'
import { template as agentInvited } from './agent-invited'
import { template as inviteAccepted } from './invite-accepted'
import { template as onboardingNudge } from './onboarding-nudge'
import { template as carrierAdded } from './carrier-added'
import { template as contractStatusChanged } from './contract-status-changed'
import { template as transferRequest } from './transfer-request'
import { template as taskAssigned } from './task-assigned'
import { template as commissionPosted } from './commission-posted'
import { template as statementReconciled } from './statement-reconciled'
import { template as paymentFailed } from './payment-failed'
import { template as subscriptionChanged } from './subscription-changed'
import { template as novaProChanged } from './nova-pro-changed'
import { template as policyPlaced } from './policy-placed'
import { template as policyAtRisk } from './policy-at-risk'
import { template as importComplete } from './import-complete'
import { template as caseDesignUpdated } from './case-design-updated'
import { template as retentionCaseAssigned } from './retention-case-assigned'
import { template as newLead } from './new-lead'
import { template as demoRequest } from './demo-request'
import { template as dailyDigest } from './daily-digest'
import { template as clientMessage } from './client-message'

const AUTH_PREVIEW = {
  token: '123456',
  confirmationUrl: 'https://useagentcloud.com/auth/confirm?token=example',
  siteUrl: 'https://useagentcloud.com',
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  // Auth
  signup: {
    component: SignupEmail,
    subject: 'Confirm your Agent Cloud account',
    displayName: 'Auth — Signup confirmation',
    previewData: AUTH_PREVIEW,
  },
  magiclink: {
    component: MagicLinkEmail,
    subject: 'Your Agent Cloud sign-in link',
    displayName: 'Auth — Magic link',
    previewData: AUTH_PREVIEW,
  },
  recovery: {
    component: RecoveryEmail,
    subject: 'Reset your Agent Cloud password',
    displayName: 'Auth — Password reset',
    previewData: AUTH_PREVIEW,
  },
  invite: {
    component: InviteEmail,
    subject: "You've been invited to Agent Cloud",
    displayName: 'Auth — Invite',
    previewData: AUTH_PREVIEW,
  },
  email_change: {
    component: EmailChangeEmail,
    subject: 'Confirm your new email address',
    displayName: 'Auth — Email change',
    previewData: { ...AUTH_PREVIEW, newEmail: 'new@example.com' },
  },
  reauthentication: {
    component: ReauthenticationEmail,
    subject: 'Your Agent Cloud verification code',
    displayName: 'Auth — Reauthentication',
    previewData: AUTH_PREVIEW,
  },

  // Marketing site / intake
  'waitlist-confirmation': waitlistConfirmation,
  'demo-request': demoRequest,

  // Onboarding & contracting
  'agent-invited': agentInvited,
  'invite-accepted': inviteAccepted,
  'onboarding-nudge': onboardingNudge,
  'carrier-added': carrierAdded,
  'contract-status-changed': contractStatusChanged,
  'transfer-request': transferRequest,

  // Work
  'task-assigned': taskAssigned,

  // Money
  'commission-posted': commissionPosted,
  'statement-reconciled': statementReconciled,
  'payment-failed': paymentFailed,
  'subscription-changed': subscriptionChanged,
  'nova-pro-changed': novaProChanged,

  // Book of business
  'policy-placed': policyPlaced,
  'policy-at-risk': policyAtRisk,
  'retention-case-assigned': retentionCaseAssigned,
  'case-design-updated': caseDesignUpdated,
  'import-complete': importComplete,

  // Sales
  'new-lead': newLead,

  // Rollup
  'daily-digest': dailyDigest,
  client_message: clientMessage,
}

export type TemplateName = keyof typeof TEMPLATES
