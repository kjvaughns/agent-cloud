/**
 * An agent sees nine stages, staff keep seventeen states.
 *
 *   npx tsx scripts/request-stage-check.ts
 *
 * ── The defect ──
 *
 * The brief asks for nine request statuses. The product has seventeen, and
 * they are not wrong — contracting staff work "missing documents" differently
 * from "waiting on agent", and the inbox filters on the difference. Replacing
 * them would take away distinctions the people doing the work rely on.
 *
 * What was missing is the agent's side. An agent looking at My Contracts was
 * shown the staff vocabulary, including "not in good order", which reads as
 * their fault and is usually the carrier's paperwork.
 *
 * ── The exhaustiveness check is the important one ──
 *
 * A status added later with no stage would fall through to a default and read
 * as something it is not. That is a silent wrong answer on a screen an agent
 * checks while waiting, so the mapping is asserted to cover the whole table.
 */

import {
  REQUEST_STAGES, STAGE_LABEL, STAGE_MEANING,
  fromStatus, needsAgent, isFinished, stageTone, requiresNote, noteRefusal,
  mappedStatuses, knownStatuses,
} from "../src/lib/contracting/request-stage";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── The nine ────────────────────────────────────────────────────────────────

check("the nine the brief names, in order", [...REQUEST_STAGES], [
  "requested", "invite_sent", "agent_action_needed", "submitted",
  "carrier_review", "approved", "active", "declined", "closed",
]);
check("each has a label", REQUEST_STAGES.every((s) => STAGE_LABEL[s].length > 3), true);
// A stage name without a sentence is a word an agent has to guess at.
check("…and says what it means for the agent",
  REQUEST_STAGES.every((s) => STAGE_MEANING[s].length > 20), true);

// ── Nothing falls through ───────────────────────────────────────────────────

check("every status the product defines has a stage",
  knownStatuses().filter((s) => !mappedStatuses().includes(s)), []);
// The reverse too: a mapping for a status that no longer exists is dead code
// that hides the fact somebody removed a state.
check("…and nothing is mapped that no longer exists",
  mappedStatuses().filter((s) => !knownStatuses().includes(s)), []);

// ── The collapses, and why each is right ────────────────────────────────────

// Five staff states are all "with the agency, nothing needed from you".
check("staff-side waiting reads as requested",
  ["draft", "ready_to_submit", "assigned", "awaiting_manager", "awaiting_owner_approval"]
    .map(fromStatus),
  ["requested", "requested", "requested", "requested", "requested"]);

// Three states are all "you need to do something", which is one thing for an
// agent to understand and three for staff to triage.
check("all three agent-blocked states read as action needed",
  ["missing_information", "missing_documents", "awaiting_agent"].map(fromStatus),
  ["agent_action_needed", "agent_action_needed", "agent_action_needed"]);

// "Not in good order" reads as the agent's fault and usually is not.
check("carrier-side states read as carrier review",
  ["carrier_reviewing", "nigo", "additional_info_requested"].map(fromStatus),
  ["carrier_review", "carrier_review", "carrier_review"]);
check("…so an agent is never shown 'not in good order'",
  Object.values(STAGE_LABEL).some((l) => /not in good order/i.test(l)), false);

check("a writing number means active", fromStatus("writing_number_issued"), "active");
check("cancelled and closed are both closed",
  [fromStatus("cancelled"), fromStatus("closed")], ["closed", "closed"]);
check("declined stays declined", fromStatus("declined"), "declined");

// A status this does not know about is a deployment ordering problem. Showing
// the earliest honest stage beats showing an agent an error.
check("an unknown status reads as requested rather than throwing",
  fromStatus("something_new"), "requested");

// ── What an agent should do about it ────────────────────────────────────────

check("action needed asks the agent", needsAgent("agent_action_needed"), true);
check("…and so does an invite", needsAgent("invite_sent"), true);
check("carrier review does not", needsAgent("carrier_review"), false);

check("active is finished", isFinished("active"), true);
check("declined is finished too", isFinished("declined"), true);
check("…and so is closed", isFinished("closed"), true);
check("submitted is not", isFinished("submitted"), false);

check("action needed is a warning", stageTone("agent_action_needed"), "warning");
check("declined is a danger", stageTone("declined"), "danger");
check("active is a success", stageTone("active"), "success");

// ── Action needed must say what to do ───────────────────────────────────────
//
// A status that tells somebody to act without saying what is wanted is worse
// than leaving it alone — they will ask, and somebody has to answer.

check("action needed requires a note", requiresNote("agent_action_needed"), true);
check("…and nothing else does",
  REQUEST_STAGES.filter(requiresNote), ["agent_action_needed"]);
check("the refusal says where the agent will read it",
  /My Contracts/.test(noteRefusal()), true);

// ── The one that used to be unreachable ─────────────────────────────────────
//
// This stage was written ahead of its status: nothing in the schema recorded
// that an invitation had gone out, so the stage existed and no status reached
// it. `invite_sent` is a primary status now, and the mapping closed. The
// assertion moves with it — pinning "nothing maps here" described a gap, not a
// rule, and kept failing once the gap was filled.

check("an invitation reaches the agent as its own stage",
  fromStatus("invite_sent"), "invite_sent");
check("…and is something the agent has to act on",
  needsAgent("invite_sent"), true);
// Distinct from agent_action_needed on purpose: open an email is not the same
// instruction as fix a submission, and folding them would make the note the
// other one requires apply to this one too.
check("…without being folded into agent action needed",
  fromStatus("awaiting_agent") === fromStatus("invite_sent"), false);

// ── Appointed, from either status ───────────────────────────────────────────
//
// `active` joined `writing_number_issued` as the picker's word for appointed.
// An unmapped status falls through `fromStatus` to "requested", so leaving it
// out told an appointed agent their contract had not been sent yet — the worst
// available answer, and silent.

check("both appointed statuses reach the same stage",
  [fromStatus("active"), fromStatus("writing_number_issued")], ["active", "active"]);
check("…and it is finished", isFinished("active"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
