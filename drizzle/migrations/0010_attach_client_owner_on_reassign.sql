-- Imported books are claimed by setting clients.agent_id after the fact, so the
-- attachment has to follow a reassignment, not only an insert.
CREATE TRIGGER clients_attach_owner_on_update
AFTER UPDATE OF agent_id ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.attach_owner_to_client();