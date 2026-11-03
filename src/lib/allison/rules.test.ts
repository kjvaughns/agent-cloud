import { describe, expect, it } from "vitest";
import { forcedEscalation, replyDelayMs, SUPPORT_INBOX } from "./rules";

describe("allison rules", () => {
  it("uses the support inbox", () => expect(SUPPORT_INBOX).toBe("support@useagentcloud.com"));
  it("waits 3 to 5 minutes", () => {
    expect(replyDelayMs(0)).toBe(180_000);
    expect(replyDelayMs(0.999999)).toBeLessThanOrEqual(300_000);
  });
  it("hands refunds and discounts to a person", () => {
    expect(forcedEscalation("can I get a refund")).toBe("Refund or billing dispute");
    expect(forcedEscalation("any discount for 50 agents?")).toBe("Pricing negotiation");
    expect(forcedEscalation("how does contracting work?")).toBeNull();
  });
});
