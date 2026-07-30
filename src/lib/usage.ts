/**
 * Usage tracking.
 *
 * Answers one question: which pages and actions does anyone actually use?
 * That question gates every decision about what to merge or remove, and right
 * now it is being answered by guessing.
 *
 * Three rules this file follows, because a tracker that breaks the app is
 * worse than no tracker:
 *
 *   1. It never blocks. Events queue in memory and flush on a timer.
 *   2. It never throws. Every failure is swallowed and forgotten.
 *   3. It never records personal data. A path, an action name and a role.
 */

import { recordUsage } from "@/lib/usage.functions";

type QueuedEvent = {
  event: "page_view" | "action" | "workflow_step";
  path: string;
  action?: string | null;
  duration_ms?: number | null;
  meta?: Record<string, string | number | boolean>;
};

const QUEUE: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let enabled = true;

/** Flush after this long, or when the queue reaches BATCH_MAX. */
const FLUSH_MS = 8000;
const BATCH_MAX = 25;

/**
 * Strips ids out of a path so `/clients/9f3a…` and `/clients/be21…` are the
 * same page in a report. Without this, every detail view looks like a page
 * nobody visits twice.
 */
export function normalisePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .replace(/\/+$/, "") || "/";
}

async function flush() {
  flushTimer = null;
  if (!enabled || QUEUE.length === 0) return;

  const batch = QUEUE.splice(0, QUEUE.length);
  try {
    await recordUsage({ data: { events: batch } });
  } catch {
    // A dropped batch is an acceptable loss. Re-queueing risks an unbounded
    // queue on a user whose session has expired, which is a real bug in
    // exchange for imaginary completeness.
    enabled = QUEUE.length < 200;
  }
}

function schedule() {
  if (QUEUE.length >= BATCH_MAX) {
    void flush();
    return;
  }
  if (flushTimer === null) flushTimer = setTimeout(() => void flush(), FLUSH_MS);
}

function push(e: QueuedEvent) {
  if (!enabled || typeof window === "undefined") return;
  QUEUE.push(e);
  schedule();
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Records that a page was opened, and how long the previous one was open.
 *
 * Time-on-page is the cheapest signal for "opened and immediately left",
 * which is what a confusing page looks like in data.
 */
let currentPath: string | null = null;
let arrivedAt = 0;

export function trackPageView(rawPath: string) {
  const path = normalisePath(rawPath);
  if (path === currentPath) return;

  if (currentPath !== null) {
    push({
      event: "page_view",
      path: currentPath,
      duration_ms: Math.min(30 * 60 * 1000, Date.now() - arrivedAt),
    });
  }

  currentPath = path;
  arrivedAt = Date.now();
}

/** Records a deliberate action — a button, an export, a status change. */
export function trackAction(action: string, meta?: Record<string, string | number | boolean>) {
  push({ event: "action", path: currentPath ?? "/", action, meta });
}

/**
 * Records a step in a multi-step workflow.
 *
 * Steps are what make abandonment visible: if fifty people reach
 * `onboarding:documents` and eight reach `onboarding:contracted`, the drop-off
 * is not a matter of opinion.
 */
export function trackStep(workflow: string, step: string, meta?: Record<string, string | number | boolean>) {
  push({ event: "workflow_step", path: currentPath ?? "/", action: `${workflow}:${step}`, meta });
}

/** Sends anything queued. Called when the tab is hidden or closed. */
export function flushUsage() {
  if (currentPath !== null) {
    push({
      event: "page_view",
      path: currentPath,
      duration_ms: Math.min(30 * 60 * 1000, Date.now() - arrivedAt),
    });
    arrivedAt = Date.now();
  }
  void flush();
}

/** Wires the page-lifecycle listeners. Safe to call more than once. */
let installed = false;
export function installUsagelisteners() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  // visibilitychange is the only lifecycle event that fires reliably on mobile;
  // beforeunload does not fire when a phone browser is backgrounded.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushUsage();
  });
}
