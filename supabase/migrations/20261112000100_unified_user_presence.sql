-- Unified, user-scoped online presence.
-- Any authenticated user may read a user's presence topic; only the owner
-- identified by auth.uid() may publish to that user's topic.
-- Each browser tab uses a separate server-generated Presence key.

-- Retire the old conversation-scoped presence rules.
drop policy if exists "chat participants can read conversation presence" on realtime.messages;
drop policy if exists "chat participants can publish conversation presence" on realtime.messages;

drop policy if exists "authenticated can read user presence" on realtime.messages;
create policy "authenticated can read user presence"
on realtime.messages
for select
to authenticated
using (
  extension = 'presence'
  and realtime.topic() ~* '^user-presence:[0-9a-f-]{36}$'
);

drop policy if exists "users can publish own presence" on realtime.messages;
create policy "users can publish own presence"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'presence'
  and realtime.topic() ~* '^user-presence:[0-9a-f-]{36}$'
  and auth.uid()::text = lower(split_part(realtime.topic(), ':', 2))
);

-- Keep private call signaling authorization separate, but avoid UUID casts
-- from topic strings. Realtime evaluates these policies while probing channel
-- permissions, and cast failures here can prevent unrelated presence joins.
drop policy if exists "chat participants can publish private call signals" on realtime.messages;
create policy "chat participants can publish private call signals"
on realtime.messages
for insert
to authenticated
with check (
  case
    when realtime.topic() ~ '^chat-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then extension = 'broadcast'
      and auth.uid()::text = any (array[
        split_part(realtime.topic(), ':', 2),
        split_part(realtime.topic(), ':', 3)
      ])
      and exists (
        select 1
        from chat_messages cm
        where (
          cm.sender_id::text = split_part(realtime.topic(), ':', 2)
          and cm.receiver_id::text = split_part(realtime.topic(), ':', 3)
        ) or (
          cm.sender_id::text = split_part(realtime.topic(), ':', 3)
          and cm.receiver_id::text = split_part(realtime.topic(), ':', 2)
        )
      )
    else false
  end
);

drop policy if exists "chat participants can read private call signals" on realtime.messages;
create policy "chat participants can read private call signals"
on realtime.messages
for select
to authenticated
using (
  case
    when realtime.topic() ~ '^chat-call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then auth.uid()::text = any (array[
      split_part(realtime.topic(), ':', 2),
      split_part(realtime.topic(), ':', 3)
    ])
    and exists (
      select 1
      from chat_messages cm
      where (
        cm.sender_id::text = split_part(realtime.topic(), ':', 2)
        and cm.receiver_id::text = split_part(realtime.topic(), ':', 3)
      ) or (
        cm.sender_id::text = split_part(realtime.topic(), ':', 3)
        and cm.receiver_id::text = split_part(realtime.topic(), ':', 2)
      )
    )
    else false
  end
);
