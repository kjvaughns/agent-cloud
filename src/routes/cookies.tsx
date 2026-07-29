import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/cookies")({
  head: () => ({ meta: [{ title: "Cookie Policy — Agent Cloud" }] }),
  component: () => (
    <LegalPage title="Cookie Policy" updated="July 2026">
      <p>Agent Cloud uses a small number of cookies and similar browser storage.</p>

      <h2>Strictly necessary</h2>
      <ul>
        <li><strong>Session</strong> — keeps you signed in. Without it the app cannot work.</li>
        <li><strong>Security</strong> — protects against cross-site request forgery.</li>
      </ul>

      <h2>Preferences</h2>
      <ul>
        <li>Theme, sidebar state, density, and which navigation groups you have collapsed.</li>
        <li>Whether you have dismissed the announcement banner.</li>
      </ul>
      <p>These are stored in your browser's local storage and never leave your device.</p>

      <h2>Analytics</h2>
      <p>
        We measure aggregate usage — which pages are visited and which features are used — to
        decide what to improve. We do not use advertising cookies, and we do not sell or share
        browsing data with advertising networks.
      </p>

      <h2>Managing cookies</h2>
      <p>
        You can clear or block cookies in your browser settings. Blocking the strictly necessary
        cookies will prevent you from signing in.
      </p>

      <h2>Contact</h2>
      <p><strong>hello@useagentcloud.com</strong></p>
    </LegalPage>
  ),
});
