-- Invite links: add reusable link support
alter table public.invitation_links
  add column if not exists link_name text,
  add column if not exists is_reusable boolean not null default false;

-- Update get_invite_by_token to include new fields
create or replace function public.get_invite_by_token(_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_invite public.invitation_links%rowtype;
  v_upline record;
begin
  select * into v_invite from public.invitation_links where token = _token;
  if not found then return null; end if;
  if v_invite.expires_at < now() then
    return jsonb_build_object('expired', true, 'token', _token);
  end if;
  select first_name, last_name into v_upline from public.profiles where id = v_invite.created_by;
  return jsonb_build_object(
    'id', v_invite.id,
    'token', v_invite.token,
    'status', v_invite.status,
    'onboarding_step', v_invite.onboarding_step,
    'linked_agent_id', v_invite.linked_agent_id,
    'new_agent_email', v_invite.new_agent_email,
    'new_agent_first_name', v_invite.new_agent_first_name,
    'new_agent_last_name', v_invite.new_agent_last_name,
    'link_name', v_invite.link_name,
    'is_reusable', v_invite.is_reusable,
    'carrier_assignments', v_invite.carrier_assignments,
    'upline_name', coalesce(v_upline.first_name || ' ' || v_upline.last_name, ''),
    'created_by', v_invite.created_by,
    'expires_at', v_invite.expires_at
  );
end;
$$;
