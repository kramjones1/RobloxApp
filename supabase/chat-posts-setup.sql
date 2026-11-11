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

-- Keep storage bounded: retain only each user's newest 100 text posts.
create or replace function public.trim_chat_posts_to_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.chat_posts
  where user_id = new.user_id
    and id not in (
      select id
      from public.chat_posts
      where user_id = new.user_id
      order by created_at desc, id desc
      offset 100
    );
  return new;
end;
$$;

drop trigger if exists chat_posts_keep_latest_100 on public.chat_posts;
create trigger chat_posts_keep_latest_100
  after insert on public.chat_posts
  for each row execute function public.trim_chat_posts_to_limit();

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
