-- Per-user conversation hiding. Messages are preserved for the other participant.
create table public.chat_conversation_hides (
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  constraint chat_conversation_hides_not_self check (user_id <> partner_id)
);

alter table public.chat_conversation_hides enable row level security;
grant select, insert, update, delete on public.chat_conversation_hides to authenticated;

create policy "Users can view their hidden conversations"
on public.chat_conversation_hides for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can hide their own conversations"
on public.chat_conversation_hides for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their hidden conversations"
on public.chat_conversation_hides for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can unhide their own conversations"
on public.chat_conversation_hides for delete to authenticated
using ((select auth.uid()) = user_id);

create index chat_conversation_hides_partner_idx
on public.chat_conversation_hides (partner_id);
