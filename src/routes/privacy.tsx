import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Agent Cloud" }] }),
  component: () => (
    <LegalPage title="Privacy Policy" updated="July 2026">
      <p>
        Agent Cloud provides software that insurance agencies use to run their operations. This
        policy explains what we collect, why, and what you control.
      </p>

      <h2>Who controls the data</h2>
      <p>
        When an agency uses Agent Cloud, <strong>the agency is the controller</strong> of the client,
        policy and agent records in its workspace. We process that data on the agency's behalf and
        under its instructions. We do not sell it, rent it, or use it to market to the agency's
        clients or agents.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data</strong> — name, email, phone, role, and agency membership.</li>
        <li><strong>Workspace data</strong> — the clients, policies, commissions, documents and tasks your agency enters or imports.</li>
        <li><strong>Billing data</strong> — handled by Stripe. We store a customer and subscription identifier; we never see full card numbers.</li>
        <li><strong>Usage data</strong> — pages visited and features used, to understand what needs improving.</li>
      </ul>

      <h2>Sensitive information</h2>
      <p>
        Some agency workflows involve identity and banking details. Those fields are masked in the
        interface and restricted by role — an agency owner decides who can see them, and access is
        recorded in the agency's audit log.
      </p>

      <h2>Your data is exportable</h2>
      <p>
        An agency can export its clients, policies, commissions, agent roster and retention history
        at any time. We do not hold data hostage to keep a subscription.
      </p>

      <h2>Subprocessors</h2>
      <ul>
        <li><strong>Supabase</strong> — database, authentication and file storage.</li>
        <li><strong>Stripe</strong> — payments and subscription billing.</li>
        <li>Email delivery and AI processing providers, used only to operate features you turn on.</li>
      </ul>

      <h2>Retention and deletion</h2>
      <p>
        We keep workspace data while the account is active. On cancellation, an agency can export
        its data; we then delete or anonymize it on request, except where we are required to keep
        records for legal or accounting reasons.
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: <strong>hello@useagentcloud.com</strong></p>
    </LegalPage>
  ),
});
