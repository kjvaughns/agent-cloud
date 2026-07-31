-- ---------------------------------------------------------------------------
-- Starred pages.
--
-- The sidebar is composed per role and deliberately short, and the command
-- palette is the way back to everything else. Neither of those lets somebody
-- say "this one page is the one I open twenty times a day". This does.
--
-- Stored per person rather than in localStorage: a favourite is worth keeping
-- across a laptop and a phone, and losing it to a cleared browser would be
-- annoying in a way a collapsed nav group is not.
--
-- page_id is the id from src/lib/navigation.ts, not a path. Paths move — this
-- session alone merged four of them — and a favourite should survive a page
-- being renamed or relocated. An id that no longer exists is simply ignored
-- when the list is rendered, so nothing breaks if a page is retired.
-- ---------------------------------------------------------------------------

create table if not exists public.user_page_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  page_id    text not null check (char_length(page_id) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (profile_id, page_id)
);

alter table public.user_page_favorites enable row level security;

-- Yours and nobody else's. There is no reason for an admin to read these, and
-- no reason for anybody to write another person's.
drop policy if exists user_page_favorites_own on public.user_page_favorites;
create policy user_page_favorites_own on public.user_page_favorites
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create index if not exists idx_user_page_favorites_profile
  on public.user_page_favorites(profile_id);
