const BASE_URL = process.env.AGENTSYNC_ENV === "sandbox"
  ? "https://api.sandbox.agentsync.io"
  : "https://api.agentsync.io";

export function isConfigured(): boolean {
  return !!(process.env.AGENTSYNC_CLIENT_ID && process.env.AGENTSYNC_CLIENT_SECRET);
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AGENTSYNC_CLIENT_ID!,
      client_secret: process.env.AGENTSYNC_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) throw new Error(`AgentSync token error: ${res.status}`);
  const json = await res.json();
  cachedToken = json.access_token as string;
  tokenExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
  return cachedToken;
}

async function apiGet(path: string, retry = true): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (res.status === 401 && retry) {
    cachedToken = null;
    return apiGet(path, false);
  }

  if (!res.ok) throw new Error(`AgentSync API error ${res.status} on ${path}`);
  return res.json();
}

async function apiPut(path: string, body: unknown): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AgentSync API PUT error ${res.status} on ${path}`);
  return res.json().catch(() => ({}));
}

export async function subscribeNpn(npn: string): Promise<void> {
  await apiPut("/v1/npns", { npn });
}

export async function getLicensesByNpn(npn: string): Promise<any[]> {
  const data = await apiGet(`/v1/producers/${npn}/licenses`);
  const items = Array.isArray(data) ? data : (data?.licenses ?? data?.data ?? []);
  return items.map((l: any) => ({
    state_code: l.state_code ?? l.stateCode ?? l.state,
    license_number: l.license_number ?? l.licenseNumber ?? l.number,
    license_type: l.license_type ?? l.licenseType ?? l.type,
    loas: l.loas ?? l.lines_of_authority ?? [],
    issued_date: l.issued_date ?? l.issuedDate ?? l.issue_date,
    expires_date: l.expires_date ?? l.expiresDate ?? l.expiration_date,
    is_resident: l.is_resident ?? l.isResident ?? false,
    status: l.status ?? "active",
  }));
}

export async function getAppointmentsByNpn(npn: string): Promise<any[]> {
  const data = await apiGet(`/v1/producers/${npn}/appointments`);
  const items = Array.isArray(data) ? data : (data?.appointments ?? data?.data ?? []);
  return items.map((a: any) => ({
    carrier_name: a.carrier_name ?? a.carrierName ?? a.company_name,
    carrier_fein: a.carrier_fein ?? a.fein,
    state_code: a.state_code ?? a.stateCode ?? a.state,
    status: a.status ?? "active",
    loa: a.loa ?? a.line_of_authority,
  }));
}

export async function getRegulatoryActionsByNpn(npn: string): Promise<any[]> {
  const data = await apiGet(`/v1/producers/${npn}/regulatory-actions`);
  return Array.isArray(data) ? data : (data?.actions ?? data?.data ?? []);
}

export interface SyncResult {
  licenses: ReturnType<typeof getLicensesByNpn> extends Promise<infer T> ? T : never;
  appointments: ReturnType<typeof getAppointmentsByNpn> extends Promise<infer T> ? T : never;
  regulatoryActions: any[];
}

export async function syncProducerByNpn(npn: string): Promise<{
  licenses: any[];
  appointments: any[];
  regulatoryActions: any[];
} | null> {
  if (!isConfigured()) return null;

  await subscribeNpn(npn);

  const [licenses, appointments, regulatoryActions] = await Promise.all([
    getLicensesByNpn(npn),
    getAppointmentsByNpn(npn),
    getRegulatoryActionsByNpn(npn),
  ]);

  return { licenses, appointments, regulatoryActions };
}

export { isConfigured as agentSyncIsConfigured };
