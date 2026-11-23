// AES-GCM encryption for Social Security numbers. Key lives only in the
// SSN_ENCRYPTION_KEY server secret; ciphertext is stored as "v2:<iv>:<data>".
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key() {
  const raw = process.env["SSN_ENCRYPTION_KEY"];
  if (!raw) throw new Error("SSN storage is not configured");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function normalizeSsn(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (d.length !== 9 || /^0{3}|^666|^9/.test(d) || d.slice(3, 5) === "00" || d.slice(5) === "0000") return null;
  return d;
}

export async function encryptSsn(ssn: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(ssn));
  return `v2:${b64(iv)}:${b64(ct)}`;
}

export async function decryptSsn(stored: string): Promise<string | null> {
  if (!stored.startsWith("v2:")) return null;
  const [, iv, ct] = stored.split(":");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, await key(), unb64(ct!));
  return new TextDecoder().decode(pt);
}
