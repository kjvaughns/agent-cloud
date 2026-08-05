/**
 * Guided tours, on driver.js.
 *
 * ── Why driver.js ───────────────────────────────────────────────────────────
 *
 * 5KB gzipped, MIT, no runtime dependencies. The alternatives were rejected
 * for reasons worth writing down so nobody re-opens the question:
 *
 * - **Intro.js is AGPL v3.** For a commercial SaaS that is not a licence
 *   quibble, it is a genuine problem — and its React wrapper is unmaintained.
 * - **Userflow, Appcues, Userpilot price on monthly active users.** Every seat
 *   an agency invites would be a bill from a vendor. That is a tax on the one
 *   number this product wants to grow.
 *
 * ── Two rules about when tours run ──────────────────────────────────────────
 *
 * **Never auto-play.** A tour launched from a checklist item the person chose
 * completes far more often than one that ambushes them on first login, and an
 * ambush is also just rude — they came to do something.
 *
 * **Five steps, hard cap.** Enforced in code below rather than left to
 * discipline, because tours grow. A visible progress counter goes with it.
 */

import type { DriveStep } from "driver.js";

export type TourId = "carriers" | "import" | "team" | "contracting-ops" | "pipeline";

/** Hard cap. A tour is an introduction, not a manual. */
export const MAX_TOUR_STEPS = 5;

/**
 * Steps are keyed to `data-tour` attributes rather than CSS classes.
 *
 * A class is a styling decision and gets refactored without a thought; a
 * `data-tour` attribute announces that something depends on it. Tours that
 * silently stop highlighting anything are the standard way this feature rots.
 */
export const TOURS: Record<TourId, { title: string; steps: DriveStep[] }> = {
  carriers: {
    title: "Carriers",
    steps: [
      {
        element: '[data-tour="carrier-list"]',
        popover: {
          title: "Your carriers, not a catalogue",
          description:
            "Only the carriers your agency actually writes appear here — and everywhere else in the product, including every dropdown.",
        },
      },
      {
        element: '[data-tour="carrier-add"]',
        popover: {
          title: "Add one",
          description: "Name, products and how you submit to them. The submission method is what stops the guessing later.",
        },
      },
      {
        element: '[data-tour="carrier-comp"]',
        popover: {
          title: "Comp levels live here too",
          description: "What each level pays. Commissions are computed from these numbers, so an owner can check one against the other.",
        },
      },
    ],
  },

  import: {
    title: "Import",
    steps: [
      {
        element: '[data-tour="import-drop"]',
        popover: {
          title: "Drop in anything",
          description: "A book of business, a comp grid, a carrier statement. It works out what the file is.",
        },
      },
      {
        element: '[data-tour="import-review"]',
        popover: {
          title: "Nothing saves until you say so",
          description: "Every row is matched against what you already have and shown to you first. Duplicates are flagged, not merged behind your back.",
        },
      },
    ],
  },

  team: {
    title: "Your team",
    steps: [
      {
        element: '[data-tour="team-roster"]',
        popover: {
          title: "Everyone, and where they are stuck",
          description: "Ready to sell, waiting on a carrier, or missing a document — at a glance rather than by asking.",
        },
      },
      {
        element: '[data-tour="team-alerts"]',
        popover: {
          title: "What needs you",
          description: "Licences about to expire, agents who have gone quiet, contracting that has stalled. This is the list worth reading on a Monday.",
        },
      },
    ],
  },

  "contracting-ops": {
    title: "Today's work",
    steps: [
      {
        element: '[data-tour="queue-list"]',
        popover: {
          title: "What is waiting on somebody",
          description: "Oldest first, overdue in red. This is the whole back office in one list.",
        },
      },
      {
        element: '[data-tour="queue-filters"]',
        popover: {
          title: "Narrow it",
          description: "By carrier, by agent, by what is blocking it. The counts on the overview link straight into these.",
        },
      },
    ],
  },

  pipeline: {
    title: "Pipeline",
    steps: [
      {
        element: '[data-tour="pipeline-board"]',
        popover: {
          title: "Drag between stages",
          description: "New, callback, almost there, sold. Where a client sits is the one thing that has to stay current.",
        },
      },
      {
        element: '[data-tour="pipeline-add"]',
        popover: {
          title: "Add a client",
          description: "Or import a list. A client here becomes a policy without retyping anything.",
        },
      },
    ],
  },
};

/**
 * Run a tour.
 *
 * Imports driver.js on demand: it is 5KB, but it is 5KB nobody who never opens
 * a tour should download, and this is called from a click either way.
 *
 * Returns a promise that resolves when the tour ends — completed or abandoned
 * — so the caller can record it. Abandoning still counts as seen; re-showing a
 * tour somebody walked away from is how a helpful feature becomes an annoying
 * one.
 */
export async function runTour(id: TourId): Promise<void> {
  const config = TOURS[id];
  if (!config) return;

  const { driver } = await import("driver.js");
  await import("driver.js/dist/driver.css");

  const steps = config.steps.slice(0, MAX_TOUR_STEPS);

  // A step whose element is not on the page would render a popover pinned to
  // nothing. Filtering first means a tour degrades to its remaining steps
  // rather than looking broken.
  const present = steps.filter((s) =>
    typeof s.element === "string" ? document.querySelector(s.element) : true,
  );
  if (present.length === 0) return;

  return new Promise((resolve) => {
    const d = driver({
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      allowClose: true,
      overlayOpacity: 0.6,
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      steps: present,
      onDestroyed: () => resolve(),
    });
    d.drive();
  });
}
