-- ---------------------------------------------------------------------------
-- THE BRAND NAME COMES OUT OF THE SEEDED RESOURCES
--
-- Two rows seeded by `20260611010000_seed_handbook_scripts_academy.sql` name
-- the old import provider in text agents actually read: a handbook section
-- under Technology & Tools, and the Agent Cloud Walkthrough course blurb.
-- Editing that migration would change nothing — it has already run.
--
-- These are surgical `replace()` calls rather than whole-row rewrites, for
-- two reasons. Agencies can fork these rows (see
-- `20260802150000_agency-resources.sql`), and a fork may carry local edits
-- that a rewrite would silently discard. And a replace that finds nothing is
-- a no-op, so this is safe to re-run and safe on a database whose copy has
-- already drifted.
--
-- Scoped to the text, not to an organization: a fork inherits the wording, so
-- the mention has to come out of every copy.
-- ---------------------------------------------------------------------------

update public.handbook_sections
   set content_html = replace(
         replace(
           content_html,
           '<h3>AgentLink (Legacy)</h3>',
           '<h3>Importing From a Previous Platform</h3>'
         ),
         'If you are transitioning from another agency that used AgentLink/InsuraCloud, you can import your entire book of business into Agent Cloud using the Import from AgentLink feature on your Pipeline page.',
         'If you are transitioning from another agency, you can import your entire book of business into Agent Cloud using the Book Import feature on your Pipeline page.'
       )
 where content_html like '%AgentLink%';

update public.academy_courses
   set description = replace(
         description,
         'importing your existing book from AgentLink.',
         'importing your existing book from a previous platform.'
       )
 where description like '%AgentLink%';

-- Anything still holding the name after the two targeted replacements is
-- agency-authored text this migration has no business rewriting. Nothing to
-- do here but leave it alone.
