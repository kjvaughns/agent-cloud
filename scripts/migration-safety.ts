/**
 * Which code would break if it shipped before its migration.
 *
 *   npx esbuild scripts/migration-safety.ts --bundle --platform=node \
 *     --format=esm --outfile=.migsafe.mjs && node .migsafe.mjs
 *
 * Code reaches production before a migration is applied. In that window a
 * select naming a column that does not exist yet fails the *whole* query —
 * PostgREST answers 42703 and the handler throws — and an insert into a table
 * that does not exist yet does the same. Three live outages came out of that
 * gap in one afternoon, and nothing in this repository would have caught any
 * of them.
 *
 * This does not prove a reference is safe; it cannot. It finds every place
 * the code reaches for something the database does not have yet and makes you
 * say, once, why each one survives. The reasons in REVIEWED are the point.
 *
 * Run it after adding a migration, and before merging anything that reads
 * what that migration adds.
 *
 * Known blind spots, so nobody reads a clean run as a proof:
 *
 *   - `.from(someVariable)` — a column check needs to know which table the
 *     select is against, and a dynamic table name cannot be resolved here.
 *     resources-admin.functions.ts does this; those paths sit behind
 *     assertMayManage, which fails closed, but the script is not what
 *     established that.
 *   - A select built by string concatenation rather than written inline.
 *   - A migration that builds its DDL dynamically. `20260805130000` adds
 *     `is_sample` to eleven tables inside `execute format(...)`, and the parser
 *     below reads literal `alter table` statements only, so it sees none of
 *     them. Code that reads `is_sample` before that migration lands will not be
 *     flagged here.
 *   - Anything reached through a database function rather than from here.
 *   - Only tables, columns and functions are tracked. A pending migration that
 *     widens a CHECK constraint or adds an RLS policy is invisible here, and
 *     writing a newly-permitted value before it is applied fails at runtime
 *     with 23514 or 42501. `src/lib/writing-numbers.ts` is the current case:
 *     it treats both codes as "not yet applied" and falls back rather than
 *     surfacing an error. A clean run is not evidence that it does.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

// The repository root. Deliberately cwd rather than a path relative to this
// file: esbuild has to emit its bundle inside the repo for node_modules to
// resolve, so the output sits at the root and `../` from it is wrong.
const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SRC = join(ROOT, "src");
const PENDING_FILE = join(MIGRATIONS, "PENDING.md");

// ── What the database already has ───────────────────────────────────────────

type Applied = { versions: Set<string>; source: string };

/**
 * Ask the database, if we can reach it.
 *
 * `list_applied_migrations` already exists and already backs the
 * /admin/migrations page, so this is the same answer that page shows rather
 * than a second opinion about it.
 */
async function appliedFromDatabase(): Promise<Applied | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(`${url}/rest/v1/rpc/list_applied_migrations`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) {
      console.error(`  ! list_applied_migrations returned ${res.status}; falling back`);
      return null;
    }
    const rows = (await res.json()) as { version: string }[];
    return { versions: new Set(rows.map((r) => r.version)), source: "the live database" };
  } catch (e: any) {
    console.error(`  ! could not reach Supabase (${e?.message ?? e}); falling back`);
    return null;
  }
}

/**
 * Migrations PENDING.md still lists but the live schema already has.
 *
 * `supabase/migrations/` is write-protected in this workspace, so a stale line
 * in PENDING.md cannot be deleted by hand. Rather than let the fallback report
 * applied work as pending — which is the exact failure this script exists to
 * prevent — anything verified against the live schema is recorded here.
 *
 * Verified 6 Aug 2026 by looking for each one's distinctive object:
 * `producer_notes`, `carrier_aliases`, `ai_message_log`, `nova_feature_usage`,
 * `upsell_events`, `user_onboarding_state`, `policies.premium_mode` and
 * `clients.annual_income` all exist.
 */
const VERIFIED_APPLIED = new Set([
  "20260803120000_producer-notes.sql",
  "20260805100000_drop-scrape-credentials.sql",
  "20260805110000_revoke-seeded-founder-admin.sql",
  "20260805120000_profile-completeness-and-pii.sql",
  "20260805130000_sample-data-flag.sql",
  "20260805140000_demo-org.sql",
  "20260805150000_book-of-business-sample-flag.sql",
  "20260806100000_user-onboarding-state.sql",
  "20260806110000_carrier-aliases.sql",
  "20260806120000_ai-message-log.sql",
  "20260806130000_nova-usage-and-upsells.sql",
  "20260806230000_self-activation-gate.sql",
  // Applied as a private bucket plus its policies — this workspace refuses
  // public buckets, so the `insert into storage.buckets` line went in with
  // `public = false` and `src/lib/org-branding.ts` reads through a signed URL.
  "20260807100000_org-branding-bucket.sql",
  // Applied 14 Aug 2026, verified against the live schema:
  // org_contracting_settings.overridden_fields, agency_relationships,
  // imo_org_ids() plus the two owner visibility columns on
  // organization_settings, the PII-free agent_completion(), and
  // social_security on the client_banking.payment_method CHECK all exist.
  // PENDING.md is write-protected in this workspace, so its stale lines for
  // these five are cleared here instead.
  "20260814140000_contracting-settings-inheritance.sql",
  "20260814150000_agency-relationships.sql",
  "20260814160000_imo-scope.sql",
  "20260814170000_completeness-without-pii.sql",
  "20260814180000_social-security-payment-method.sql",
]);

/**
 * Otherwise the tracked list. Deliberately noisy about being the fallback: a
 * stale manifest passing silently would be this script's own version of the
 * bug it exists to catch.
 */
function appliedFromManifest(all: string[]): Applied {
  if (!existsSync(PENDING_FILE)) {
    console.error("  ! no PENDING.md and no database — assuming everything is applied.");
    return { versions: new Set(all.map(versionOf)), source: "nothing (assumed all applied)" };
  }
  const pending = new Set(
    readFileSync(PENDING_FILE, "utf8")
      .split("\n")
      .map((l) =>
        l
          .trim()
          .replace(/^[-*]\s*/, "")
          .replace(/^`|`$/g, ""),
      )
      .filter((l) => l.endsWith(".sql"))
      .filter((l) => !VERIFIED_APPLIED.has(l)),
  );
  return {
    versions: new Set(all.filter((f) => !pending.has(f)).map(versionOf)),
    source: "supabase/migrations/PENDING.md, minus what was verified applied",
  };
}

const versionOf = (file: string) => file.split("_")[0];

// ── What each migration introduces ──────────────────────────────────────────

/** Columns are `table.column`, never a bare name — see parse(). */
type Objects = { tables: Set<string>; columns: Set<string>; functions: Set<string> };

function parse(sql: string): Objects {
  const grab = (re: RegExp) => {
    const out = new Set<string>();
    for (const m of sql.matchAll(re)) out.add(m[m.length - 1].toLowerCase());
    return out;
  };

  // Columns have to carry their table. `organization_id` is pending on
  // handbook_sections and long-standing on support_tickets; a bare name would
  // let the second mask the first, and a false negative here is exactly the
  // failure this script exists to prevent.
  const columns = new Set<string>();
  for (const stmt of sql.matchAll(
    /alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)([\s\S]*?);/gi,
  )) {
    const table = stmt[1].toLowerCase();
    for (const col of stmt[2].matchAll(
      /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi,
    )) {
      columns.add(`${table}.${col[1].toLowerCase()}`);
    }
    // A rename introduces the new name just as surely as an ADD does. The
    // first version of this script only looked for `add column`, so a rename
    // sailed straight past it — found by shipping one.
    for (const m of stmt[2].matchAll(
      /rename\s+column\s+([a-z_][a-z0-9_]*)\s+to\s+([a-z_][a-z0-9_]*)/gi,
    )) {
      columns.add(`${table}.${m[2].toLowerCase()}`);
    }
  }

  return {
    tables: grab(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi),
    columns,
    functions: grab(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi),
  };
}

// ── Where the code reaches for them ─────────────────────────────────────────

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(e.name) && !p.endsWith("integrations/supabase/types.ts")) out.push(p);
  }
  return out;
}

type Hit = { object: string; kind: string; file: string; line: number; text: string };

/** The nearest `.from("table")` at or above this line, within a few lines. */
function tableAbove(lines: string[], i: number): string | null {
  for (let j = i; j >= Math.max(0, i - 5); j--) {
    const m = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/.exec(lines[j]);
    if (m) return m[1];
  }
  return null;
}

function findHits(missing: Objects): Hit[] {
  const hits: Hit[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      const at = { file: rel, line: i + 1, text: text.trim().slice(0, 110) };
      for (const t of missing.tables) {
        if (text.includes(`from("${t}")`) || text.includes(`from('${t}')`)) {
          hits.push({ object: t, kind: "table", ...at });
        }
      }
      for (const f of missing.functions) {
        if (text.includes(`rpc("${f}"`) || text.includes(`rpc('${f}'`)) {
          hits.push({ object: f, kind: "function", ...at });
        }
      }
      // Only inside a select() string — a bare identifier match would flag
      // every local variable that happens to share the name.
      const sel = /\.select\(\s*(["'`])([\s\S]*?)\1/.exec(text);
      if (sel) {
        // Which table this select is against. Supabase chains put .from()
        // within a line or two above, so look back a short way rather than
        // trying to parse the expression.
        const table = tableAbove(lines, i);
        for (const tc of missing.columns) {
          const [t, c] = tc.split(".");
          if (table !== t) continue;
          if (new RegExp(`\\b${c}\\b`).test(sel[2])) {
            hits.push({ object: tc, kind: "column", ...at });
          }
        }
      }
    });
  }
  return hits;
}

// ── Reviewed call sites ─────────────────────────────────────────────────────

/**
 * Every reference that is known to survive the gap, and why.
 *
 * Keyed by `file:object` rather than a line number so ordinary edits do not
 * invalidate a reason that is still true. A new reference has no entry and
 * fails the check, which is the whole mechanism.
 */
const REVIEWED: Record<string, string> = {
  "src/lib/pipeline.functions.ts:policy_events":
    "read alongside retention_cases inside one try/catch, after the batch that builds the client record, whose catch logs and leaves both arrays empty. The table arrives with 20260814230000. In the window the client's timeline is assembled from its other three sources — contact history, life events, scheduled meetings — and shows everything it showed before, minus policy activity that nothing was recording anyway. A client record that will not open is far worse than a timeline missing one of five sources",
  "src/lib/book-of-business.functions.ts:policy_events":
    "listPolicyEvents wraps its read in try/catch and returns `{ rows: [], available: false }` rather than throwing. The detail sheet branches on `available` and says 'Policy history isn't available yet' instead of rendering an empty list, which would claim nothing had ever happened to the policy. Everything else on the sheet — status, commissions, client detail — is unaffected",
  "src/lib/post-deal.functions.ts:commission_setup_issues":
    "read inside the same try/catch that wraps the commission calculation, whose catch sets compensation to a generic 'could not be worked out' message. The table arrives with 20260814210000; before it exists the read throws, the catch reports the honest fallback, and the deal — which is already written by this point — still posts. The window degrades to a vaguer sentence, never to a lost policy or a false success",
  "src/lib/compensation/lookup.server.ts:commission_setup_issues":
    "both sites are inside one try/catch in recordSetupIssue whose catch logs and returns. The table arrives with 20260814210000, but the guard is not really about migrations: recording WHY a deal could not be paid must never be the thing that stops the deal being recorded, and the policy is already written by the time this runs. In the window an unresolvable policy simply has no issue row, which is exactly today's behaviour — the old calculator wrote a console warning and nothing else",
  "src/lib/announcements.functions.ts:announcement_deliveries":
    "both sites tolerate the table not existing, and neither can fail a post. The read in listAnnouncements never checks its error — a missing table leaves the channels map empty, so the feed simply shows no channel badges, which is what it showed before the ledger existed. The writes all happen inside deliver(), whose entire call is wrapped in .catch() at the call site precisely because delivery must never turn a published announcement into an error: the row is already committed and readable by the time any of this runs",
  "src/lib/dashboard.functions.ts:organization_settings.show_own_on_leaderboards":
    "the whole opt-out lookup is wrapped in try/catch whose catch treats the failure as 'nobody has opted out' — which is both the column's default and the pre-migration truth. The leaderboard renders identically to today until the imo-scope migration lands; the only thing the window withholds is the ability to hide one's own line, which does not exist yet either",
  "src/lib/discord.functions.ts:organization_settings.show_own_sales_in_feed":
    "wrapped in try/catch treating failure as 'everyone participates', the column's default and today's behaviour. announceDeal's contract is that nothing here may fail the deal that was just written, so the catch was going to exist regardless of migrations",
  "src/lib/discord.functions.ts:agency_relationships":
    "the parent walk is wrapped in try/catch whose catch leaves feedOrgIds as the policy's own org — exactly the pre-IMO fan-out. A missing table means no ancestors hear about the deal, which is what happened before the feature existed",
  "src/lib/agency-relationships.functions.ts:agency_relationships":
    "all three sites tolerate the table not existing. listSubAgencies catches 42P01 and returns children: [] with pendingMigration: true, which the Sub-Agencies page renders as a 'waiting on a workspace update' notice; getMyParentAgency treats 42P01 as 'no parent row' and returns parent: null; updateSubAgency can only be reached from rows those two returned, so before the migration there is nothing to update and no path to the error. The sidebar entry is additionally gated on organizations.parent_org_id, which exists regardless",
  "src/lib/contracting.functions.ts:org_contracting_settings.agents_may_self_activate_carriers":
    "the select is a plain maybeSingle() whose result is coerced with Boolean(), so a missing column yields false — and false is the gate's closed position. An agent reporting a writing number raises a request for staff to confirm instead of activating themselves. Failing open on a permission check would hand out the exact thing the check exists to withhold, and false is also the column's default, so applying the migration changes no behaviour",
  "src/lib/nova-gate.functions.ts:nova_feature_usage":
    "the count query is wrapped in try/catch and its failure sets usageUnknown, which resolveAccess() turns into ALLOW — deliberately failing open. Blocking would deny somebody a feature because an audit table was late; the cost of failing open is one extra free run. recordTrialRun swallows its own error for the same reason",
  "src/lib/nova-gate.functions.ts:upsell_events":
    "both the insert and the read are wrapped in try/catch. Instrumentation must never fail a render or block a click — the point of counting is to find placements that convert below the floor and delete them, and a counter that can break the page it measures would not survive to do that. upsellPerformance returns available:false rather than throwing",
  "src/lib/ai-features.functions.ts:ai_message_log":
    "the insert is wrapped in try/catch and its error is swallowed into a `logged: false` flag returned with the drafts. Before the migration the compliance screen still runs and still blocks — only the audit record is missing, and the flag says so. Deliberate: an agent losing their drafts because an audit table is absent would be a worse failure than a visible gap in the log",
  "src/lib/carrier-index.ts:carrier_aliases":
    'the alias fetch is wrapped in try/catch and falls back to an empty list, so before the migration the matcher runs on names alone; carriers is read with select("*") so the pending naic_code column is simply absent and reads as null. Matching degrades to exact-plus-fuzzy, which still refuses anything under the confidence threshold. Both callers — the admin importer and listCarrierIndex — go through this one builder, so neither can degrade differently',
  "src/lib/onboarding-checklist.functions.ts:user_onboarding_state":
    'all three sites tolerate 42P01: the read is a maybeSingle() whose result is consumed as `stateRes.data?.x ?? default`, so a missing table reads as "nothing dismissed" — which is the correct starting state anyway — and the upsert catches its own error and warns. Step completion is never stored here, so nothing about the checklist\'s accuracy depends on this table existing; only the dismissals fail to stick',
  "src/components/demo-banner.tsx:organizations.is_demo":
    "its own narrow query, deliberately not a field on useOrganization: on 42703 the banner renders nothing, which is correct for every deployment that has no demo org",
  "src/routes/api/public/hooks/demo-reset.ts:demo_reset_log":
    "the endpoint reads the demo org first and returns 200 skipped when there is none, which is the state of any database that lacks this table; nothing else calls it",
  // The three below reference `policies.is_sample` / `clients.is_sample`
  // through a variable or an `.eq()`, so this script cannot see any of them —
  // recorded here anyway, because the next person to add one should find
  // company rather than a blank space.
  "src/lib/pipeline.functions.ts:clients.is_sample":
    "listPipeline asks for the column and re-runs the select without it on any error; the Sample chip simply does not render until the migration lands",
  "src/lib/setup-checklist.functions.ts:policies.is_sample":
    "countRealPolicies filters on it and falls back to the unfiltered count on error, which is the right answer for a database that has no sample rows either",
  "src/lib/sample-data.functions.ts:policies.is_sample":
    "every count is attempted per table and the summary reports available:false when all of them fail, so the settings card says the workspace is still updating instead of offering a button that would do nothing",
  "src/lib/demo.server.ts:organizations.is_demo":
    '`.eq("is_demo", true)` is not inside a select() so this script cannot see it — noted here anyway. demoOrgId() treats any error as "no demo org" and caches that, so the guardrails are inert rather than broken before the migration lands, which matches a deployment that has no demo',
  "src/lib/contracting-notes.functions.ts:producer_notes":
    "isMissingTable() catches 42P01 on all three paths: the read returns notesAvailable:false and the panel shows the audit trail alone, the insert throws a sentence naming the reason, and the delete is a no-op",
  "src/lib/resources.functions.ts:academy_modules.is_published":
    "getAcademyProgress asks for the column, and on 42703 re-runs the select without it. " +
    'The wide `select("*")` this script would rather see is the wrong shape here — it would ' +
    "pull every lesson body on the platform to count them. Every other read of this column " +
    "does use `*`, and `isLive` treats a missing value as published so nothing that exists " +
    "today disappears",
  "src/lib/team.functions.ts:set_agent_status":
    "setAgentStatus catches 42883/PGRST202 and falls back to the direct profiles update, which is exactly today's behaviour",
  "src/lib/ai-assistant.functions.ts:nova_conversations":
    "listNova* return `data ?? []`; askAiAssistant leaves conversationId null and answers without memory",
  "src/lib/ai-assistant.functions.ts:nova_messages":
    "history read is skipped and both writes are guarded when conversationId is null",
  "src/lib/scope.functions.ts:scope_agent_ids":
    "resolveScopeAgentIds throws by design; resolveScopeAgentIdsOrNone returns [] for management views",
  "src/lib/scope.functions.ts:my_scopes":
    "getScopeCapabilities returns NO_SCOPE_CAPABILITIES on error, which clamps every scope to `mine`",
  "src/lib/scope.functions.ts:get_scope_agents":
    "agent picker only renders once the toggle has more than one scope, which needs my_scopes to work",
  "src/lib/finances.functions.ts:my_scopes":
    "canSeeTeamPay ignores the error and falls through to the role_permissions check",
  "src/lib/finances.functions.ts:scope_agent_ids":
    "guarded by scope !== 'mine', and scope clamps to 'mine' while my_scopes is missing",
  "src/lib/contracting.functions.ts:scope_agent_ids":
    "line 95 guarded by scope; the two management views use resolveScopeAgentIdsOrNone",
  "src/lib/pipeline.functions.ts:scope_agent_ids": "guarded by scope === 'mine'",
  "src/lib/tasks.functions.ts:scope_agent_ids": "guarded by scope === 'mine'",
  "src/lib/retention.functions.ts:scope_agent_ids": "guarded by scope === 'mine'",
  "src/lib/support.functions.ts:can_work_tickets":
    "escalateTicket checks for the scope column first and refuses with a sentence",
  "src/lib/resources-admin.functions.ts:can_manage_resources":
    "an error sets pendingSetup, and the page says the workspace is still updating",
  "src/lib/import.functions.ts:import_proposals":
    "isMissingTable turns 42P01 into pendingSetup on every read and SETUP_PENDING on every write; the Import page shows a waiting-on-setup panel instead of a stack trace",
  "src/lib/import.functions.ts:document_intake.user_note":
    "createImportBatch retries the insert without the column on 42703, and listImports selects * so a missing column cannot fail the whole query",
};

// ── Run ─────────────────────────────────────────────────────────────────────

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const applied = (await appliedFromDatabase()) ?? appliedFromManifest(files);

console.log(`\nApplied migrations according to: ${applied.source}`);

const pendingFiles = files.filter((f) => !applied.versions.has(versionOf(f)));
console.log(`${pendingFiles.length} pending migration(s):`);
for (const f of pendingFiles) console.log(`  ${f}`);

// Everything a pending migration introduces...
const pending: Objects = { tables: new Set(), columns: new Set(), functions: new Set() };
for (const f of pendingFiles) {
  const o = parse(readFileSync(join(MIGRATIONS, f), "utf8"));
  for (const k of ["tables", "columns", "functions"] as const) {
    for (const v of o[k]) pending[k].add(v);
  }
}

// ...minus anything an applied migration also creates. Without this step the
// report is mostly false positives — seven contracting tables and four
// functions are re-created by pending files but already exist — and a report
// that is mostly noise is a report nobody reads.
const already: Objects = { tables: new Set(), columns: new Set(), functions: new Set() };
for (const f of files.filter((f) => applied.versions.has(versionOf(f)))) {
  const o = parse(readFileSync(join(MIGRATIONS, f), "utf8"));
  for (const k of ["tables", "columns", "functions"] as const) {
    for (const v of o[k]) already[k].add(v);
  }
}
const missing: Objects = {
  tables: new Set([...pending.tables].filter((t) => !already.tables.has(t))),
  columns: new Set([...pending.columns].filter((c) => !already.columns.has(c))),
  functions: new Set([...pending.functions].filter((f) => !already.functions.has(f))),
};

console.log(
  `\nNot in the database yet: ${missing.tables.size} table(s), ` +
    `${missing.columns.size} column(s), ${missing.functions.size} function(s)`,
);

const hits = findHits(missing);
const unreviewed: Hit[] = [];

if (hits.length === 0) {
  console.log("\nNothing in src/ reaches for any of them.\n");
} else {
  console.log(`\n${hits.length} reference(s):\n`);
  for (const h of hits) {
    const reason = REVIEWED[`${h.file}:${h.object}`];
    if (reason) {
      console.log(`  ok  ${h.object} (${h.kind}) — ${h.file}:${h.line}`);
      console.log(`      ${reason}`);
    } else {
      unreviewed.push(h);
      console.log(`  !!  ${h.object} (${h.kind}) — ${h.file}:${h.line}`);
      console.log(`      ${h.text}`);
    }
  }
}

if (unreviewed.length) {
  console.log(
    `\n${unreviewed.length} unreviewed reference(s). Each one either needs to degrade — ` +
      `select("*") instead of naming the column, a guard, a fallback — or an entry in ` +
      `REVIEWED saying why it already does.\n`,
  );
  process.exit(1);
}

console.log("Every reference to a pending object has a reason.\n");
