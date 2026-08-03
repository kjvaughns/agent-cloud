/**
 * The Academy course builder.
 *
 * `npx tsx scripts/academy-check.ts`
 *
 * Two halves, and they are different kinds of check.
 *
 * The first half is real: `academy-quiz.ts` is pure, so grading and validation
 * are exercised against actual inputs rather than asserted about by regex. The
 * case worth having is the one the whole module is shaped around — deleting the
 * option that was marked correct must leave the question with no correct
 * answer, not silently promote whichever option is now first. That is the bug
 * the old Resources app had, and an index-based encoding brings it straight
 * back.
 *
 * The second half is string assertions over the wiring, which prove the code is
 * still connected rather than that it works. Worth having anyway: `saveModule`
 * and `deleteModule` sat in the codebase with no caller for weeks, and nothing
 * would have noticed if they went back to having none.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  QuizSchema, gradeQuiz, quizProblems, readQuiz, blankQuiz, blankQuestion, newId,
  type Quiz,
} from "../src/lib/academy-quiz";
import { mediaPath, readVideoUrl } from "../src/lib/academy-media";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── Grading ─────────────────────────────────────────────────────────────────

const QUIZ: Quiz = {
  pass_pct: 67,
  questions: [
    {
      id: "q1", prompt: "When does a term policy lapse?", kind: "single",
      options: [{ id: "a", text: "Never" }, { id: "b", text: "At the end of the term" }, { id: "c", text: "On the first claim" }],
      correct: ["b"],
    },
    {
      id: "q2", prompt: "Which are riders?", kind: "multiple",
      options: [{ id: "d", text: "Waiver of premium" }, { id: "e", text: "Accelerated death benefit" }, { id: "f", text: "The application" }],
      correct: ["d", "e"],
    },
    {
      id: "q3", prompt: "Who owns the policy?", kind: "single",
      options: [{ id: "g", text: "The insured" }, { id: "h", text: "The owner" }],
      correct: ["h"],
    },
  ],
};

check("all right is 100%", gradeQuiz(QUIZ, { q1: ["b"], q2: ["d", "e"], q3: ["h"] }).pct, 100);
check("all wrong is 0%", gradeQuiz(QUIZ, { q1: ["a"], q2: ["f"], q3: ["g"] }).pct, 0);

// Unanswered is wrong, not excluded. Answering only the easy question must not
// score 100% out of one.
check("skipping a question does not shrink the denominator",
  gradeQuiz(QUIZ, { q1: ["b"] }), {
    results: [
      { question_id: "q1", chosen: ["b"], correct: true },
      { question_id: "q2", chosen: [], correct: false },
      { question_id: "q3", chosen: [], correct: false },
    ],
    correct: 1, total: 3, pct: 33, passed: false,
  });

// Multiple-answer questions are all-or-nothing on purpose.
check("half a multiple answer is wrong",
  gradeQuiz(QUIZ, { q2: ["d"] }).results[1].correct, false);
check("a correct answer plus an incorrect one is wrong",
  gradeQuiz(QUIZ, { q2: ["d", "e", "f"] }).results[1].correct, false);

// Options that are not on the question are dropped rather than counted.
check("an answer id that isn't an option is ignored",
  gradeQuiz(QUIZ, { q1: ["b", "zzz"] }).results[0], { question_id: "q1", chosen: ["b"], correct: true });
check("duplicate picks do not count twice",
  gradeQuiz(QUIZ, { q2: ["d", "d", "e"] }).results[1].correct, true);

check("the pass mark is inclusive", gradeQuiz(QUIZ, { q1: ["b"], q2: ["d", "e"] }).passed, true);
check("one below the pass mark fails", gradeQuiz(QUIZ, { q1: ["b"] }).passed, false);

// ── The reason correct answers are ids ──────────────────────────────────────

console.log("");

// Delete the option that was marked correct. With a positional index this is
// the silent-corruption case: the index still resolves, to a different answer.
const afterDelete: Quiz = {
  ...QUIZ,
  questions: [
    { ...QUIZ.questions[0], options: QUIZ.questions[0].options.filter((o) => o.id !== "b"), correct: ["b"] },
    ...QUIZ.questions.slice(1),
  ],
};

check("deleting the correct option leaves nothing correct",
  gradeQuiz(afterDelete, { q1: ["a"] }).results[0].correct, false);
check("and it is reported rather than tolerated",
  quizProblems(afterDelete).some((p) => /no longer there/.test(p)), true);

// Reordering options must not change which answer is correct. This is the
// other half of the same argument.
const reordered: Quiz = {
  ...QUIZ,
  questions: [
    { ...QUIZ.questions[0], options: [...QUIZ.questions[0].options].reverse() },
    ...QUIZ.questions.slice(1),
  ],
};
check("reordering options does not change the answer",
  gradeQuiz(reordered, { q1: ["b"] }).results[0].correct, true);

// ── Validation ──────────────────────────────────────────────────────────────

console.log("");

check("a good quiz has no problems", quizProblems(QUIZ), []);

check("a question with no correct answer is caught",
  quizProblems({ ...QUIZ, questions: [{ ...QUIZ.questions[0], correct: [] as any }] })
    .some((p) => /no correct answer/.test(p)), true);

check("a question where everything is correct is caught",
  quizProblems({ ...QUIZ, questions: [{ ...QUIZ.questions[2], correct: ["g", "h"], kind: "multiple" }] })
    .some((p) => /cannot be got wrong/.test(p)), true);

check("a single-answer question with two answers marked is caught",
  quizProblems({ ...QUIZ, questions: [{ ...QUIZ.questions[0], correct: ["a", "b"] }] })
    .some((p) => /single-answer/.test(p)), true);

check("an empty answer is caught",
  quizProblems({ ...QUIZ, questions: [{ ...QUIZ.questions[2], options: [{ id: "g", text: "" }, { id: "h", text: "The owner" }] }] })
    .some((p) => /empty answer/.test(p)), true);

check("a repeated answer is caught",
  quizProblems({ ...QUIZ, questions: [{ ...QUIZ.questions[2], options: [{ id: "g", text: "Same" }, { id: "h", text: "same" }] }] })
    .some((p) => /repeats an answer/.test(p)), true);

check("problems name the question by number",
  quizProblems({ ...QUIZ, questions: [QUIZ.questions[0], { ...QUIZ.questions[1], correct: [] as any }] })[0]
    .startsWith("Question 2"), true);

// A fresh quiz from the editor is not yet valid — it has no text — but it must
// not be structurally broken, or the author is fighting the form from the
// first click.
check("a blank question has a correct answer marked", blankQuestion().correct.length, 1);
check("a blank quiz only complains about missing text",
  quizProblems(blankQuiz()).every((p) => /question text|empty answer/.test(p)), true);

check("ids are unique across a hundred calls",
  new Set(Array.from({ length: 100 }, () => newId("o"))).size, 100);

// ── Reading what is stored ──────────────────────────────────────────────────

console.log("");

check("no quiz reads as null", readQuiz(null), null);
check("an empty question list reads as null", readQuiz({ questions: [] }), null);
check("a malformed body reads as null rather than throwing",
  readQuiz({ questions: [{ prompt: "x" }] }), null);

// The shape in the old Resources app: a fractional pass mark, bare strings for
// options, and the positional index.
const legacy = readQuiz({
  pass: 0.67,
  questions: [{ q: "Which is a rider?", options: ["The application", "Waiver of premium"], answer: 1 }],
});
check("a legacy quiz is converted rather than refused", Boolean(legacy), true);
check("its fractional pass mark becomes a percentage", legacy?.pass_pct, 67);
check("its positional answer is resolved against the options it was written for",
  legacy ? legacy.questions[0].correct[0] === legacy.questions[0].options[1].id : false, true);
check("and the converted quiz is valid", legacy ? quizProblems(legacy) : ["not converted"], []);

check("a current-shape quiz round-trips",
  readQuiz(JSON.parse(JSON.stringify(QUIZ)))?.questions.length, 3);

check("pass_pct is bounded", QuizSchema.safeParse({ ...QUIZ, pass_pct: 140 }).success, false);
check("a question needs at least two options",
  QuizSchema.safeParse({ ...QUIZ, questions: [{ ...QUIZ.questions[0], options: [{ id: "a", text: "only" }] }] }).success,
  false);

// ── Media ───────────────────────────────────────────────────────────────────

console.log("");

// The first path segment is what the storage policy asks can_manage_resources
// about. If it stops being the organisation id, the policy stops guarding
// anything it thinks it guards.
const ORG = "11111111-2222-3333-4444-555555555555";
check("uploads are filed under the owning organisation",
  mediaPath(ORG, "video", "Intro Call.mp4").startsWith(`${ORG}/video/`), true);
check("a platform default goes in the platform folder",
  mediaPath(null, "image", "cover.png").startsWith("platform/image/"), true);
check("the filename is stripped to something a URL survives",
  /^[a-z0-9/.\-_]+$/.test(mediaPath(ORG, "video", "Intro Call (final)!.mp4")), true);
check("two uploads of the same name do not collide",
  mediaPath(ORG, "video", "a.mp4") === mediaPath(ORG, "video", "a.mp4"), false);

// Pasting the page URL into an iframe is the most common way a video lesson
// ends up a blank box, so each provider's watch URL must resolve to its embed.
for (const [name, url, want] of [
  ["YouTube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"],
  ["youtu.be", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"],
  ["Vimeo", "https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"],
  ["Loom", "https://www.loom.com/share/abc123def", "https://www.loom.com/embed/abc123def"],
  ["Drive", "https://drive.google.com/file/d/1AbC-dEf/view", "https://drive.google.com/file/d/1AbC-dEf/preview"],
] as const) {
  const v = readVideoUrl(url);
  check(`${name} resolves to an embed`, v?.kind === "embed" ? v.url : v, want);
}

check("a direct file plays without an iframe", readVideoUrl("https://x.test/a.mp4")?.kind, "file");
check("anything else opens in a tab rather than a blank player",
  readVideoUrl("https://example.test/some/page")?.kind, "link");
check("an empty video url is nothing at all", readVideoUrl(""), null);

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const ADMIN = readFileSync(join(ROOT, "src/lib/resources-admin.functions.ts"), "utf8");
const BUILDER = readFileSync(join(ROOT, "src/components/resources/course-builder.tsx"), "utf8");
const EDITOR = readFileSync(join(ROOT, "src/components/resources/resources-editor.tsx"), "utf8");
const READER = readFileSync(join(ROOT, "src/routes/_authenticated/resources/agent-academy.tsx"), "utf8");
const RESOURCES = readFileSync(join(ROOT, "src/lib/resources.functions.ts"), "utf8");

// The whole reason this feature exists: these had no caller.
for (const fn of ["saveModule", "deleteModule", "duplicateModule", "reorderModules", "getCourseForEdit"]) {
  check(`${fn} is exported`, new RegExp(`export const ${fn} =`).test(ADMIN), true);
  check(`${fn} has a caller`, BUILDER.includes(fn), true);
}

// Every lesson write goes through the course, and the course is where
// permission lives. Without this a bad course_id is an opaque RLS silence.
check("lesson writes check the course first",
  (ADMIN.match(/await assertMayEditCourse\(/g) ?? []).length >= 4, true);
check("the course check names platform defaults rather than failing silently",
  /Make ours/.test(ADMIN), true);

// The delete-check convention: a filtered-out delete affects zero rows and
// returns no error.
check("deleteModule asserts it deleted something",
  /delete\(\)[\s\S]{0,200}select\("id"\)[\s\S]{0,200}if \(!gone\?\.length\) throw/.test(ADMIN), true);

// The write whitelist is the security boundary; `url` was missing from it.
check("a forked course keeps its external link",
  /academy_courses: \[[^\]]*"url"/.test(ADMIN), true);
check("duration is not hand-writable, because the trigger owns it",
  /academy_courses: \[[^\]]*"duration_minutes"/.test(ADMIN), false);

// Stored HTML is sanitised at the write as well as the read.
check("the server sanitises html before storing it", /function cleanHtml/.test(ADMIN), true);
check("lesson bodies go through it", /content_html: cleanHtml\(/.test(ADMIN), true);

// A quiz that cannot be passed must not be storable.
check("saveModule refuses a broken quiz", /quizProblems\(data\.quiz\)/.test(ADMIN), true);

// Code ships before the migration does.
check("lesson writes tolerate the unapplied migration", /writeTolerantly/.test(ADMIN), true);
check("the tolerated columns are named", /PENDING_MODULE_COLUMNS/.test(ADMIN), true);

// The reader.
check("the reader groups lessons into sections", /startsSection/.test(READER), true);
check("the reader plays video inline instead of opening a tab",
  /<iframe/.test(READER) && /<video/.test(READER), true);
check("the reader sanitises lesson html", /RichTextPreview/.test(READER), true);
check("raw dangerouslySetInnerHTML is gone from the academy",
  /dangerouslySetInnerHTML/.test(READER), false);
check("the reader can take a quiz", /function QuizRunner/.test(READER), true);
check("a quiz is finished by passing it, not by ticking a box",
  /disabled=\{Boolean\(quiz\) && !lesson\.completed\}/.test(READER), true);
check("a failed attempt still records its score", /onFailed=\{\(pct\) =>/.test(READER), true);

// Drafts.
check("draft lessons are hidden from agents", /function isLive/.test(RESOURCES), true);
check("the roll-up counts live lessons only", /\.filter\(isLive\)/.test(RESOURCES), true);
check("progress is written in one statement where the constraint exists",
  /onConflict: "agent_id,module_id"/.test(RESOURCES), true);
check("with a named fallback for databases that lack it",
  /42P10/.test(RESOURCES), true);

// The way in.
check("the Academy tab drills into the curriculum", /CourseBuilder/.test(EDITOR), true);
check("a platform default is copied before it is built on",
  /function OpenCurriculum/.test(EDITOR) && /forkResource/.test(EDITOR), true);
check("handbook and script bodies are no longer typed as raw HTML",
  /type: "rich"/.test(EDITOR), true);
check("script categories come from the enum rather than free text",
  /SCRIPT_CATEGORIES/.test(EDITOR), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
