-- Anonymous app-session presence for the Operator Realtime monitor.
-- Only authenticated clients can publish/read presence on this exact private topic.
-- Presence payloads contain no user IDs or profile information.
drop policy if exists "authenticated can read operator session presence" on realtime.messages;
create policy "authenticated can read operator session presence"
on realtime.messages
for select
to authenticated
using (extension = 'presence' and realtime.topic() = 'operator-session-monitor');

drop policy if exists "authenticated can publish operator session presence" on realtime.messages;
create policy "authenticated can publish operator session presence"
on realtime.messages
for insert
to authenticated
with check (extension = 'presence' and realtime.topic() = 'operator-session-monitor');
