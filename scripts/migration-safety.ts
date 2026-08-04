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
      .map((l) => l.trim().replace(/^[-*]\s*/, "").replace(/^`|`$/g, ""))
      .filter((l) => l.endsWith(".sql")),
  );
  return {
    versions: new Set(all.filter((f) => !pending.has(f)).map(versionOf)),
    source: "supabase/migrations/PENDING.md (unverified)",
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
    for (const col of stmt[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)) {
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
  "src/lib/contracting-notes.functions.ts:producer_notes":
    "isMissingTable() catches 42P01 on all three paths: the read returns notesAvailable:false and the panel shows the audit trail alone, the insert throws a sentence naming the reason, and the delete is a no-op",
  "src/lib/resources.functions.ts:academy_modules.is_published":
    "getAcademyProgress asks for the column, and on 42703 re-runs the select without it. "
    + "The wide `select(\"*\")` this script would rather see is the wrong shape here — it would "
    + "pull every lesson body on the platform to count them. Every other read of this column "
    + "does use `*`, and `isLive` treats a missing value as published so nothing that exists "
    + "today disappears",
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

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
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
