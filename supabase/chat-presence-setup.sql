-- LivMe conversation-scoped online chat-head presence.
-- Review and apply ONLY to the existing Supabase project after explicit approval.
-- This does not create tables or store online status; Realtime Presence is ephemeral.
--
-- Each topic is: chat-presence:<lower-user-uuid>:<higher-user-uuid>
-- A user may join only a topic for a pair where they are one participant
-- and a chat_messages row already exists between the two users.

drop policy if exists "chat participants can read conversation presence" on realtime.messages;
create policy "chat participants can read conversation presence"
on realtime.messages
for select
to authenticated
using (
  case
    when realtime.topic() ~ '^chat-presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then
      extension = 'presence'
      and auth.uid() in (
        split_part(realtime.topic(), ':', 2)::uuid,
        split_part(realtime.topic(), ':', 3)::uuid
      )
      and exists (
        select 1
        from public.chat_messages as cm
        where least(cm.sender_id, cm.receiver_id) =
          least(
            split_part(realtime.topic(), ':', 2)::uuid,
            split_part(realtime.topic(), ':', 3)::uuid
          )
          and greatest(cm.sender_id, cm.receiver_id) =
          greatest(
            split_part(realtime.topic(), ':', 2)::uuid,
            split_part(realtime.topic(), ':', 3)::uuid
          )
      )
    else false
  end
);

drop policy if exists "chat participants can publish conversation presence" on realtime.messages;
create policy "chat participants can publish conversation presence"
on realtime.messages
for insert
to authenticated
with check (
  case
    when realtime.topic() ~ '^chat-presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then
      extension = 'presence'
      and auth.uid() in (
        split_part(realtime.topic(), ':', 2)::uuid,
        split_part(realtime.topic(), ':', 3)::uuid
      )
      and exists (
        select 1
        from public.chat_messages as cm
        where least(cm.sender_id, cm.receiver_id) =
          least(
            split_part(realtime.topic(), ':', 2)::uuid,
            split_part(realtime.topic(), ':', 3)::uuid
          )
          and greatest(cm.sender_id, cm.receiver_id) =
          greatest(
            split_part(realtime.topic(), ':', 2)::uuid,
            split_part(realtime.topic(), ':', 3)::uuid
          )
      )
    else false
  end
);
