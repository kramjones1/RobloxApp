create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_name text,
  guest_email text,
  guest_token_hash text,
  subject text not null default 'General inquiry',
  status text not null default 'open' check (status in ('open','pending','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint support_conversation_identity_check check (
    (user_id is not null and guest_name is null and guest_email is null and guest_token_hash is null)
    or (user_id is null and guest_name is not null and guest_email is not null and guest_token_hash is not null)
  ),
  constraint support_subject_length check (char_length(btrim(subject)) between 1 and 120),
  constraint support_guest_name_length check (guest_name is null or char_length(btrim(guest_name)) between 1 and 80),
  constraint support_guest_email_length check (guest_email is null or char_length(btrim(guest_email)) between 3 and 254)
);
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('user','guest','operator')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint support_message_sender_check check (
    (sender_type in ('user','operator') and sender_user_id is not null)
    or (sender_type = 'guest' and sender_user_id is null)
  )
);
create index if not exists support_conversations_user_updated_idx on public.support_conversations(user_id, updated_at desc);
create index if not exists support_conversations_status_updated_idx on public.support_conversations(status, updated_at desc);
create index if not exists support_conversations_guest_email_created_idx on public.support_conversations(lower(guest_email), created_at desc) where guest_email is not null;
create index if not exists support_messages_conversation_created_idx on public.support_messages(conversation_id, created_at);
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_conversations from anon, authenticated;
revoke all on public.support_messages from anon, authenticated;
grant select on public.support_conversations to authenticated;
grant select on public.support_messages to authenticated;
drop policy if exists support_conversations_owner_or_admin_read on public.support_conversations;
create policy support_conversations_owner_or_admin_read on public.support_conversations for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists support_messages_owner_or_admin_read on public.support_messages;
create policy support_messages_owner_or_admin_read on public.support_messages for select to authenticated using (exists (select 1 from public.support_conversations c where c.id = support_messages.conversation_id and (c.user_id = (select auth.uid()) or public.is_admin())));
create or replace function public.create_support_conversation(p_subject text, p_message text) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_user_id uuid := auth.uid(); v_conversation_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in to start a support conversation.'; end if;
  if char_length(btrim(coalesce(p_subject,''))) not between 1 and 120 then raise exception 'Enter a subject (up to 120 characters).'; end if;
  if char_length(btrim(coalesce(p_message,''))) not between 1 and 2000 then raise exception 'Message must be between 1 and 2000 characters.'; end if;
  insert into public.support_conversations(user_id, subject) values (v_user_id, btrim(p_subject)) returning id into v_conversation_id;
  insert into public.support_messages(conversation_id, sender_type, sender_user_id, body) values (v_conversation_id, 'user', v_user_id, btrim(p_message));
  return v_conversation_id;
end; $$;
create or replace function public.send_support_message(p_conversation_id uuid, p_message text) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_user_id uuid := auth.uid(); v_message_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in to send a support message.'; end if;
  if char_length(btrim(coalesce(p_message,''))) not between 1 and 2000 then raise exception 'Message must be between 1 and 2000 characters.'; end if;
  if not exists (select 1 from public.support_conversations where id = p_conversation_id and user_id = v_user_id and status <> 'resolved') then raise exception 'This support conversation is unavailable or resolved.'; end if;
  insert into public.support_messages(conversation_id, sender_type, sender_user_id, body) values (p_conversation_id, 'user', v_user_id, btrim(p_message)) returning id into v_message_id;
  update public.support_conversations set updated_at = now(), last_message_at = now(), status = 'open' where id = p_conversation_id;
  return v_message_id;
end; $$;
create or replace function public.create_guest_support_conversation(p_name text, p_email text, p_subject text, p_message text) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid; v_token text; v_email text := lower(btrim(coalesce(p_email,'')));
begin
  if auth.uid() is not null then raise exception 'Use your signed-in support inbox.'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Enter your name (up to 80 characters).'; end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if char_length(btrim(coalesce(p_subject,''))) not between 1 and 120 then raise exception 'Enter a subject (up to 120 characters).'; end if;
  if char_length(btrim(coalesce(p_message,''))) not between 1 and 2000 then raise exception 'Message must be between 1 and 2000 characters.'; end if;
  if (select count(*) from public.support_conversations where user_id is null and lower(guest_email) = v_email and created_at > now() - interval '10 minutes') >= 2 then raise exception 'Please wait a few minutes before opening another guest support request.'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.support_conversations(guest_name, guest_email, guest_token_hash, subject) values (btrim(p_name), v_email, encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), btrim(p_subject)) returning id into v_id;
  insert into public.support_messages(conversation_id, sender_type, body) values (v_id, 'guest', btrim(p_message));
  return jsonb_build_object('conversation_id', v_id, 'access_token', v_token);
end; $$;
create or replace function public.get_guest_support_messages(p_conversation_id uuid, p_access_token text) returns table(id uuid, sender_type text, body text, created_at timestamptz) language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_access_token is null or length(p_access_token) <> 64 then raise exception 'Invalid support access token.'; end if;
  if not exists (select 1 from public.support_conversations c where c.id = p_conversation_id and c.user_id is null and c.guest_token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex')) then raise exception 'This support conversation could not be verified.'; end if;
  return query select m.id, m.sender_type, m.body, m.created_at from public.support_messages m where m.conversation_id = p_conversation_id order by m.created_at asc limit 200;
end; $$;
create or replace function public.send_guest_support_message(p_conversation_id uuid, p_access_token text, p_message text) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_message_id uuid;
begin
  if p_access_token is null or length(p_access_token) <> 64 then raise exception 'Invalid support access token.'; end if;
  if char_length(btrim(coalesce(p_message,''))) not between 1 and 2000 then raise exception 'Message must be between 1 and 2000 characters.'; end if;
  if not exists (select 1 from public.support_conversations c where c.id = p_conversation_id and c.user_id is null and c.status <> 'resolved' and c.guest_token_hash = encode(extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256'), 'hex')) then raise exception 'This support conversation is unavailable or resolved.'; end if;
  if exists (select 1 from public.support_messages m where m.conversation_id = p_conversation_id and m.sender_type = 'guest' and m.created_at > now() - interval '2 seconds') then raise exception 'Please wait a moment before sending another message.'; end if;
  insert into public.support_messages(conversation_id, sender_type, body) values (p_conversation_id, 'guest', btrim(p_message)) returning id into v_message_id;
  update public.support_conversations set updated_at = now(), last_message_at = now(), status = 'open' where id = p_conversation_id;
  return v_message_id;
end; $$;
create or replace function public.admin_reply_support_message(p_conversation_id uuid, p_message text) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_admin_id uuid := auth.uid(); v_message_id uuid;
begin
  if v_admin_id is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if char_length(btrim(coalesce(p_message,''))) not between 1 and 2000 then raise exception 'Reply must be between 1 and 2000 characters.'; end if;
  if not exists (select 1 from public.support_conversations where id = p_conversation_id) then raise exception 'Conversation not found.'; end if;
  insert into public.support_messages(conversation_id, sender_type, sender_user_id, body) values (p_conversation_id, 'operator', v_admin_id, btrim(p_message)) returning id into v_message_id;
  update public.support_conversations set updated_at = now(), last_message_at = now(), status = 'pending' where id = p_conversation_id;
  return v_message_id;
end; $$;
create or replace function public.admin_update_support_status(p_conversation_id uuid, p_status text) returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if p_status not in ('open','pending','resolved') then raise exception 'Invalid support status.'; end if;
  update public.support_conversations set status = p_status, updated_at = now() where id = p_conversation_id;
  return found;
end; $$;
revoke all on function public.create_support_conversation(text,text) from public, anon;
revoke all on function public.send_support_message(uuid,text) from public, anon;
revoke all on function public.create_guest_support_conversation(text,text,text,text) from public, authenticated;
revoke all on function public.get_guest_support_messages(uuid,text) from public, authenticated;
revoke all on function public.send_guest_support_message(uuid,text,text) from public, authenticated;
revoke all on function public.admin_reply_support_message(uuid,text) from public, anon;
revoke all on function public.admin_update_support_status(uuid,text) from public, anon;
grant execute on function public.create_support_conversation(text,text) to authenticated;
grant execute on function public.send_support_message(uuid,text) to authenticated;
grant execute on function public.create_guest_support_conversation(text,text,text,text) to anon;
grant execute on function public.get_guest_support_messages(uuid,text) to anon;
grant execute on function public.send_guest_support_message(uuid,text,text) to anon;
grant execute on function public.admin_reply_support_message(uuid,text) to authenticated;
grant execute on function public.admin_update_support_status(uuid,text) to authenticated;
