-- LivMe text-only profile posts. No Storage bucket or media columns are created.
create table if not exists public.chat_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  content text not null,
  created_at timestamptz not null default now(),
  constraint chat_posts_content_length check (char_length(btrim(content)) between 1 and 500)
);

create index if not exists chat_posts_user_created_idx
  on public.chat_posts (user_id, created_at desc);

alter table public.chat_posts enable row level security;

revoke all on table public.chat_posts from anon, authenticated;
grant select, insert, delete on table public.chat_posts to authenticated;

drop policy if exists "Signed-in users can read profile posts" on public.chat_posts;
create policy "Signed-in users can read profile posts"
  on public.chat_posts for select
  to authenticated
  using (true);

drop policy if exists "Users can create their own profile posts" on public.chat_posts;
create policy "Users can create their own profile posts"
  on public.chat_posts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own profile posts" on public.chat_posts;
create policy "Users can delete their own profile posts"
  on public.chat_posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);
