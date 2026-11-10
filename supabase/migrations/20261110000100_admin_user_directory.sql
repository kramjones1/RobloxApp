-- LiveMe admin directory: list every Supabase Auth account, including accounts
-- that do not yet have a matching chat_profiles row.
-- Apply this migration manually only after reviewing it. It is not executed by CI.

create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total bigint;
  v_users jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select count(*)
    into v_total
  from auth.users u
  left join public.chat_profiles cp on cp.user_id = u.id
  where v_search is null
     or u.id::text ilike '%' || v_search || '%'
     or coalesce(u.email, '') ilike '%' || v_search || '%'
     or coalesce(cp.display_name, '') ilike '%' || v_search || '%';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', page.user_id,
        'email', page.email,
        'email_confirmed_at', page.email_confirmed_at,
        'created_at', page.created_at,
        'last_sign_in_at', page.last_sign_in_at,
        'profile_exists', page.profile_exists,
        'display_name', page.display_name,
        'flagged', page.flagged,
        'flag_reason', page.flag_reason,
        'banned', page.banned,
        'ban_reason', page.ban_reason
      ) order by page.created_at desc, page.user_id
    ),
    '[]'::jsonb
  )
  into v_users
  from (
    select
      u.id as user_id,
      u.email,
      u.email_confirmed_at,
      u.created_at,
      u.last_sign_in_at,
      (cp.user_id is not null) as profile_exists,
      cp.display_name,
      coalesce(cp.flagged, false) as flagged,
      cp.flag_reason,
      (bu.user_id is not null) as banned,
      bu.reason as ban_reason
    from auth.users u
    left join public.chat_profiles cp on cp.user_id = u.id
    left join public.banned_users bu on bu.user_id = u.id
    where v_search is null
       or u.id::text ilike '%' || v_search || '%'
       or coalesce(u.email, '') ilike '%' || v_search || '%'
       or coalesce(cp.display_name, '') ilike '%' || v_search || '%'
    order by u.created_at desc, u.id
    limit v_limit offset v_offset
  ) page;

  return jsonb_build_object(
    'users', v_users,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;

revoke all on function public.admin_list_users(text, integer, integer) from public;
revoke all on function public.admin_list_users(text, integer, integer) from anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;


-- Make the dashboard user total match Supabase Authentication.
create or replace function public.get_admin_stats()
returns json
language plpgsql
security definer
set search_path = ''
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
      select count(*)
      from auth.users u
      left join public.chat_profiles cp on cp.user_id = u.id
      where cp.user_id is null
    ),
    'total_messages', (select count(*) from public.chat_messages),
    'messages_today', (select count(*) from public.chat_messages where created_at > now() - interval '24 hours'),
    'flagged_users', (select count(*) from public.chat_profiles where flagged = true),
    'banned_users', (select count(*) from public.banned_users),
    'pending_reports', (select count(*) from public.reported_messages where dismissed = false)
  ) into result;

  return result;
end;
$function$;

revoke all on function public.get_admin_stats() from public;
revoke all on function public.get_admin_stats() from anon;
grant execute on function public.get_admin_stats() to authenticated;
