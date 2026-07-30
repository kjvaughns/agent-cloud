-- ---------------------------------------------------------------------------
-- Backfill producer_documents.organization_id.
--
-- The column was added with the contracting-ops work, but the two paths that
-- actually create documents — the producer profile upload and the annuity
-- certificate — never set it. Every document uploaded by an agent therefore
-- carries a NULL org, which makes it invisible to anything that scopes by
-- organization: the staff review queue counts, the dashboard work queue, and
-- the index on (organization_id, review_status) it was all meant to serve.
--
-- The agent's own organization is the correct owner: producer_documents.agent_id
-- is the person the document belongs to, and a document follows its producer.
-- ---------------------------------------------------------------------------

update public.producer_documents d
   set organization_id = p.organization_id
  from public.profiles p
 where d.agent_id = p.id
   and d.organization_id is null
   and p.organization_id is not null;
