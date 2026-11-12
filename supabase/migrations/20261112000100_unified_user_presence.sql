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
