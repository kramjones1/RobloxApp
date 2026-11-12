create or replace function public.get_admin_stats()
returns json
language plpgsql
security definer
set search_path to ''
as $function$
declare
  result json;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select json_build_object(
    'total_users', (select count(*) from auth.users),
    'chat_profiles', (select count(*) from public.chat_profiles),
    'profiles_missing', (
      select count(*) from auth.users u
      left join public.chat_profiles cp on cp.user_id = u.id
      where cp.user_id is null
    ),
    'total_messages', (select count(*) from public.chat_messages),
    'messages_today', (select count(*) from public.chat_messages where created_at > now() - interval '24 hours'),
    'flagged_users', (select count(*) from public.chat_profiles where flagged = true),
    'banned_users', (select count(*) from public.banned_users),
    'pending_reports', (select count(*) from public.reported_messages where dismissed = false),
    'storage_bytes', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o where o.metadata ? 'size'), 0),
    'storage_objects', (select count(*) from storage.objects),
    'storage_by_bucket', coalesce((
      select json_agg(json_build_object('bucket', b.bucket_id, 'objects', b.object_count, 'bytes', b.total_bytes) order by b.total_bytes desc)
      from (
        select o.bucket_id, count(*) as object_count, coalesce(sum((o.metadata->>'size')::bigint), 0) as total_bytes
        from storage.objects o group by o.bucket_id
      ) b
    ), '[]'::json),
    'database_bytes', pg_database_size(current_database()),
    'db_sessions', (select count(*) from pg_stat_activity a where a.datname = current_database()),
    'db_active_sessions', (select count(*) from pg_stat_activity a where a.datname = current_database() and a.state = 'active'),
    'messages_last_15m', (select count(*) from public.chat_messages where created_at > now() - interval '15 minutes'),
    'posts_last_15m', (select count(*) from public.chat_posts where created_at > now() - interval '15 minutes'),
    'active_chat_users_last_15m', (
      select count(distinct participant_id) from (
        select m.sender_id as participant_id from public.chat_messages m where m.created_at > now() - interval '15 minutes'
        union
        select m.receiver_id as participant_id from public.chat_messages m where m.created_at > now() - interval '15 minutes'
      ) recent_participants
    )
  ) into result;
  return result;
end;
$function$;
