import { hostRedirectTarget } from "../src/lib/hosts";
const t = (u: string) => hostRedirectTarget(new URL(u), true);
const cases: [string | null, string | null, string][] = [
  [t("https://useagentcloud.com/dashboard?x=1"), "https://app.useagentcloud.com/dashboard?x=1", "portal page forwards"],
  [t("https://www.useagentcloud.com/login"), "https://app.useagentcloud.com/login", "www login forwards"],
  [t("https://useagentcloud.com/"), null, "landing stays"],
  [t("https://useagentcloud.com/api/v1/carriers"), null, "api stays"],
  [t("https://app.useagentcloud.com/"), "https://app.useagentcloud.com/dashboard", "app root to dashboard"],
  [t("https://agent-cloud.lovable.app/dashboard"), null, "lovable.app untouched"],
  [hostRedirectTarget(new URL("https://useagentcloud.com/dashboard"), false), null, "off switch"],
];
let fail = 0;
for (const [got, want, name] of cases) { const ok = got === want; if (!ok) fail++; console.log(ok ? "PASS" : "FAIL", name, got); }
process.exit(fail ? 1 : 0);
