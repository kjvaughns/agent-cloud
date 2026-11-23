import { describe, it, expect, beforeAll } from "vitest";
import { normalizeSsn, encryptSsn, decryptSsn } from "./ssn-crypto.server";

beforeAll(() => { process.env["SSN_ENCRYPTION_KEY"] = "test-key-test-key-test-key-123456"; });

describe("SSN", () => {
  it("accepts a 9-digit SSN with dashes", () => expect(normalizeSsn("123-45-6789")).toBe("123456789"));
  it("rejects wrong lengths and invalid areas", () => {
    expect(normalizeSsn("12345678")).toBeNull();
    expect(normalizeSsn("000-12-3456")).toBeNull();
    expect(normalizeSsn("666-12-3456")).toBeNull();
  });
  it("round-trips and never stores plaintext", async () => {
    const c = await encryptSsn("123456789");
    expect(c).not.toContain("123456789");
    expect(await decryptSsn(c)).toBe("123456789");
  });
});
