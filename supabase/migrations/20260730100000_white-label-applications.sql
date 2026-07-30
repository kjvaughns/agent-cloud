-- ============================================================================
-- WHITE LABEL APPLICATIONS
--
--   White Label is not a self-serve purchase: it needs a domain, DNS records,
--   brand assets and a setup conversation. Sending an agency straight to
--   Stripe took their money before anyone had confirmed the domain was even
--   available. This is the application that comes first.
--
-- Run after 20260729100000_discord-integration.sql.
-- ============================================================================

create table if not exists public.white_label_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- What they want it to look like.
  brand_name text not null,
  tagline text,
  desired_domain text,
  accent_color text,
  logo_url text,

  -- Context for the setup call.
  agent_count text,
  timeline text,
  notes text,

  status text not null default 'submitted'
    check (status in ('submitted','in_review','approved','live','declined','withdrawn')),
  review_notes text,

  submitted_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live application per agency. A withdrawn or declined one can be
-- superseded, which is why the index is partial rather than a plain unique.
create unique index if not exists idx_white_label_one_open
  on public.white_label_applications(organization_id)
  where status in ('submitted','in_review','approved');

create index if not exists idx_white_label_status
  on public.white_label_applications(status, created_at desc);

alter table public.white_label_applications enable row level security;

-- The agency sees its own application; platform staff see all of them.
drop policy if exists white_label_applications_read on public.white_label_applications;
create policy white_label_applications_read on public.white_label_applications
  for select to authenticated
  using (
    public.is_platform_admin()
    or (organization_id in (select public.my_org_ids()) and public.is_org_owner(organization_id))
  );

-- Only the agency owner applies, and only for their own agency.
drop policy if exists white_label_applications_insert on public.white_label_applications;
create policy white_label_applications_insert on public.white_label_applications
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and public.is_org_owner(organization_id)
  );

-- The owner may withdraw or edit their own while it is still open. Moving an
-- application to approved, live or declined is a platform decision, so those
-- transitions are service-role only.
drop policy if exists white_label_applications_update on public.white_label_applications;
create policy white_label_applications_update on public.white_label_applications
  for update to authenticated
  using (
    public.is_org_owner(organization_id)
    and status in ('submitted','in_review')
  )
  with check (
    public.is_org_owner(organization_id)
    and status in ('submitted','in_review','withdrawn')
  );

create or replace function public.touch_white_label_application()
returns trigger language plpgsql set search_path = public
as $$ begin NEW.updated_at := now(); return NEW; end $$;

drop trigger if exists trg_touch_white_label on public.white_label_applications;
create trigger trg_touch_white_label
  before update on public.white_label_applications
  for each row execute function public.touch_white_label_application();
