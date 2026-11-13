-- Per-user onboarding progress. This is additive and does not alter profile, chat, call, or coin data.
create table if not exists public.onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  current_step text not null default 'profile_photo',
  completed_steps text[] not null default '{}',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint onboarding_progress_step_check check (
    current_step in ('profile_photo','discover','random_call','conversation','coins','safety','complete')
  )
);

alter table public.onboarding_progress enable row level security;

drop policy if exists "Users can read own onboarding progress" on public.onboarding_progress;
create policy "Users can read own onboarding progress"
  on public.onboarding_progress for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own onboarding progress" on public.onboarding_progress;
create policy "Users can insert own onboarding progress"
  on public.onboarding_progress for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own onboarding progress" on public.onboarding_progress;
create policy "Users can update own onboarding progress"
  on public.onboarding_progress for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists onboarding_progress_updated_at_idx
  on public.onboarding_progress (updated_at desc);

-- The table is exposed through the Data API only to authenticated users; RLS scopes rows to auth.uid().
grant select, insert, update on public.onboarding_progress to authenticated;
