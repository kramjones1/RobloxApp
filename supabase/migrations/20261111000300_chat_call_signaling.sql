-- LivMe private one-to-one audio/video call signaling.
-- Applied to Supabase project btkcubibosbtpxcronnd.
-- Media remains peer-to-peer; Realtime carries only invitations and WebRTC signaling.
-- Only participants in an existing chat conversation can read or publish these signals.

drop policy if exists "chat participants can read private call signals" on realtime.messages;
create policy "chat participants can read private call signals"
on realtime.messages
for select
to authenticated
using (
  case
    when realtime.topic() ~ '^chat-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then extension = 'broadcast'
      and auth.uid() in (
        split_part(realtime.topic(), ':', 2)::uuid,
        split_part(realtime.topic(), ':', 3)::uuid
      )
      and exists (
        select 1 from public.chat_messages cm
        where least(cm.sender_id, cm.receiver_id) =
          least(split_part(realtime.topic(), ':', 2)::uuid, split_part(realtime.topic(), ':', 3)::uuid)
          and greatest(cm.sender_id, cm.receiver_id) =
          greatest(split_part(realtime.topic(), ':', 2)::uuid, split_part(realtime.topic(), ':', 3)::uuid)
      )
    else false
  end
);

drop policy if exists "chat participants can publish private call signals" on realtime.messages;
create policy "chat participants can publish private call signals"
on realtime.messages
for insert
to authenticated
with check (
  case
    when realtime.topic() ~ '^chat-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then extension = 'broadcast'
      and auth.uid() in (
        split_part(realtime.topic(), ':', 2)::uuid,
        split_part(realtime.topic(), ':', 3)::uuid
      )
      and exists (
        select 1 from public.chat_messages cm
        where least(cm.sender_id, cm.receiver_id) =
          least(split_part(realtime.topic(), ':', 2)::uuid, split_part(realtime.topic(), ':', 3)::uuid)
          and greatest(cm.sender_id, cm.receiver_id) =
          greatest(split_part(realtime.topic(), ':', 2)::uuid, split_part(realtime.topic(), ':', 3)::uuid)
      )
    else false
  end
);
