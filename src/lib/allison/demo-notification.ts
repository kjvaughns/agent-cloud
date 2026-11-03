import { SUPPORT_INBOX } from "./rules";

export const DEMO_NOTICE_MARKER = "Demo request delivered to support inbox";

export function demoNotification(name: string | null, email: string, details: string) {
  return {
    to: SUPPORT_INBOX,
    subject: `New demo request — ${name || "New agency"}`,
    text: `New Agent Cloud demo request\n\nName: ${name || "Not provided"}\nEmail: ${email}\n\n${details}\n\nAllison will follow up with the requester.`,
  };
}