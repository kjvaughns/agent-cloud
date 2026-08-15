import { Plus, Trash2, GripVertical, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type Quiz, type QuizQuestion, PASS_MARKS, blankQuestion, newId, quizProblems,
} from "@/lib/academy-quiz";

/**
 * Building a quiz.
 *
 * The interaction to get right is marking the correct answer, and the old
 * Resources app got it right: you click the radio next to the answer rather
 * than filling in a separate "correct answer" field. Nobody has ever wanted a
 * dropdown that says "Option 3".
 *
 * What it got wrong was underneath — the correct answer was stored as the
 * option's position, so deleting the option above it silently made a different
 * answer correct. `academy-quiz.ts` stores option ids instead, and the delete
 * button here is what that decision was for: removing the marked answer leaves
 * the question with none, and the problems list says so, rather than quietly
 * promoting whatever was first.
 */

type Props = {
  quiz: Quiz;
  onChange: (quiz: Quiz) => void;
};

export function QuizBuilder({ quiz, onChange }: Props) {
  const problems = quizProblems(quiz);

  const setQuestion = (i: number, q: QuizQuestion) =>
    onChange({ ...quiz, questions: quiz.questions.map((x, k) => (k === i ? q : x)) });

  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= quiz.questions.length) return;
    const next = [...quiz.questions];
    [next[i], next[to]] = [next[to], next[i]];
    onChange({ ...quiz, questions: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Pass mark</Label>
          <Select
            value={String(quiz.pass_pct)}
            onValueChange={(v) => onChange({ ...quiz, pass_pct: Number(v) })}
          >
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PASS_MARKS.map((p) => <SelectItem key={p} value={String(p)}>{p}%</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Attempts</Label>
          <Select
            value={quiz.max_attempts ? String(quiz.max_attempts) : "unlimited"}
            onValueChange={(v) =>
              onChange({ ...quiz, max_attempts: v === "unlimited" ? undefined : Number(v) })}
          >
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unlimited">Unlimited</SelectItem>
              {[1, 2, 3, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} attempt{n === 1 ? "" : "s"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground tnum">
          {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}
        </div>
      </div>

      {problems.length > 0 && (
        <div className="flex gap-2 rounded-[var(--radius)] border border-warning/40 bg-warning/[0.06] p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <ul className="space-y-0.5 text-xs">
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {quiz.questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          index={i}
          question={q}
          onChange={(next) => setQuestion(i, next)}
          onRemove={() =>
            onChange({ ...quiz, questions: quiz.questions.filter((_, k) => k !== i) })}
          onMove={(by) => move(i, by)}
          first={i === 0}
          last={i === quiz.questions.length - 1}
        />
      ))}

      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange({ ...quiz, questions: [...quiz.questions, blankQuestion()] })}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add question
      </Button>
    </div>
  );
}

function QuestionCard({ index, question, onChange, onRemove, onMove, first, last }: {
  index: number;
  question: QuizQuestion;
  onChange: (q: QuizQuestion) => void;
  onRemove: () => void;
  onMove: (by: number) => void;
  first: boolean;
  last: boolean;
}) {
  const toggleCorrect = (optionId: string) => {
    if (question.kind === "single") {
      onChange({ ...question, correct: [optionId] });
      return;
    }
    const has = question.correct.includes(optionId);
    onChange({
      ...question,
      correct: has
        ? question.correct.filter((c) => c !== optionId)
        : [...question.correct, optionId],
    });
  };

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface-2/40 p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col pt-1.5">
          <button
            type="button" aria-label="Move up" disabled={first}
            onClick={() => onMove(-1)}
            className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
          >▲</button>
          <GripVertical className="h-3 w-3 text-text-dim" />
          <button
            type="button" aria-label="Move down" disabled={last}
            onClick={() => onMove(1)}
            className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
          >▼</button>
        </div>

        <span className="pt-2 text-[11px] text-text-dim tnum">Q{index + 1}</span>

        <div className="min-w-0 flex-1 space-y-2">
          <Textarea
            value={question.prompt}
            placeholder="What do you want to ask?"
            onChange={(e) => onChange({ ...question, prompt: e.target.value })}
            className="min-h-[52px] text-sm"
          />

          <div className="flex items-center gap-2">
            <Select
              value={question.kind}
              onValueChange={(v) => {
                const kind = v as QuizQuestion["kind"];
                // Narrowing to one answer has to pick one, and the first
                // marked is the least surprising choice.
                const correct = kind === "single" && question.correct.length > 1
                  ? [question.correct[0]]
                  : question.correct;
                onChange({ ...question, kind, correct });
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">One correct answer</SelectItem>
                <SelectItem value="multiple">Several correct answers</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">
              {question.kind === "single"
                ? "Click a circle to mark it correct."
                : "Every correct answer must be picked, and no incorrect one."}
            </span>
          </div>

          <div className="space-y-1.5">
            {question.options.map((o, k) => {
              const correct = question.correct.includes(o.id);
              return (
                <div key={o.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={correct}
                    aria-label={`Mark answer ${k + 1} correct`}
                    onClick={() => toggleCorrect(o.id)}
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center border transition-colors",
                      question.kind === "single" ? "rounded-full" : "rounded",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                      correct
                        ? "border-success bg-success text-on-solid"
                        : "border-border hover:border-primary",
                    )}
                  >
                    {correct && <span className="text-[10px] leading-none">✓</span>}
                  </button>
                  <Input
                    value={o.text}
                    placeholder={`Answer ${k + 1}`}
                    onChange={(e) =>
                      onChange({
                        ...question,
                        options: question.options.map((x) =>
                          x.id === o.id ? { ...x, text: e.target.value } : x),
                      })}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm" variant="ghost"
                    className="h-8 w-8 p-0"
                    aria-label={`Remove answer ${k + 1}`}
                    disabled={question.options.length <= 2}
                    onClick={() =>
                      onChange({
                        ...question,
                        options: question.options.filter((x) => x.id !== o.id),
                        // The whole point of ids: the marked answer is removed
                        // from `correct` rather than sliding onto its neighbour.
                        correct: question.correct.filter((c) => c !== o.id),
                      })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm" variant="ghost" className="h-7 text-xs"
              disabled={question.options.length >= 10}
              onClick={() =>
                onChange({ ...question, options: [...question.options, { id: newId("o"), text: "" }] })}
            >
              <Plus className="mr-1 h-3 w-3" /> Add answer
            </Button>
          </div>

          <Input
            value={question.explanation ?? ""}
            placeholder="Why (shown after they answer, optional)"
            onChange={(e) => onChange({ ...question, explanation: e.target.value || undefined })}
            className="h-8 text-xs"
          />
        </div>

        <Button
          size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0"
          aria-label={`Remove question ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
