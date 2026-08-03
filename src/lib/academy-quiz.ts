import { z } from "zod";

/**
 * What a quiz is, what makes one broken, and how it is marked.
 *
 * `academy_modules.quiz` has been a `jsonb` column with no schema since the
 * table was created. Nothing has ever written to it, so this is the first
 * definition of what belongs in there — which makes it worth getting the one
 * decision right that the shape hinges on.
 *
 * THE CORRECT ANSWER IS AN OPTION ID, NOT A POSITION.
 *
 * The obvious encoding is `{ options: string[], answer: 2 }`. It is also a
 * trap, and one I have watched spring: delete the option above the correct one
 * and the index now points at a different answer, silently, with nothing in the
 * UI to say the quiz changed meaning. An author reorders their options, saves,
 * and the quiz is quietly wrong for everybody who takes it afterwards. Ids
 * survive both operations, and a correct answer that no longer exists becomes a
 * validation error rather than a wrong answer.
 *
 * Everything here is pure. That is the point: grading and validation are the
 * two things worth being sure about, and neither needs a database to be tested.
 * See `scripts/academy-check.ts`.
 */

export const QuizOptionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(500),
});

export const QuizQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  prompt: z.string().trim().min(1).max(2000),
  /** `multiple` requires every correct option and no incorrect one. */
  kind: z.enum(["single", "multiple"]).default("single"),
  options: z.array(QuizOptionSchema).min(2).max(10),
  /** Option ids. Exactly one for `single`, at least one for `multiple`. */
  correct: z.array(z.string()).min(1),
  /** Shown after marking, whether or not they got it right. */
  explanation: z.string().trim().max(2000).optional(),
});

export const QuizSchema = z.object({
  /** Percentage of questions needed to pass, 0–100. */
  pass_pct: z.number().int().min(0).max(100).default(70),
  questions: z.array(QuizQuestionSchema).min(1).max(50),
  /** Absent means unlimited. Zero would mean "cannot be taken", so it is not allowed. */
  max_attempts: z.number().int().min(1).max(20).optional(),
});

export type QuizOption = z.infer<typeof QuizOptionSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type Quiz = z.infer<typeof QuizSchema>;

/** The pass marks the old Resources app offered, as whole percentages. */
export const PASS_MARKS = [50, 60, 67, 70, 75, 80, 90] as const;

/**
 * Ids that are unique within a quiz and stable across a save.
 *
 * Not `crypto.randomUUID()` — this runs in the editor on every "add option"
 * click, and a 64-character quiz body for a five-option question is noise in
 * every diff and every payload. Collision risk within one quiz of at most fifty
 * questions is not a real risk.
 */
export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function blankQuestion(): QuizQuestion {
  const a = newId("o");
  return {
    id: newId("q"),
    prompt: "",
    kind: "single",
    options: [
      { id: a, text: "" },
      { id: newId("o"), text: "" },
    ],
    correct: [a],
  };
}

export function blankQuiz(): Quiz {
  return { pass_pct: 70, questions: [blankQuestion()] };
}

// ── Reading what is already stored ──────────────────────────────────────────

/**
 * The shape in the old Resources app, which is where any imported quiz comes
 * from: `{ pass: 0.67, questions: [{ q, options: ["a","b"], answer: 1 }] }` —
 * a fractional pass mark, bare strings for options, and the positional index
 * this module exists to get away from.
 *
 * Converted rather than rejected, because the alternative is retyping a quiz
 * that already exists. The conversion is where the index is resolved for the
 * last time, against the option list it was written for.
 */
function upgradeLegacy(raw: any): unknown {
  const questions = (raw.questions ?? []).map((q: any) => {
    const options = (q.options ?? []).map((text: any) => ({
      id: newId("o"),
      text: String(text ?? ""),
    }));
    const at = typeof q.answer === "number" ? q.answer : 0;
    const correct = options[at] ? [options[at].id] : options[0] ? [options[0].id] : [];
    return {
      id: newId("q"),
      prompt: String(q.q ?? q.prompt ?? ""),
      kind: "single",
      options,
      correct,
    };
  });

  // `pass` was a fraction; `pass_pct` is a percentage. 0.67 and 67 are the same
  // intention, and a value of 1 is ambiguous — read as 100%, since a quiz you
  // must score 1% on is not a thing anybody sets.
  const p = typeof raw.pass === "number" ? raw.pass : undefined;
  const pass_pct = p === undefined ? 70 : p <= 1 ? Math.round(p * 100) : Math.round(p);

  return { pass_pct, questions };
}

/**
 * Read a stored quiz, or `null` if there isn't one.
 *
 * Returns `null` rather than throwing on a body that will not parse. A lesson
 * whose quiz is malformed should render as a lesson without a quiz — the reader
 * has no way to fix it and no useful thing to say about it — while the editor
 * asks `quizProblems` separately and can say exactly what is wrong.
 */
export function readQuiz(raw: unknown): Quiz | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as any;
  if (!Array.isArray(obj.questions) || obj.questions.length === 0) return null;

  const candidate = "pass_pct" in obj || obj.questions.some((q: any) => Array.isArray(q?.options) && typeof q.options[0] === "object")
    ? obj
    : upgradeLegacy(obj);

  const parsed = QuizSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Everything wrong with a quiz, in the words the author needs.
 *
 * Deliberately not a boolean. "This quiz is invalid" is the message that makes
 * somebody click Save four more times; "Question 2 has no correct answer
 * marked" is the one that gets fixed.
 */
export function quizProblems(quiz: Quiz): string[] {
  const problems: string[] = [];

  if (quiz.questions.length === 0) problems.push("A quiz needs at least one question.");

  const seenQuestionIds = new Set<string>();
  quiz.questions.forEach((q, i) => {
    const where = `Question ${i + 1}`;

    if (seenQuestionIds.has(q.id)) problems.push(`${where} shares an id with an earlier question.`);
    seenQuestionIds.add(q.id);

    if (!q.prompt.trim()) problems.push(`${where} has no question text.`);

    const ids = new Set(q.options.map((o) => o.id));
    if (ids.size !== q.options.length) problems.push(`${where} has two options with the same id.`);

    const blank = q.options.filter((o) => !o.text.trim()).length;
    if (blank) problems.push(`${where} has ${blank} empty answer${blank === 1 ? "" : "s"}.`);

    const texts = q.options.map((o) => o.text.trim().toLowerCase()).filter(Boolean);
    if (new Set(texts).size !== texts.length) problems.push(`${where} repeats an answer.`);

    // The reason ids exist. A correct answer pointing at a deleted option is
    // caught here instead of marking everyone wrong.
    const dangling = q.correct.filter((c) => !ids.has(c));
    if (dangling.length) problems.push(`${where} marks an answer correct that is no longer there.`);

    const live = q.correct.filter((c) => ids.has(c));
    if (live.length === 0) problems.push(`${where} has no correct answer marked.`);
    if (q.kind === "single" && live.length > 1) {
      problems.push(`${where} is single-answer but has ${live.length} answers marked correct.`);
    }
    if (live.length === q.options.length) {
      problems.push(`${where} marks every answer correct, so it cannot be got wrong.`);
    }
  });

  return problems;
}

// ── Marking ─────────────────────────────────────────────────────────────────

export type QuestionResult = {
  question_id: string;
  chosen: string[];
  correct: boolean;
};

export type QuizResult = {
  results: QuestionResult[];
  correct: number;
  total: number;
  /** Whole percent, rounded. The score stored on `course_progress.quiz_score`. */
  pct: number;
  passed: boolean;
};

/**
 * Mark a set of answers.
 *
 * A question is right when the chosen set is exactly the correct set — for a
 * multiple-answer question, picking three of four correct options is not
 * partial credit, it is a wrong answer. Partial credit would need a rule for
 * incorrect picks too, and every rule anybody proposes for that is arbitrary.
 *
 * Unanswered questions count as wrong rather than being excluded, so the
 * percentage is out of the whole quiz. Skipping the hard half of a quiz should
 * not be a way to score 100%.
 */
export function gradeQuiz(quiz: Quiz, answers: Record<string, string[]>): QuizResult {
  const results: QuestionResult[] = quiz.questions.map((q) => {
    const valid = new Set(q.options.map((o) => o.id));
    const chosen = [...new Set(answers[q.id] ?? [])].filter((c) => valid.has(c));
    const want = [...new Set(q.correct)].filter((c) => valid.has(c));

    const correct =
      want.length > 0 &&
      chosen.length === want.length &&
      want.every((w) => chosen.includes(w));

    return { question_id: q.id, chosen, correct };
  });

  const correct = results.filter((r) => r.correct).length;
  const total = quiz.questions.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  return { results, correct, total, pct, passed: pct >= quiz.pass_pct };
}

/** "3 questions · 70% to pass" — the one-line summary the curriculum list shows. */
export function quizSummary(quiz: Quiz): string {
  const n = quiz.questions.length;
  return `${n} question${n === 1 ? "" : "s"} · ${quiz.pass_pct}% to pass`;
}
