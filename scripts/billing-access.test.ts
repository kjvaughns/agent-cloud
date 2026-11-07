import { describe, expect, test } from "bun:test";
import { computeAccess, isAgencyOnlyPath } from "../src/lib/billing/access";

const NOW = Date.parse("2026-11-07T12:00:00Z");
const future = "2026-12-07T12:00:00Z";
const past = "2026-10-01T12:00:00Z";
const base = { hasWorkspace: true, comped: false, isPlatformAdmin: false, planType: "agency", ownerId: "owner", rows: [] as any[], now: NOW };

describe("hard paywall", () => {
  test("never-paid agency is fully locked", () => {
    expect(computeAccess(base)).toMatchObject({ mode: "locked", reason: "never_paid" });
  });
  test("never-paid solo workspace is fully locked", () => {
    expect(computeAccess({ ...base, planType: "solo" })).toMatchObject({ mode: "locked", reason: "never_paid" });
  });
  test("a failed first payment still counts as never paid", () => {
    const rows = [{ kind: "agency", status: "incomplete_expired", current_period_end: null }];
    expect(computeAccess({ ...base, rows }).mode).toBe("locked");
  });
  test("a Nova-only purchase does not unlock the workspace", () => {
    const rows = [{ kind: "nova_seats", status: "active", current_period_end: future }];
    expect(computeAccess({ ...base, rows }).mode).toBe("locked");
  });
  test("signed in with no workspace is locked", () => {
    expect(computeAccess({ ...base, hasWorkspace: false }).mode).toBe("locked");
  });
  test("comped agencies keep full access", () => {
    expect(computeAccess({ ...base, comped: true }).mode).toBe("full");
  });
  test("platform admin keeps full access", () => {
    expect(computeAccess({ ...base, isPlatformAdmin: true }).mode).toBe("full");
  });
  test("active agency plan gives full access", () => {
    const rows = [{ kind: "agency", status: "active", current_period_end: future }];
    expect(computeAccess({ ...base, rows })).toMatchObject({ mode: "full", reason: "subscribed" });
  });
  test("failed card while retrying keeps full access", () => {
    const rows = [{ kind: "agency", status: "past_due", current_period_end: future }];
    expect(computeAccess({ ...base, rows })).toMatchObject({ mode: "full", reason: "past_due" });
  });
  test("retries ended after paying before is view-only", () => {
    const rows = [{ kind: "agency", status: "unpaid", current_period_end: past }];
    expect(computeAccess({ ...base, rows })).toMatchObject({ mode: "read_only", reason: "lapsed" });
  });
  test("canceled and past the paid period is view-only", () => {
    const rows = [{ kind: "solo", status: "canceled", current_period_end: past, user_id: "owner" }];
    expect(computeAccess({ ...base, planType: "solo", rows }).mode).toBe("read_only");
  });
});

describe("solo vs agency plan", () => {
  test("solo workspace on a solo plan is the solo tier", () => {
    const rows = [{ kind: "solo", status: "active", current_period_end: future, user_id: "owner" }];
    expect(computeAccess({ ...base, planType: "solo", rows })).toMatchObject({ mode: "full", plan: "solo" });
  });
  test("paid Agency plan upgrades a solo workspace immediately", () => {
    const rows = [{ kind: "agency", status: "active", current_period_end: future }];
    expect(computeAccess({ ...base, planType: "solo", rows }).plan).toBe("agency");
  });
  test("inviting agents and team pages are agency-only", () => {
    expect(isAgencyOnlyPath("/contracting/invite")).toBe(true);
    expect(isAgencyOnlyPath("/team")).toBe(true);
    expect(isAgencyOnlyPath("/contracting-ops/requests")).toBe(true);
    expect(isAgencyOnlyPath("/contracting")).toBe(false);
    expect(isAgencyOnlyPath("/teammates")).toBe(false);
  });
});
