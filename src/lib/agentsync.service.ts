// AgentSync producer-license sync service.
// Used by adminSyncAgentByNpn in admin.functions.ts. Returns null when the
// integration is not configured, which the caller surfaces as
// "AgentSync is not configured on this server."

export type AgentSyncLicense = {
  state_code: string;
  license_number?: string | null;
  license_type?: string | null;
  loas?: (string | { name?: string; loa?: string })[] | null;
  issued_date?: string | null;
  expires_date?: string | null;
  is_resident?: boolean | null;
};

export type AgentSyncResult = {
  npn: string;
  licenses: AgentSyncLicense[];
};

export async function syncProducerByNpn(npn: string): Promise<AgentSyncResult | null> {
  const apiKey = process.env.AGENTSYNC_API_KEY;
  const apiUrl = process.env.AGENTSYNC_API_URL;
  if (!apiKey || !apiUrl) return null;

  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/producers/${encodeURIComponent(npn)}/licenses`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`AgentSync request failed (${res.status})`);
  }
  const body = await res.json();
  const licenses: AgentSyncLicense[] = Array.isArray(body?.licenses) ? body.licenses : [];
  return { npn, licenses };
}
