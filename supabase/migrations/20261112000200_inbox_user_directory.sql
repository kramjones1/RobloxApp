-- Secure, minimal directory for the Inbox online-users rail.
-- Only authenticated users can enumerate limited public profile fields.
-- Hidden names remain anonymous; flagged and banned accounts are excluded.

create or replace function public.get_inbox_user_directory(p_limit integer default 100)
returns table(user_id uuid, display_name text, avatar_url text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_viewer uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if v_viewer is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    cp.user_id,
    case when cp.share_name then cp.display_name else 'Anonymous' end,
    case when cp.avatar_url like 'data:%' then '' else cp.avatar_url end
  from public.chat_profiles cp
  where cp.user_id <> v_viewer
    and cp.flagged is false
    and not exists (
      select 1 from public.banned_users bu where bu.user_id = cp.user_id
    )
  order by cp.updated_at desc, cp.user_id
  limit v_limit;
end;
$function$;

revoke all on function public.get_inbox_user_directory(integer) from public, anon;
grant execute on function public.get_inbox_user_directory(integer) to authenticated;
