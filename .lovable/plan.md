# Account Section Build Plan

## Database (migration)

**Extend `profiles`**: add `npn_number text`, `date_of_birth date`, `gender text`, `ssn_encrypted text` (pgsodium), `street_address`, `city`, `state_code char(2)`, `zip_code`, `agent_slug text unique`, `google_oauth_connected bool`. (Many may already exist; ALTER IF NOT EXISTS pattern.)

**New tables** (all RLS: agent owns rows, admin full, upline read-only where relevant):
- `producer_documents` (agent_id, doc_type, file_url, file_name, metadata jsonb, start_date, expiration_date, uploaded_at) — already exists per `agent_completion`; extend if needed.
- `background_questions` (agent_id, question_number, answer bool, explanation text, updated_at) — unique(agent_id, question_number).
- `producer_agreements` (agent_id unique, signature_name, signed_date, agreement_version, signature_image_url, pdf_url).
- `agent_landing_pages` (agent_id unique, published bool, contact_email, contact_phone, custom_message, specialties jsonb, carriers jsonb, licensed_states jsonb, updated_at).
- `faq_items` (id, section, question, answer, sort_order) — public read, admin write. Seed with ~15 items.

**Storage bucket**: `agent-documents` (private). RLS: agents read/write under `{agent_id}/...` path; admins read all.

**SSN encryption**: pgsodium extension. Create `ssn_set(agent_id, ssn text)` and `ssn_reveal(agent_id)` SECURITY DEFINER functions using pgsodium key. Reveal writes to `ssn_audit_log` (agent_id, revealed_by, revealed_at).

**Slug generation**: trigger on profiles insert/update to populate `agent_slug` from name with numeric suffix on conflict.

## Server functions (`src/lib/account.functions.ts`)

All `requireSupabaseAuth`:
- `getProducerProfile` — returns profile + docs metadata + bg questions + agreement + completion %. SSN always masked (`***-**-NNNN`).
- `updateProducerProfile(input)` — Zod-validated patch of profile fields (no SSN).
- `setSsn(ssn)` — calls `ssn_set` RPC, stores last4 in profile for masking.
- `revealSsn()` — calls `ssn_reveal`, returns plain SSN once; logs audit.
- `uploadDocument({ doc_type, file_path, metadata, start_date, expiration_date })` — inserts/upserts `producer_documents`, file already uploaded client-side to bucket via signed upload.
- `getDocumentSignedUrl(doc_id)` — 1h signed URL.
- `saveBackgroundQuestions(answers[])`.
- `signProducerAgreement(name)` — renders typed-name as PNG (jsPDF/canvas server-side using `@napi-rs/canvas` is not Worker-safe; instead generate SVG → store as `.svg` in bucket), creates PDF link placeholder; row inserted with signature_name + signed_date.
- `getLandingPage` / `saveLandingPage(input)` / `togglePublished(bool)`.
- `generateBioAi({ context })` — calls Lovable AI gateway (gemini-3-flash-preview) with system prompt; returns 2-3 sentence bio.
- `searchFaq(q)` — returns all items (client filters); admin: `upsertFaqItem`.

**Public server route** `src/routes/api/public/landing-lead.ts` — POST: validates payload, looks up agent by slug, inserts `clients` row (stage='new', temperature='warm', agent_id=agent), inserts notification. Rate-limited via simple per-IP check.

## Routes

**Authenticated (under `_authenticated/account/`)**:
- `producer-profile.tsx` — header with completion ring (SVG), 3 tabs (shadcn Tabs):
  - **Profile Information**: collapsible Accordion sections (Personal, Address, Contact, E&O, Banking, DL, AML, User Account, Signed Agreement). Each section: read mode → Edit pencil → inline fields. SSN show-reveal button (10s timer, audit). Document uploads use direct Supabase Storage upload then call `uploadDocument`. Sticky Save Changes bar.
  - **Background Questions**: 7 Y/N radio groups with conditional textarea, Save button.
  - **Integrations**: 5 display-only cards (Google Calendar, Outlook, Zapier, Twilio, Stripe) with "Coming soon" toast on Connect.
- `my-landing-page.tsx` — Published toggle (instant save), live URL + copy, Preview opens Sheet rendering same component as public page, Save button. Form sections: Contact, Profile Photo upload, Custom Message (500 char) + Generate with AI modal, What I Help With checkboxes, Carriers checkboxes (sorted alpha), States Licensed In chip grid + Select All.
- `faq.tsx` — Search input, accordion grouped by section, client-side filter.
- `help.tsx` — Simple page with link to external help center + embedded contact info.

**Public**:
- `src/routes/myagent.$agentSlug.tsx` — public landing page rendering agent profile + lead form. Loader calls public server fn `getPublicLandingPage(slug)` (uses supabaseAdmin, returns only safe fields). Form POSTs to `/api/public/landing-lead`.

## Sidebar

Add "Account" group with 4 entries (Help Center, FAQ, Producer Profile, My Landing Page).

## Components

- `<CompletionRing pct={n} />` — animated SVG ring.
- `<MaskedField>` — generic show/hide with timer + audit callback.
- `<DocumentUploadField>` — handles bucket upload + signed URL view button.
- `<StateChipGrid>` — 51 states toggle grid, mobile collapses to multi-select.
- `<LandingPagePreview>` — pure component reused by Preview modal and public route.

## Out of scope (v1)

- Real OAuth flows (Google Calendar/Outlook/Zapier).
- E&O/Banking/DL/AML are stored with metadata; no carrier-side verification.
- Generated signed agreement PDF — store typed name + date only; "Download PDF" generates client-side via jsPDF on click.
- Photo cropping UI — accept square upload, no crop tool.
- Profile photo bucket separate from documents; reuse `agent-documents` under `{agent_id}/avatar/`.

## Verification

After build: load `/account/producer-profile`, complete a section, upload a doc, reveal SSN (check audit row), toggle landing page published, view public `/myagent/{slug}`, submit lead, confirm client+notification created.
