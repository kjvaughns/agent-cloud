/**
 * A workbook is not one document. It is several, filed in one envelope.
 *
 * The router used to classify a whole file at once, so a migration export with
 * four tabs — a roster, a client list, a book of business and a note history —
 * was given a single kind, and three of the four sheets were thrown away. That
 * is the shape people actually leave a CRM with, so it has to be the shape
 * Import reads.
 *
 * Two jobs live here and nowhere else:
 *
 *   **Per-sheet routing.** Each tab is classified on its own headers, with the
 *   tab name treated the way an uploader's note is treated — a hint, never an
 *   override.
 *
 *   **The joins between sheets.** A policy row says "Marion Ragland" and a note
 *   row says "Marion Ragland"; the client sheet is where that person's phone
 *   number is. Matching them here, while the whole workbook is in hand, is the
 *   only moment it is cheap — after the client rows are proposals it would take
 *   a database round trip per row and would create a second Marion Ragland for
 *   every sheet that mentioned her.
 *
 * Everything is deterministic and free. No model is consulted.
 */

import { readDocument, carrierFromLabel, type SheetBlock } from "./sheet-shape";
import { resolveKind, KIND_LABEL, type ImportKind } from "./import-router";
import {
  clientsFromBlock, rosterFromBlock, contractingRowsFromBlock, notesFromBlock,
  type ExtractedClient, type ExtractedNote,
} from "./import-extract-rows";
import { certificatesFromBlock, debtFromBlock, statementLinesFromBlock } from "./import-carrier-reports";
import type { CarrierRecord } from "./carrier-match";

/** One stream of rows to reconcile, and what it came from. */
export type ImportStream = {
  kind: ImportKind;
  rows: Record<string, any>[];
  /** "All Clients + Book of Business + Client Notes" — what the person will see. */
  sheetLabel: string;
};

export type SheetRead = {
  label: string | null;
  kind: ImportKind;
  reason: string;
  rowCount: number;
  subtotalsSkipped: number;
};

export type WorkbookPlan = {
  sheets: SheetRead[];
  streams: ImportStream[];
  /** Notes matched onto a client from another sheet. */
  notesJoined: number;
  /** Notes whose person was nowhere in the workbook — imported on a name alone. */
  notesOrphaned: number;
  /** Policy rows folded into a client that another sheet described. */
  policiesJoined: number;
};

function normName(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function nameKey(first: string | null | undefined, last: string | null | undefined): string {
  return `${normName(first)}|${normName(last)}`;
}

function splitFullName(whole: string): { first: string | null; last: string | null } {
  const s = whole.trim();
  if (!s) return { first: null, last: null };
  if (s.includes(",")) {
    const [l, f] = s.split(",");
    return { first: f?.trim() || null, last: l?.trim() || null };
  }
  const parts = s.split(/\s+/);
  const first = parts.shift() || null;
  return { first, last: parts.join(" ") || null };
}

function digits10(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "").slice(-10);
}

/** Merge b into a, keeping what a already has. Policies and notes accumulate. */
function mergeClient(a: ExtractedClient, b: ExtractedClient): void {
  for (const [k, v] of Object.entries(b)) {
    if (k === "policies" || k === "notes") continue;
    if (v === null || v === undefined || v === "") continue;
    if (a[k] === null || a[k] === undefined || a[k] === "") a[k] = v;
  }
  /*
    Policies merge by number rather than stacking.

    The clients tab carries a policy number and a face amount; the book tab
    carries the same number with the carrier, the premium and the effective
    date. Appending both gave the client two policies — one of them a stub with
    no carrier — which then counted twice in production. Same number means same
    policy, and the fuller row fills in the blanks of the thinner one.
  */
  if (Array.isArray(b.policies)) {
    const merged = [...(a.policies ?? [])];
    const keyOf = (p: any) => String(p?.policy_number ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    for (const inc of b.policies) {
      const k = keyOf(inc);
      const hit = k ? merged.find((m) => keyOf(m) === k) : undefined;
      if (!hit) { merged.push(inc); continue; }
      for (const [pk, pv] of Object.entries(inc)) {
        if (pv === null || pv === undefined || pv === "") continue;
        if (hit[pk] === null || hit[pk] === undefined || hit[pk] === "") hit[pk] = pv;
      }
    }
    a.policies = merged;
  }
  if (Array.isArray((b as any).notes)) {
    (a as any).notes = [...((a as any).notes ?? []), ...(b as any).notes];
  }
}

/**
 * Read every sheet, route each one, and join what belongs together.
 *
 * `note` is the uploader's description. It is only allowed to influence a
 * single-sheet document: on a four-tab workbook "my book of business" is a
 * description of the file, not of the roster tab, and letting it decide there
 * is how a roster ends up proposed as clients.
 */
export function planWorkbook(
  text: string,
  carriers: CarrierRecord[] = [],
  note: string | null = null,
): WorkbookPlan {
  const blocks = readDocument(text);
  const single = blocks.length <= 1;

  const sheets: SheetRead[] = [];
  const clientBlocks: SheetBlock[] = [];
  const noteBlocks: SheetBlock[] = [];
  const rosterBlocks: SheetBlock[] = [];
  const writingBlocks: SheetBlock[] = [];
  const licenseBlocks: SheetBlock[] = [];
  const certBlocks: SheetBlock[] = [];
  const debtBlocks: SheetBlock[] = [];
  const statementBlocks: SheetBlock[] = [];
  const otherKinds: ImportKind[] = [];

  for (const b of blocks) {
    // The tab name goes in as if it were the uploader's note: "Client Notes"
    // and "Team Roster" are people telling us what the sheet is, in the one
    // place a spreadsheet has to say it.
    const hint = [b.label, single ? note : null].filter(Boolean).join(" ") || null;
    const guess = resolveKind(b.headers, hint);

    sheets.push({
      label: b.label,
      kind: guess.kind,
      reason: guess.reason,
      rowCount: b.rows.length,
      subtotalsSkipped: b.skipped.subtotal,
    });

    switch (guess.kind) {
      case "book_of_business": clientBlocks.push(b); break;
      case "client_notes": noteBlocks.push(b); break;
      case "agent_roster": rosterBlocks.push(b); break;
      case "writing_numbers": writingBlocks.push(b); break;
      case "state_licenses": licenseBlocks.push(b); break;
      // A certificate listing is a book of business written by the carrier, so
      // it joins the client stream rather than becoming a parallel one: the
      // policies in it are the same policies the CRM export describes, and
      // keeping them apart is how the same sale gets counted twice.
      case "policy_status_report": certBlocks.push(b); break;
      case "agent_debt": debtBlocks.push(b); break;
      case "commission_statement": statementBlocks.push(b); break;
      default: otherKinds.push(guess.kind);
    }
  }

  // ── Clients, merged across every sheet that describes them ────────────────
  const byKey = new Map<string, ExtractedClient>();
  const byPhone = new Map<string, ExtractedClient>();
  const contributing: string[] = [];
  let policiesJoined = 0;

  /*
    Carrier certificate tabs are read as clients too.

    A certificate row names the insured and the policy, so it produces the same
    record shape a book-of-business row does — which means the merge below joins
    a carrier's copy of a policy onto the client the CRM export described,
    instead of creating a second Sheryl Smith holding a duplicate certificate.
  */
  const clientLike: { block: SheetBlock; rows: ExtractedClient[] }[] = [
    ...clientBlocks.map((b) => ({ block: b, rows: clientsFromBlock(b, carriers) })),
    ...certBlocks.map((b) => ({
      block: b,
      rows: certificatesFromBlock(
        b,
        // The tab or file name is the only place a carrier report says whose
        // report it is, and `carrierFromLabel` returns nothing rather than a
        // guess — a wrongly stamped carrier is written across every row.
        carrierFromLabel(b.label ?? note, carriers)?.cleaned ?? null,
      ) as ExtractedClient[],
    })),
  ];

  for (const { block: b, rows } of clientLike) {
    if (rows.length) contributing.push(b.label ?? "sheet");
    for (const r of rows) {
      const phone = digits10(r.phone);
      const key = nameKey(r.first_name, r.last_name);
      const existing =
        (phone && byPhone.get(phone)) ||
        (key !== "|" ? byKey.get(key) : undefined);

      if (existing) {
        if (Array.isArray(r.policies)) policiesJoined += r.policies.length;
        mergeClient(existing, r);
        if (phone && !byPhone.has(phone)) byPhone.set(phone, existing);
        continue;
      }
      if (key !== "|") byKey.set(key, r);
      if (phone) byPhone.set(phone, r);
      if (key === "|" && !phone) continue;
    }
  }

  // ── Notes, onto the person they name ──────────────────────────────────────
  let notesJoined = 0;
  let notesOrphaned = 0;
  const allNotes: ExtractedNote[] = noteBlocks.flatMap((b) => notesFromBlock(b));

  for (const n of allNotes) {
    const { first, last } = splitFullName(n.client_name);
    const key = nameKey(first, last);
    let target = byKey.get(key);

    if (!target) {
      // Nobody in the workbook by that name. The note is still worth keeping —
      // a name and a note is a client record, thin but real — so it becomes
      // one, and gets counted so the summary can say how many.
      target = { first_name: first, last_name: last };
      byKey.set(key, target);
      notesOrphaned++;
    } else {
      notesJoined++;
    }

    (target as any).notes = [
      ...(((target as any).notes ?? []) as any[]),
      { content: n.content, note_type: n.note_type, created_at: n.created_at, author: n.author },
    ];
  }

  if (noteBlocks.length) contributing.push("Client Notes");

  const streams: ImportStream[] = [];
  const clientRows = [...byKey.values()].filter(
    (r) => r.first_name || r.last_name || r.phone || r.email,
  );
  if (clientRows.length) {
    streams.push({
      kind: "book_of_business",
      rows: clientRows,
      sheetLabel: [...new Set(contributing)].join(" + ") || "Clients",
    });
  }

  for (const b of rosterBlocks) {
    const rows = rosterFromBlock(b);
    if (rows.length) streams.push({ kind: "agent_roster", rows, sheetLabel: b.label ?? "Roster" });
  }
  for (const b of writingBlocks) {
    const rows = contractingRowsFromBlock(b, "writing_numbers");
    if (rows.length) streams.push({ kind: "writing_numbers", rows, sheetLabel: b.label ?? "Writing numbers" });
  }
  for (const b of licenseBlocks) {
    const rows = contractingRowsFromBlock(b, "licenses");
    if (rows.length) streams.push({ kind: "state_licenses", rows, sheetLabel: b.label ?? "Licenses" });
  }

  for (const b of debtBlocks) {
    const rows = debtFromBlock(b);
    if (rows.length) streams.push({ kind: "agent_debt", rows, sheetLabel: b.label ?? "Agent debt" });
  }
  /*
    A statement is one record, not a row per line.

    Its lines only mean anything under the header they were paid against — a
    period, a carrier and a stated total — so the whole tab becomes a single
    proposal carrying its lines, and approving it creates one statement the
    existing reconciliation screen can work through.
  */
  for (const b of statementBlocks) {
    const lines = statementLinesFromBlock(b);
    if (!lines.length) continue;
    streams.push({
      kind: "commission_statement",
      rows: [{
        carrier_name: carrierFromLabel(b.label ?? note, carriers)?.cleaned ?? null,
        file_name: b.label ?? null,
        lines,
      }],
      sheetLabel: b.label ?? "Commission statement",
    });
  }

  return { sheets, streams, notesJoined, notesOrphaned, policiesJoined };
}

/** "All Clients → book of business, 532 rows" — for the summary on the file's row. */
export function describePlan(plan: WorkbookPlan): string {
  const named = plan.sheets
    .map((s) => `${s.label ?? "Sheet"} → ${KIND_LABEL[s.kind].toLowerCase()} (${s.rowCount} rows)`)
    .join("; ");
  const joins: string[] = [];
  if (plan.policiesJoined) joins.push(`${plan.policiesJoined} policies matched to a client`);
  if (plan.notesJoined) joins.push(`${plan.notesJoined} notes matched to a client`);
  if (plan.notesOrphaned) joins.push(`${plan.notesOrphaned} notes on a name we hadn't seen`);
  return joins.length ? `${named}. ${joins.join(", ")}.` : named;
}
