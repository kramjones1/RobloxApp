-- Unified, user-scoped online presence.
-- Any authenticated user may read a user's presence topic; only the owner
-- identified by auth.uid() may publish to that user's topic.
-- Each browser tab uses a separate server-generated Presence key.

-- Retire the old conversation-scoped presence rules; call signaling remains separate.
drop policy if exists "chat participants can read conversation presence" on realtime.messages;
drop policy if exists "chat participants can publish conversation presence" on realtime.messages;

drop policy if exists "authenticated can read user presence" on realtime.messages;
create policy "authenticated can read user presence"
on realtime.messages
for select
to authenticated
using (
  case
    when realtime.topic() ~ '^user-presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then extension = 'presence'
    else false
  end
);

drop policy if exists "users can publish own presence" on realtime.messages;
create policy "users can publish own presence"
on realtime.messages
for insert
to authenticated
with check (
  case
    when realtime.topic() ~ '^user-presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then extension = 'presence'
      and auth.uid() = split_part(realtime.topic(), ':', 2)::uuid
    else false
  end
);
