# Rebuild "Build your agency" as two cinematic journeys

## What changes for the visitor

**1. Choose your path (first screen)**
Full-screen split choice with motion: "I'm an agent" vs "I run an agency". Hovering one side expands it and plays a short looping scene (agent: a single book of business filling up; agency: a team org chart growing). Picking one sets the plan (Agent = Solo $199, Agency = $999) and the theme of every screen after.

**2. Create your account right away (second screen)**
Name, email, password (or Google). Framed as "Save your progress" so it feels like part of the build, not a gate. From here every answer saves to their account, so they can leave and resume on any device.

**3. Path-specific build steps**
- Agent path: your name and photo, licensed states, carriers you write with, monthly production goal, upload a few documents (license, E&O). Ends with "Your book is ready".
- Agency path: agency name, logo and brand color, team size and invite your first agents, carriers and hierarchy, production goal, documents, Agency Suite activation (Licensing, Bankdocs, Release Center, Academy). Ends with "Your agency is ready".

**4. The experience layer**
- Each step is a full scene with smooth page transitions, staggered text reveals, gold particle accents and a live preview that visibly assembles (cards fly in, numbers count up, logo drops onto a dashboard).
- A persistent progress "constellation" at the top that lights up as steps finish.
- Cinematic build screen with sequenced loading lines tailored to the path, then a reveal of their real dashboard preview, then checkout.
- Respects reduced-motion settings; works on phone first.

**5. Emails that match their path**
- Welcome email right after account creation, worded for agent or agency, with a "Continue building" link back to their exact step.
- One reminder if they leave setup unfinished for 24 hours, worded for their path and step.
- Payment confirmation and "you're live" email worded for their path.
- Allison's replies also know which path they chose.

## Technical details
- New `onboarding_sessions` table (user_id, path, current_step, answers jsonb, completed_at) with owner-only RLS; replaces localStorage progress. Workspace created at account step via initSoloWorkspace; applyBuilderSetup runs per step.
- Real document uploads to a private storage bucket (fixes current filename-only limitation).
- Animations with `motion` (Framer Motion) plus CSS; split `/start` into step components under `src/components/start/` with separate agent/agency step lists.
- New templates `onboarding-welcome`, `onboarding-resume`, `onboarding-live` with a `path` prop; resume nudge sent by the existing 5-minute cron, once per user (idempotency key per user).
- Update `src/lib/onboarding/setup.ts`, Allison knowledge, AGENTS.md rule for the single signup path.
- Verify end-to-end in the browser both paths through account creation, build, reveal and test checkout.
