/**
 * Getting an agency's data out of wherever it is now.
 *
 * ── Why this is a feature and not a support article ─────────────────────────
 *
 * Every competitor charges $500–2,000 for migration as a professional-services
 * line item. AgencyBloc's own migration guide tells buyers that the most
 * important question to ask a vendor is *"how easy is it to get my data back
 * out?"* — which is a question worth answering loudly, and worth answering
 * about ourselves too. Hence the export note at the bottom of this file: the
 * same page that helps somebody leave another system tells them how to leave
 * this one.
 *
 * ── The two paths ──────────────────────────────────────────────────────────
 *
 * Where a system has a real export, the honest answer is a click-path: open
 * this menu, tick these boxes, download the CSV. Nothing clever required, and
 * the quirks are worth naming because each of them costs an afternoon when
 * discovered at import time rather than export time.
 *
 * Where the export is poor or absent — which is most of the older agency
 * platforms — the Cowork path applies: the agency drives their own browser
 * session, Claude reads what is on screen, and a workbook comes out. Nothing
 * is handed over. That distinction matters: the previous version of this
 * product asked agents for their *password* to the old system, which is the
 * thing this replaces.
 */

/** The canonical workbook the importer reads. Sheet names are exact. */
export const TEMPLATE_SHEETS: { sheet: string; columns: string[]; note: string }[] = [
  {
    sheet: "Team Roster",
    columns: ["Agent Name", "Email", "Location", "Status", "Depth", "Contracts", "Date Joined", "Last Active"],
    note: "One row per downline agent. Agent Name and Email are both required — a row missing either is skipped.",
  },
  {
    sheet: "All Clients",
    columns: [
      "First Name", "Last Name", "Phone", "Email", "Date of Birth", "Street Address",
      "City", "State", "ZIP", "Born In", "Stage", "Smoker", "Monthly Income",
      "Employment", "Pitch Carrier", "Face Amount", "Policy #", "Medical Notes",
      "Reminder Notes", "Callback Date", "Agent",
    ],
    note: "One row per person. First Name or Last Name must be present. Agent is the producer who owns the client.",
  },
  {
    sheet: "Book of Business",
    columns: [
      "Client Name", "Carrier", "Product", "Policy #", "Status",
      "Monthly Premium", "Annual Premium", "Effective Date", "Agent",
    ],
    note: "One row per policy. Client Name must match the name in All Clients so the two link up.",
  },
  {
    sheet: "Client Notes",
    columns: ["Client Name", "Note Content", "Note Type", "Author", "Date"],
    note: "One row per note. Client Name and Note Content are both required.",
  },
];

export type MigrationSource = {
  id: string;
  name: string;
  /** "export" — a real export exists. "cowork" — it does not, or it is unusable. */
  path: "export" | "cowork";
  /** Click-path, for systems with a real export. */
  steps?: string[];
  /** Things that cost an afternoon if discovered at import time. */
  quirks?: string[];
};

export const MIGRATION_SOURCES: MigrationSource[] = [
  {
    id: "agencybloc",
    name: "AgencyBloc",
    path: "export",
    steps: [
      "Open Reports → Report Builder.",
      "Build one report per object: Individuals, Policies, and Activities.",
      "Add every available column — it is easier to ignore a column here than to go back for it.",
      "Export each as CSV.",
    ],
    quirks: [
      "Policies and Individuals export separately and are joined on the individual's name, so do not rename anybody between the two exports.",
      "Custom fields are not included in the standard report — add them explicitly in the builder.",
    ],
  },
  {
    id: "radiusbob",
    name: "Radius Bob",
    path: "export",
    steps: [
      "Open Reports → Saved Reports.",
      "Run the Leads and Policies reports.",
      "Export each to CSV.",
    ],
    quirks: [
      "Dates must be MM/DD/YYYY on the way out; other formats come back ambiguous and the importer will flag them for review.",
      "Phone numbers export with a +1 prefix — the importer strips it, but check nothing else is prefixed.",
    ],
  },
  {
    id: "redtail",
    name: "Redtail CRM",
    path: "export",
    steps: [
      "Open Contacts → search with no filters to select everything.",
      "Use the bulk action Export to CSV.",
      "Repeat for Activities if you want the note history.",
    ],
    quirks: [
      "The contact export does not include policies. Those come from the Insurance tab and export separately.",
    ],
  },
  {
    id: "ezlynx",
    name: "EZLynx",
    path: "export",
    steps: [
      "Open Management → Reports.",
      "Run the Book of Business report across all lines.",
      "Export to Excel.",
    ],
    quirks: [
      "The export is one row per policy with the client repeated. The importer explodes those back into a client and its policies — do not try to de-duplicate it yourself first.",
    ],
  },
  {
    id: "hawksoft",
    name: "HawkSoft",
    path: "cowork",
    quirks: [
      "HawkSoft's export is a proprietary backup format rather than a spreadsheet, and getting a usable CSV generally means asking their support team.",
    ],
  },
  {
    id: "betteragency",
    name: "Better Agency",
    path: "cowork",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    path: "export",
    steps: [
      "Open Setup → Data → Data Export.",
      "Choose Export Now and include Accounts, Contacts and any custom policy object.",
      "Download the ZIP when the email arrives.",
    ],
    quirks: [
      "The export arrives as one CSV per object with Salesforce IDs rather than names. Keep the ID columns — they are what lets the policies be matched back to the right people.",
    ],
  },
  {
    id: "zoho",
    name: "Zoho CRM",
    path: "export",
    steps: [
      "Open Setup → Data Administration → Export Data.",
      "Select each module you use and export.",
    ],
  },
  {
    id: "agentlink",
    name: "AgentLink / Insuracloud",
    path: "cowork",
    quirks: [
      "There is no self-serve export. The Cowork path below produces exactly the workbook this importer expects.",
    ],
  },
  {
    id: "spreadsheets",
    name: "Spreadsheets I already have",
    path: "export",
    steps: [
      "Drop them straight onto the import page — no reformatting needed.",
      "The importer reads the headers and shows you the mapping before anything saves.",
    ],
    quirks: [
      "If a policy number looks like 1.23457E+14, the sheet has been treated as a number somewhere. The importer reconstructs those, but re-exporting with the column formatted as Text is cleaner.",
    ],
  },
  {
    id: "other",
    name: "Something else",
    path: "cowork",
  },
];

/**
 * The prompt somebody pastes into Claude with Cowork turned on.
 *
 * Written as an instruction to Claude rather than a description of one,
 * because it is going to be pasted verbatim by somebody who should not have to
 * edit it. The exact sheet and column names are inlined from
 * `TEMPLATE_SHEETS`, so this cannot drift from what the importer reads — which
 * is the failure mode that would make the whole flow useless and be invisible
 * until an agency tried it.
 */
export function coworkPrompt(source: MigrationSource): string {
  const schema = TEMPLATE_SHEETS.map(
    (s) => `- Sheet "${s.sheet}": ${s.columns.join(", ")}`,
  ).join("\n");

  return `I am migrating my insurance agency's data from ${source.name} into Agent Cloud.

I am already logged into ${source.name} in my Chrome browser. Please use Cowork to read my account and pull out everything below. Do not ask me for my password — drive the session I am already signed into.

Please extract:
- Every client: name, phone, email, date of birth, full address, and which producer owns them.
- Every policy: the client it belongs to, carrier, product, policy number, status, monthly and annual premium, and effective date.
- Every producer on my team: name, email, location, status, and when they joined.
- Every note or activity logged against a client, with its author and date.

Then produce a single Excel workbook with exactly these sheets and column headers — the names must match exactly, because an importer reads them:

${schema}

Rules that matter for this data:
- Format policy numbers and any ID column as TEXT, not numbers. Excel turns long policy numbers into scientific notation and strips leading zeros, and both destroy the identifier.
- Write dates as YYYY-MM-DD. Anything else is ambiguous between US and European ordering.
- Keep "Client Name" spelled identically in the Book of Business and All Clients sheets — that string is what links a policy to its client.
- Do not de-duplicate or summarise. Subtotal rows, blank rows and duplicates are fine; the importer handles them and shows me everything before it saves.
- If a field is missing, leave the cell empty rather than writing "N/A" or "unknown".

When it is done, give me the .xlsx file to download.`;
}

/** A blank template as CSV, one file per sheet. */
export function templateCsv(sheet: (typeof TEMPLATE_SHEETS)[number]): string {
  // Quoted because several headers contain a `#` or a space, and an unquoted
  // header row is exactly the kind of thing that survives testing and breaks
  // on somebody's locale.
  return sheet.columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(",") + "\n";
}
