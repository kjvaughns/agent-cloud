import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service — Agent Cloud" }] }),
  component: () => (
    <LegalPage title="Terms of Service" updated="July 2026">
      <p>These terms govern your use of Agent Cloud.</p>

      <h2>What Agent Cloud is — and is not</h2>
      <p>
        Agent Cloud is a <strong>software platform</strong>. We are not an insurance agency, IMO,
        FMO, carrier, or broker. We do not take commission overrides, do not hold your carrier
        contracts, and do not own your clients or your agents. Your hierarchy and your carrier
        relationships remain entirely yours.
      </p>

      <h2>Accounts and roles</h2>
      <p>
        An agency owner is responsible for who they invite and what permissions they grant. Access
        is enforced by role; sensitive fields require explicit permission.
      </p>

      <h2>Subscriptions and billing</h2>
      <ul>
        <li>Plans bill monthly in advance through Stripe.</li>
        <li>The Agency Plan is a flat monthly price covering every agent in the agency. There is no per-seat charge and no cap on active users.</li>
        <li>Nova AI Pro is a separate per-user add-on and is not included in any plan.</li>
      </ul>

      <h2>Cancellation</h2>
      <p>
        You may cancel at any time from the billing portal. Access continues to the end of the
        period you have already paid for. We do not prorate partial months.
      </p>

      <h2>Your data</h2>
      <p>
        You retain all rights to the data you put into Agent Cloud. You can export it at any time.
        We use it to operate the service for you, and for nothing else.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use Agent Cloud to send communications that recipients have not consented to
        receive, to store data you have no right to hold, or to attempt to access another
        agency's workspace.
      </p>

      <h2>Availability</h2>
      <p>
        We work to keep the platform available and secure, but the service is provided as is. Some
        features depend on third parties — for example, carrier systems and payment processing —
        and those dependencies are outside our control.
      </p>

      <h2>Contact</h2>
      <p><strong>hello@useagentcloud.com</strong></p>
    </LegalPage>
  ),
});
