-- ---------------------------------------------------------------------------
-- ONE VOCABULARY FOR producer_documents.doc_type
--
-- `producer_documents.doc_type` has no CHECK constraint, so it accumulated two
-- vocabularies that nothing ever reconciled:
--
--   Producer Profile wrote   background_check, other
--   the ops review queue     background_questionnaire, other_document
--     expects
--
-- `DOCUMENT_REQUIREMENTS` is the dictionary the queue renders labels from, so a
-- document uploaded by an agent showed up in review as the raw string
-- `background_check` — and the readiness check that looks for a background
-- questionnaire never found one, because the only screen that could produce it
-- wrote a different word.
--
-- Worse in the other direction: Producer Profile had no `pdb_report` category
-- at all. The review queue lists it first, and there was no way for an agent to
-- upload it.
--
-- The code now writes the queue's names. This renames what is already stored,
-- so existing uploads stop rendering as raw strings.
--
-- Deliberately narrow. `eo`, `banking`, `agreement` and `drivers_license` are
-- also outside the dictionary and are NOT touched here: `eo` is compensated for
-- by hand in two readers (`["eo","eo_certificate"]`), and `banking` gates a
-- step on the resources page. Renaming those changes behaviour rather than
-- fixing a mismatch, and is a separate decision.
-- ---------------------------------------------------------------------------

-- The rename is skipped for any agent who already holds the target type, so a
-- pair of rows cannot collapse into one. `upsertProducerDocument` looks the
-- type up with `.maybeSingle()`, which errors on multiple rows — turning a
-- collision here into an upload that fails for that agent forever.
update public.producer_documents d
   set doc_type = 'background_questionnaire'
 where d.doc_type = 'background_check'
   and not exists (
     select 1 from public.producer_documents o
      where o.agent_id = d.agent_id
        and o.doc_type = 'background_questionnaire'
   );

update public.producer_documents d
   set doc_type = 'other_document'
 where d.doc_type = 'other'
   and not exists (
     select 1 from public.producer_documents o
      where o.agent_id = d.agent_id
        and o.doc_type = 'other_document'
   );

-- Anything left is a genuine duplicate: the agent holds both spellings. Keep
-- the newer row under the new name and retire the older one rather than
-- deleting it, so nothing an agent uploaded disappears.
update public.producer_documents d
   set doc_type = 'background_check_superseded',
       review_status = 'superseded'
 where d.doc_type = 'background_check';

update public.producer_documents d
   set doc_type = 'other_superseded',
       review_status = 'superseded'
 where d.doc_type = 'other';

notify pgrst, 'reload schema';
