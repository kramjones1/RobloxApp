-- Apply this script to the STAGING Supabase project before testing chat attachments.
-- Private storage: only the two participants in a conversation can read its files.
alter table public.chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size bigint;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 15728640, null)
on conflict (id) do update
set public = false,
    file_size_limit = 15728640,
    allowed_mime_types = null;

drop policy if exists "Chat participants upload attachments" on storage.objects;
create policy "Chat participants upload attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] is not null
);

drop policy if exists "Chat participants read attachments" on storage.objects;
create policy "Chat participants read attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-attachments'
  and exists (
    select 1
    from public.chat_messages m
    where m.attachment_path = storage.objects.name
      and (m.sender_id = (select auth.uid()) or m.receiver_id = (select auth.uid()))
  )
);

drop policy if exists "Senders delete own chat attachments" on storage.objects;
create policy "Senders delete own chat attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
