import * as XLSX from "xlsx";

export interface ParsedExport {
  summary: {
    title: string;
    exportDate: string;
    source: string;
    totalAgents: number;
    totalDeals: number;
    totalAnnualPremium: number;
  };
  teamRoster: RosterAgent[];
  bookOfBusiness: BookPolicy[];
  allClients: ClientRecord[];
  clientNotes: ClientNote[];
  errors: string[];
}

export interface RosterAgent {
  name: string;
  email: string;
  status: "ACTIVE" | "INCOMPLETE";
  location: string;
  depth: string;
  contractsRatio: string;
  upline: string;
  dateJoined: string;
  lastActive: string;
}

export interface BookPolicy {
  clientName: string;
  clientFirstName: string;
  clientLastName: string;
  carrier: string;
  product: string;
  policyNumber: string;
  status: string;
  monthlyPremium: number;
  annualPremium: number;
  effectiveDate: string;
  postedDate: string;
  agentName: string;
}

export interface ClientRecord {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  stage: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  bornIn: string;
  smoker: boolean;
  monthlyIncome: string;
  employment: string;
  pitchCarrier: string;
  faceAmount: string;
  policyNumber: string;
  medicalNotes: string;
  reminderNotes: string;
  callbackDate: string;
}

export interface ClientNote {
  clientName: string;
  agentlinkClientId: string;
  date: string;
  author: string;
  noteType: string;
  content: string;
}

function parseMoney(val: string): number {
  if (!val || val === "—") return 0;
  return parseFloat(val.replace(/[$,]/g, "")) || 0;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = (fullName ?? "").trim().split(" ");
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return { first, last };
}

function mapStage(raw: string): string {
  const r = (raw ?? "").toLowerCase();
  if (r.includes("sold")) return "sold";
  if (r.includes("almost")) return "almost_there";
  if (r.includes("callback")) return "callback";
  return "new";
}

export async function parseAgentLinkXLS(file: File): Promise<ParsedExport> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const errors: string[] = [];

  const result: ParsedExport = {
    summary: { title: "", exportDate: "", source: "", totalAgents: 0, totalDeals: 0, totalAnnualPremium: 0 },
    teamRoster: [],
    bookOfBusiness: [],
    allClients: [],
    clientNotes: [],
    errors,
  };

  // ── Summary Sheet ──────────────────────────────────────────
  try {
    const ws = wb.Sheets["Summary"] ?? wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    result.summary.title = rows[0]?.[0] ?? "";
    for (const row of rows) {
      const key = String(row[0] ?? "").toLowerCase();
      const val = String(row[1] ?? "");
      if (key.includes("export date")) result.summary.exportDate = val;
      if (key.includes("source")) result.summary.source = val;
      if (key.includes("total agent")) result.summary.totalAgents = parseInt(val) || 0;
      if (key.includes("total deal")) result.summary.totalDeals = parseInt(val) || 0;
      if (key.includes("total annual")) result.summary.totalAnnualPremium = parseMoney(val);
    }
  } catch (e: any) {
    errors.push(`Summary sheet error: ${e.message}`);
  }

  // ── Team Roster ────────────────────────────────────────────
  try {
    const ws = wb.Sheets["Team Roster"] ?? wb.Sheets[wb.SheetNames[1]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    // Row 0 = title, Row 1 = headers, last row = totals — skip both ends
    for (let i = 2; i < rows.length - 1; i++) {
      const r = rows[i];
      const name = String(r[0] ?? "").trim();
      if (!name || name.toLowerCase().startsWith("total")) continue;
      result.teamRoster.push({
        name,
        email: String(r[1] ?? "").trim(),
        status: String(r[2] ?? "").trim() === "ACTIVE" ? "ACTIVE" : "INCOMPLETE",
        location: String(r[3] ?? "").trim(),
        depth: String(r[4] ?? "L1").trim(),
        contractsRatio: String(r[5] ?? "0/0").trim(),
        upline: String(r[6] ?? "").trim(),
        dateJoined: String(r[7] ?? "").trim(),
        lastActive: String(r[8] ?? "").trim(),
      });
    }
  } catch (e: any) {
    errors.push(`Team Roster sheet error: ${e.message}`);
  }

  // ── Book of Business ───────────────────────────────────────
  try {
    const ws = wb.Sheets["Book of Business"] ?? wb.Sheets[wb.SheetNames[2]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    // Row 0 = title, Row 1 = headers
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      const clientName = String(r[0] ?? "").trim();
      if (!clientName) continue;
      const { first, last } = splitName(clientName);
      const statusRaw = String(r[4] ?? "").trim();
      result.bookOfBusiness.push({
        clientName,
        clientFirstName: first,
        clientLastName: last,
        carrier: String(r[1] ?? "").trim(),
        product: String(r[2] ?? "").trim(),
        policyNumber: String(r[3] ?? "").trim(),
        status: statusRaw === "—" ? "" : statusRaw,
        monthlyPremium: parseMoney(String(r[5] ?? "")),
        annualPremium: parseMoney(String(r[6] ?? "")),
        effectiveDate: String(r[7] ?? "").trim(),
        postedDate: String(r[8] ?? "").trim(),
        agentName: String(r[9] ?? "").trim(),
      });
    }
  } catch (e: any) {
    errors.push(`Book of Business sheet error: ${e.message}`);
  }

  // ── All Clients ────────────────────────────────────────────
  try {
    const ws = wb.Sheets["All Clients"] ?? wb.Sheets[wb.SheetNames[3]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    // Row 0 = title, Row 1 = headers — detect columns dynamically
    const headers = (rows[1] ?? []).map((h: any) => String(h ?? "").trim().toLowerCase());
    const col = (name: string) => headers.findIndex((h: string) => h.includes(name));

    const firstNameCol = col("first name");
    const lastNameCol = col("last name");
    const phoneCol = col("phone");
    const emailCol = col("email");
    const dobCol = col("date of birth");
    const stageCol = col("stage");
    const streetCol = col("street address");
    const cityCol = col("city");
    const stateCol = col("state");
    const zipCol = col("zip");
    const bornCol = col("born");
    const smokerCol = col("smoker");
    const incomeCol = col("monthly income");
    const employCol = col("employment");
    const pitchCol = col("pitch carrier");
    const faceCol = col("face amount");
    const polNumCol = col("policy #");
    const medicalCol = col("medical notes");
    const reminderCol = col("reminder notes");
    const callbackCol = col("callback date");

    const g = (row: any[], c: number) => (c >= 0 ? String(row[c] ?? "").trim() : "");

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      const firstName = g(r, firstNameCol);
      if (!firstName) continue;
      result.allClients.push({
        firstName,
        lastName: g(r, lastNameCol),
        phone: g(r, phoneCol),
        email: g(r, emailCol),
        dateOfBirth: g(r, dobCol),
        stage: mapStage(g(r, stageCol)),
        streetAddress: g(r, streetCol),
        city: g(r, cityCol),
        state: g(r, stateCol),
        zip: g(r, zipCol),
        bornIn: g(r, bornCol),
        smoker: g(r, smokerCol).toLowerCase() === "yes",
        monthlyIncome: g(r, incomeCol),
        employment: g(r, employCol),
        pitchCarrier: g(r, pitchCol),
        faceAmount: g(r, faceCol),
        policyNumber: g(r, polNumCol),
        medicalNotes: g(r, medicalCol),
        reminderNotes: g(r, reminderCol),
        callbackDate: g(r, callbackCol),
      });
    }
  } catch (e: any) {
    errors.push(`All Clients sheet error: ${e.message}`);
  }

  // ── Client Notes ───────────────────────────────────────────
  try {
    const ws = wb.Sheets["Client Notes"] ?? wb.Sheets[wb.SheetNames[4]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      const clientName = String(r[0] ?? "").trim();
      if (!clientName) continue;
      result.clientNotes.push({
        clientName,
        agentlinkClientId: String(r[1] ?? "").trim(),
        date: String(r[2] ?? "").trim(),
        author: String(r[3] ?? "").trim(),
        noteType: String(r[4] ?? "general").trim(),
        content: String(r[5] ?? "").trim(),
      });
    }
  } catch (e: any) {
    errors.push(`Client Notes sheet error: ${e.message}`);
  }

  return result;
}
