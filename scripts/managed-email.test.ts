import { afterEach, describe, expect, test } from "bun:test";
import { sendTemplateEmail } from "../src/lib/email-templates/send-email";
import { recordEmailOutcome } from "../src/lib/email/events.server";

const originalFetch = globalThis.fetch;
const originalKey = process.env.LOVABLE_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.LOVABLE_API_KEY;
  else process.env.LOVABLE_API_KEY = originalKey;
});

describe("managed template sends", () => {
  test("preserves verified sender, support Reply-To and event idempotency", async () => {
    process.env.LOVABLE_API_KEY = "test-key";
    let payload: Record<string, any> = {};
    let headers = new Headers();
    globalThis.fetch = (async (_url, options) => {
      payload = JSON.parse(String(options?.body));
      headers = new Headers(options?.headers);
      return Response.json({ success: true });
    }) as typeof fetch;
    expect(await sendTemplateEmail("demo-confirmation", "requester@example.com", {
      idempotencyKey: "demo-confirmation:request-1", replyTo: "support@useagentcloud.com",
      templateData: { first_name: "Test" },
    })).toEqual({ sent: true });
    expect(payload.to).toBe("requester@example.com");
    expect(payload.from).toBe("Agent Cloud <noreply@notify.useagentcloud.com>");
    expect(payload.sender_domain).toBe("notify.useagentcloud.com");
    expect(payload.reply_to).toBe("support@useagentcloud.com");
    expect(headers.get("Idempotency-Key")).toBe("demo-confirmation:request-1");
    expect(payload.unsubscribe_token).toBeUndefined();
  });
  test("suppression is a normal managed outcome", async () => {
    process.env.LOVABLE_API_KEY = "test-key";
    globalThis.fetch = (async () => Response.json({ code: "recipient_suppressed", message: "Suppressed" }, { status: 403 })) as typeof fetch;
    expect(await sendTemplateEmail("demo-confirmation", "requester@example.com")).toEqual({ sent: false, reason: "recipient_suppressed" });
  });
  test("rate limits throw with retry delay rather than immediately retrying", async () => {
    process.env.LOVABLE_API_KEY = "test-key";
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return Response.json({ code: "rate_limited", message: "Wait" }, { status: 429, headers: { "Retry-After": "17" } });
    }) as typeof fetch;
    await expect(sendTemplateEmail("demo-confirmation", "requester@example.com")).rejects.toMatchObject({ status: 429, retryAfterSeconds: 17 });
    expect(requests).toBe(1);
  });
});

function fakeDatabase(fail?: string) {
  const logs = new Map<string, any>();
  const suppressions: any[] = [];
  return {
    logs, suppressions,
    from(table: string) {
      return {
        select() { return { eq(_field: string, id: string) { return { async maybeSingle() { return { data: logs.get(id), error: fail === "lookup" ? { message: "lookup failed" } : null }; } }; } }; },
        async upsert(row: any) { suppressions.push(row); return { error: fail === "suppression" ? { message: "suppression failed" } : null }; },
        async insert(row: any) { if (fail === "log") return { error: { code: "500", message: "log failed" } }; logs.set(row.id, row); return { error: null }; },
      };
    },
  };
}

describe("kept terminal-event data contract", () => {
  for (const [reason, status, message] of [
    ["bounce", "bounced", "Permanent bounce — email address is invalid or rejected"],
    ["complaint", "complained", "Spam complaint — recipient marked email as spam"],
    ["unsubscribe", "suppressed", "Recipient unsubscribed"],
  ] as const) {
    test(`${reason} preserves exact stored values and deduplicates redeliveries`, async () => {
      const database = fakeDatabase();
      const event = { event_id: `event-${reason}`, data: { recipient: "PERSON@example.com", message_id: "message-1" } };
      await recordEmailOutcome(database, event, reason);
      await recordEmailOutcome(database, event, reason);
      expect(database.suppressions).toEqual([{ email: "person@example.com", reason, metadata: null }]);
      expect(database.logs.size).toBe(1);
      expect([...database.logs.values()][0]).toMatchObject({ status, error_message: message, template_name: "system", metadata: null, message_id: "message-1" });
    });
  }
  for (const stage of ["lookup", "suppression", "log"]) {
    test(`throws on ${stage} failure so webhook delivery retries`, async () => {
      await expect(recordEmailOutcome(fakeDatabase(stage), { event_id: "failure", data: { recipient: "person@example.com", message_id: "message-1" } }, "bounce")).rejects.toThrow(`${stage} failed`);
    });
  }
});