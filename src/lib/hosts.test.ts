import { describe, expect, it } from "vitest";
import { hostRedirectTarget } from "./hosts";

const t = (u: string) => hostRedirectTarget(new URL(u), true);

describe("host split", () => {
  it("forwards portal pages on the main domain to the app subdomain", () => {
    expect(t("https://useagentcloud.com/dashboard?x=1")).toBe("https://app.useagentcloud.com/dashboard?x=1");
    expect(t("https://www.useagentcloud.com/login")).toBe("https://app.useagentcloud.com/login");
  });
  it("keeps the landing page on the main domain", () => {
    expect(t("https://useagentcloud.com/")).toBeNull();
    expect(t("https://useagentcloud.com/api/v1/carriers")).toBeNull();
  });
  it("sends the bare app address to the dashboard", () => {
    expect(t("https://app.useagentcloud.com/")).toBe("https://app.useagentcloud.com/dashboard");
  });
  it("leaves preview and lovable.app alone", () => {
    expect(t("https://agent-cloud.lovable.app/dashboard")).toBeNull();
  });
  it("does nothing while switched off", () => {
    expect(hostRedirectTarget(new URL("https://useagentcloud.com/dashboard"), false)).toBeNull();
  });
});
