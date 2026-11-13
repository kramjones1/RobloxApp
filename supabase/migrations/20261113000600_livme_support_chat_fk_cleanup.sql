alter table public.support_conversations
  drop constraint if exists support_conversations_user_id_fkey;
alter table public.support_conversations
  add constraint support_conversations_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.support_messages
  drop constraint if exists support_message_sender_check;
alter table public.support_messages
  add constraint support_message_sender_check
  check (
    (sender_type = 'guest' and sender_user_id is null)
    or sender_type in ('user','operator')
  );

create index if not exists support_messages_sender_user_id_idx
  on public.support_messages(sender_user_id)
  where sender_user_id is not null;
