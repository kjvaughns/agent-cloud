/**
 * SuranceBay SureLC API Service
 *
 * REST API for managing producer contracting requests, profile data, and SSO.
 * All functions return null gracefully when credentials are not configured.
 *
 * Docs: https://surelc.surancebay.com/swagger-ui/index.html?urls.primaryName=agency
 */

const BASE = "https://surelc.surancebay.com/sbweb/api";

export function isConfigured(): boolean {
  return !!(process.env.SURELC_API_TOKEN && process.env.SURELC_AGENCY_ID);
}

async function slcGet(path: string): Promise<any | null> {
  if (!isConfigured()) return null;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "X-API-Key": process.env.SURELC_API_TOKEN!,
      "Accept":    "application/json",
    },
  });
  if (!res.ok) {
    console.error(`SureLC GET ${path} failed: ${res.status}`);
    return null;
  }
  return res.json();
}

async function slcPost(path: string, body: any): Promise<any | null> {
  if (!isConfigured()) return null;
  const res = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: {
      "X-API-Key":    process.env.SURELC_API_TOKEN!,
      "Content-Type": "application/json",
      "Accept":       "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`SureLC POST ${path} failed: ${res.status} — ${err.slice(0, 200)}`);
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : { ok: true };
}

// ── Producer Management ───────────────────────────────────────────────────

/**
 * Look up a producer in SureLC by email.
 * Returns the SureLC producer ID if found, null otherwise.
 */
export async function findProducerByEmail(email: string): Promise<string | null> {
  const data = await slcGet(
    `/agencies/${process.env.SURELC_AGENCY_ID}/producers?email=${encodeURIComponent(email)}`
  );
  if (!data) return null;
  const producers = Array.isArray(data) ? data : (data.producers ?? data.items ?? []);
  const match = producers.find(
    (p: any) => (p.email ?? p.loginId ?? "").toLowerCase() === email.toLowerCase()
  );
  return match?.id ?? match?.producerId ?? null;
}

/**
 * Create a new producer in SureLC.
 * Returns the new SureLC producer ID.
 */
export async function createProducer(agent: {
  firstName: string;
  lastName:  string;
  email:     string;
  phone?:    string;
  npn?:      string;
}): Promise<string | null> {
  const data = await slcPost(
    `/agencies/${process.env.SURELC_AGENCY_ID}/producers`,
    {
      firstName: agent.firstName,
      lastName:  agent.lastName,
      email:     agent.email,
      phone:     agent.phone ?? null,
      npn:       agent.npn ?? null,
    }
  );
  return data?.id ?? data?.producerId ?? null;
}

/**
 * Generate an SSO URL so an agent can log directly into SureLC from Agent Cloud.
 */
export async function generateSsoUrl(surelcProducerId: string): Promise<string | null> {
  if (!isConfigured()) return null;
  const data = await slcPost(
    `/agencies/${process.env.SURELC_AGENCY_ID}/producers/${surelcProducerId}/sso`,
    { redirectUrl: `${process.env.VITE_APP_URL ?? "https://app.agentcloud.com"}/contracting` }
  );
  return data?.ssoUrl ?? data?.url ?? null;
}

// ── Contracting Requests ──────────────────────────────────────────────────

/**
 * Create a contracting request in SureLC for a specific carrier.
 */
export async function createContractingRequest(
  surelcProducerId:  string,
  surelcCarrierCode: string,
  notes?:            string
): Promise<{ requestId: string | null; success: boolean }> {
  const data = await slcPost(
    `/agencies/${process.env.SURELC_AGENCY_ID}/producers/${surelcProducerId}/contracting-requests`,
    {
      carrierCode: surelcCarrierCode,
      requestType: "Contract",
      notes:       notes ?? null,
    }
  );
  if (!data) return { requestId: null, success: false };
  return { requestId: data.id ?? data.requestId ?? null, success: true };
}

/**
 * Get the current status of a contracting request from SureLC.
 * Maps SureLC stages to Agent Cloud contract_status enum values.
 */
export async function getContractingRequestStatus(
  surelcProducerId: string,
  surelcRequestId:  string
): Promise<{
  stage:            string;
  agentCloudStatus: "requested" | "submitted" | "processing" | "active" | "issue";
  writingNumber:    string | null;
} | null> {
  const data = await slcGet(
    `/agencies/${process.env.SURELC_AGENCY_ID}/producers/${surelcProducerId}/contracting-requests/${surelcRequestId}`
  );
  if (!data) return null;

  const stage         = data.stage ?? data.status ?? "";
  const writingNumber = data.writingNumber ?? data.agentCode ?? data.writing_number ?? null;

  let agentCloudStatus: "requested" | "submitted" | "processing" | "active" | "issue" = "requested";
  const stageLower = stage.toLowerCase();
  if (stageLower.includes("producer"))  agentCloudStatus = "requested";
  if (stageLower.includes("bga"))       agentCloudStatus = "submitted";
  if (stageLower.includes("carrier"))   agentCloudStatus = "processing";
  if (stageLower.includes("completed")) agentCloudStatus = "active";
  if (stageLower.includes("discard"))   agentCloudStatus = "issue";

  return { stage, agentCloudStatus, writingNumber };
}

/**
 * Get ALL contracting requests for a producer — used for bulk status sync.
 */
export async function getAllContractingRequests(surelcProducerId: string): Promise<any[] | null> {
  const data = await slcGet(
    `/agencies/${process.env.SURELC_AGENCY_ID}/producers/${surelcProducerId}/contracting-requests`
  );
  if (!data) return null;
  return Array.isArray(data) ? data : (data.requests ?? data.items ?? []);
}

/**
 * Get producers with contracting requests at a given stage.
 * Used by admin Work Inbox.
 */
export async function getWorkInbox(
  stage: "AtProducer" | "AtBGA" | "AtCarrier" | "Completed"
): Promise<any[] | null> {
  const data = await slcGet(
    `/agencies/${process.env.SURELC_AGENCY_ID}/contracting-requests?stage=${stage}`
  );
  if (!data) return null;
  return Array.isArray(data) ? data : (data.requests ?? data.items ?? []);
}

export { isConfigured as sureLcIsConfigured };
